import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Scanner } from '../Scanner';
import { messages } from '../i18n';

const ABANDON = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const USED = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu'; // BIP84 m/84'/0'/0'/0/0 of the phrase above

afterEach(() => {
  vi.unstubAllGlobals();
  history.replaceState(null, '', '/');
});

describe('seed phrase lookup', () => {
  it('opens only the address types with history and folds the unused ones', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        const used = url.endsWith(`/address/${USED}`);
        const n = used ? 2 : 0;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              chain_stats: { funded_txo_sum: used ? 7_000 : 0, spent_txo_sum: 0, tx_count: n },
              mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 },
            }),
          ),
        );
      }),
    );
    render(<Scanner m={messages.zh} />);
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: ABANDON } });
    fireEvent.click(screen.getByRole('button', { name: messages.zh.search }));

    await waitFor(() => expect(document.querySelectorAll('details').length).toBe(4));
    const open = [...document.querySelectorAll('details')].map((d) => d.open);
    expect(open).toEqual([false, false, true, false]); // P2PKH, P2SH-P2WPKH, P2WPKH, Taproot
    expect(screen.getAllByText(/0\.00007000 BTC/).length).toBeGreaterThan(0);
    // Every address was asked about; the transaction list is skipped for a balance overview.
    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map(([u]) => u as string);
    expect(calls).toHaveLength(20); // 4 types x 5 addresses
    expect(calls.some((u) => u.endsWith('/txs'))).toBe(false);
  });
});

describe('address history pages', () => {
  const ADDR = '1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH';
  const id = (n: number) => n.toString(16).padStart(64, '0');
  const mk = (n: number) => ({
    txid: id(n),
    size: 100,
    weight: 400,
    status: { confirmed: true, block_height: 1000 - n, block_time: 1_600_000_000 },
    vin: [],
    vout: [{ scriptpubkey_address: ADDR, value: 1000 }],
  });
  const page = (from: number, count: number) => Array.from({ length: count }, (_, i) => mk(from + i));

  it('walks to the next page by cursor, goes back from cache, and ends when the history does', async () => {
    const f = vi.fn((url: string) => {
      const body = url.endsWith('/txs/chain/' + id(25))
        ? page(26, 5)
        : url.endsWith('/txs')
          ? page(1, 25)
          : { chain_stats: { funded_txo_sum: 30_000, spent_txo_sum: 0, tx_count: 30 }, mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 } };
      return Promise.resolve(new Response(JSON.stringify(body)));
    });
    vi.stubGlobal('fetch', f);
    render(<Scanner m={messages.zh} />);
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: ADDR } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    const next = await screen.findByRole('button', { name: '下一页' });
    expect((screen.getByRole('button', { name: '上一页' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/第 1–25 笔/)).toBeTruthy();

    fireEvent.click(next);
    await screen.findByText(/第 26–30 笔/);
    expect(f.mock.calls.some(([u]) => String(u).endsWith('/txs/chain/' + id(25)))).toBe(true);
    expect((screen.getByRole('button', { name: '下一页' }) as HTMLButtonElement).disabled).toBe(true);

    // Price lookups (one per day, mempool.space only) may land at any time; they are not history requests.
    const history = () => f.mock.calls.filter(([u]) => !String(u).includes('historical-price')).length;
    const calls = history();
    fireEvent.click(screen.getByRole('button', { name: '上一页' }));
    await screen.findByText(/第 1–25 笔/);
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    await screen.findByText(/第 26–30 笔/);
    expect(history()).toBe(calls); // both moves came from the cache
  });
});

describe('editing the input', () => {
  const ADDR = '1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH';
  const stats = { chain_stats: { funded_txo_sum: 5_000, spent_txo_sum: 0, tx_count: 0 }, mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 } };

  it('clears the previous result and error as soon as the text changes', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify(stats)))));
    render(<Scanner m={messages.zh} />);
    const input = screen.getAllByRole('textbox')[0];

    fireEvent.change(input, { target: { value: ADDR } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));
    await screen.findByRole('article');
    fireEvent.change(input, { target: { value: ADDR + 'x' } });
    expect(screen.queryByRole('article')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '查询' }));
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('following a link inside a result still shows the new lookup', async () => {
    const TXID = 'ab'.repeat(32);
    const tx = {
      txid: TXID,
      size: 100,
      weight: 400,
      status: { confirmed: true, block_height: 5, block_time: 1_600_000_000 },
      vin: [],
      vout: [{ scriptpubkey_address: ADDR, value: 5_000 }],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        const u = String(url);
        const body = u.endsWith('/txs')
          ? [tx]
          : u.endsWith('/blocks/tip/height')
            ? 10
            : u.includes('/tx/')
              ? tx
              : { ...stats, chain_stats: { ...stats.chain_stats, tx_count: 1 } };
        return Promise.resolve(new Response(JSON.stringify(body)));
      }),
    );
    render(<Scanner m={messages.zh} />);
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: ADDR } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));
    fireEvent.click(await screen.findByRole('button', { name: `${TXID.slice(0, 8)}…${TXID.slice(-8)}` }));
    expect(await screen.findByRole('article', { name: '交易' })).toBeTruthy();
    expect((screen.getAllByRole('textbox')[0] as HTMLTextAreaElement).value).toBe(TXID);
  });
});

describe('protocols inferred from the pasted format', () => {
  const G = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
  const U =
    '0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8';
  const XPUB = 'xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8';
  const ZPUB = 'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';
  const empty = { chain_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 }, mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 } };
  const stub = () => {
    const f = vi.fn(() => Promise.resolve(new Response(JSON.stringify(empty))));
    vi.stubGlobal('fetch', f);
    return f;
  };
  const urls = (f: ReturnType<typeof stub>) => (f.mock.calls as unknown as [string][]).map(([u]) => u);
  const lookup = async (input: string) => {
    const f = stub();
    render(<Scanner m={messages.zh} />);
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: input } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));
    return f;
  };
  const settle = () => new Promise((r) => setTimeout(r, 50));

  it('queries all five protocols a compressed key can use, P2PK included, with no option to tick', async () => {
    const f = await lookup(G);
    await waitFor(() => expect(f).toHaveBeenCalledTimes(5));
    expect(urls(f).filter((u) => u.includes('/scripthash/'))).toHaveLength(1);
    expect(urls(f).some((u) => u.includes('/address/bc1p'))).toBe(true);
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('queries only P2PKH and P2PK for an uncompressed key, never a SegWit address that could not exist', async () => {
    const f = await lookup(U);
    await waitFor(() => expect(f).toHaveBeenCalledTimes(2));
    await settle();
    expect(f).toHaveBeenCalledTimes(2);
    expect(urls(f).some((u) => u.includes('/scripthash/'))).toBe(true);
    expect(urls(f).some((u) => u.includes('/address/1EHNa6Q4Jz2uvNExL497mE43ikXhwF6kZm'))).toBe(true);
    expect(urls(f).some((u) => u.includes('/address/bc1'))).toBe(false);
  });

  it('looks up an xpub under all four mainstream protocols, but a zpub only under its own', async () => {
    const x = await lookup(XPUB);
    await waitFor(() => expect(x).toHaveBeenCalledTimes(20)); // 4 protocols x 5 addresses
    expect(urls(x).some((u) => u.includes('/scripthash/'))).toBe(false); // no hierarchical wallet holds P2PK
    cleanup();
    history.replaceState(null, '', '/'); // a remount would otherwise re-run the xpub the address bar still holds
    const z = await lookup(ZPUB);
    await waitFor(() => expect(z).toHaveBeenCalledTimes(5));
    await settle();
    expect(z).toHaveBeenCalledTimes(5);
    expect(urls(z).every((u) => u.includes('/address/bc1q'))).toBe(true);
  });

  it('never filters an address the user typed in', async () => {
    const taproot = 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr';
    const f = await lookup(taproot);
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1));
    expect(urls(f)[0]).toContain(taproot);
  });
});

describe('following a pay-to-pubkey output', () => {
  const KEY = '0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8';
  const TXID = 'cd'.repeat(32);
  const tx = {
    txid: TXID,
    size: 134,
    weight: 536,
    status: { confirmed: true, block_height: 1, block_time: 1_231_469_665 },
    vin: [{ is_coinbase: true, prevout: null, txid: '0'.repeat(64), vout: 4294967295, sequence: 4294967295 }],
    vout: [{ scriptpubkey: '41' + KEY + 'ac', scriptpubkey_type: 'p2pk', value: 5_000_000_000 }],
  };
  const empty = { chain_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 }, mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 } };

  it('looks up that P2PK script without any option being ticked', async () => {
    const f = vi.fn((url: string) => {
      const u = String(url);
      const body = u.includes('/tx/') ? tx : u.endsWith('/blocks/tip/height') ? 100 : empty;
      return Promise.resolve(new Response(JSON.stringify(body)));
    });
    vi.stubGlobal('fetch', f);
    render(<Scanner m={messages.zh} />);
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: TXID } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));
    fireEvent.click(await screen.findByRole('button', { name: /P2PK 公钥脚本/ }));

    await waitFor(() => expect((f.mock.calls as unknown as [string][]).some(([u]) => u.includes('/scripthash/'))).toBe(true));
  });
});

describe('a refusing server is not asked about the rest', () => {
  it('stops a 20-address wallet lookup after the first failures instead of sending them all', async () => {
    const f = vi.fn(() => Promise.resolve(new Response('', { status: 429 })));
    vi.stubGlobal('fetch', f);
    render(<Scanner m={messages.zh} />);
    const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: phrase } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    // 4 lookups start, each asks the 2 providers once; nothing after the first failure.
    expect(f.mock.calls.length).toBeLessThanOrEqual(8);
  });
});
