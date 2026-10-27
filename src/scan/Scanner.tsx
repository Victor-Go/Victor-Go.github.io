import { useEffect, useMemo, useRef, useState } from "react";
import { Field, Output } from "../cipher/components/Fields";
import {
  BadResponseError,
  NetworkError,
  NotFoundError,
  lookupAddress,
  lookupAddressPage,
  lookupBlock,
  priceDay,
  priceUsdAt,
  lookupTx,
  type AddressResult,
  type AddressTx,
  type BlockInfo,
  type TxInfo,
  type TxIO,
  type TxResult,
} from "./api";
import {
  EXT_ADDRESS_COUNT,
  classify,
  formatBtc,
  type DerivedAddress,
  type InvalidReason,
  type Query,
} from "./query";
import { deriveWallet, type WalletAddress } from "./mnemonic";
import { describeScript } from "./script";
import type { Messages } from "./i18n";

/** Public data sources throttle bursts, so a seed phrase's addresses are looked up a few at a time. */
const WALLET_CONCURRENCY = 4;
const WALLET_ADDRESSES_PER_TYPE = 5;

/**
 * Runs `fn` over `items` with at most `limit` in flight. The first failure cancels everything still
 * in flight and starts nothing new, so a refusing server is not asked about the remaining items.
 */
async function mapLimited<T, R>(
  items: T[],
  limit: number,
  signal: AbortSignal,
  fn: (item: T, signal: AbortSignal) => Promise<R>,
): Promise<R[]> {
  const own = new AbortController();
  const forward = () => own.abort(signal.reason);
  signal.addEventListener("abort", forward, { once: true });
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (!own.signal.aborted && next < items.length) {
      const i = next++;
      try {
        out[i] = await fn(items[i], own.signal);
      } catch (e) {
        own.abort();
        throw e;
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return out;
  } finally {
    signal.removeEventListener("abort", forward);
  }
}

interface WalletRow extends WalletAddress {
  result: AddressResult;
}

const MAX_ROWS = 50;
const GENESIS_TXID = "4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b";
/** Locktimes below this are block heights, at or above it Unix timestamps (consensus rule). */
const LOCKTIME_THRESHOLD = 500_000_000;

type Result =
  | { kind: "tx"; data: TxResult }
  | { kind: "rawtx"; tx: TxInfo }
  | { kind: "block"; data: BlockInfo }
  | { kind: "address"; data: AddressResult }
  | { kind: "pubkey"; fromPrivateKey: boolean; data: { type: DerivedAddress["type"]; result: AddressResult }[] }
  | { kind: "wallet"; note: string; rows: WalletRow[] };

function invalidMessage(reason: InvalidReason, m: Messages): string {
  switch (reason) {
    case "empty":
      return m.errEmpty;
    case "pubkey":
      return m.errPubkey;
    case "testnet":
      return m.errTestnet;
    case "bech32":
      return m.errBech32;
    case "base58":
      return m.errBase58;
    case "rawtx":
      return m.errRawtx;
    case "extkey":
      return m.errExtkey;
    case "wif":
      return m.errWif;
    case "mnemonic":
      return m.errMnemonic;
    default:
      return m.errFormat;
  }
}

function errorMessage(e: unknown, m: Messages): string {
  if (e instanceof NotFoundError) return m.errNotFound;
  if (e instanceof NetworkError) return m.errNetwork;
  if (e instanceof BadResponseError) return m.errBad;
  return m.errRetry;
}

function kindText(q: Query, m: Messages): string {
  switch (q.kind) {
    case "tx":
      return m.kindTx;
    case "address":
      return m.kindAddress;
    case "pubkey":
      return q.fromPrivateKey ? m.kindWif : m.kindPubkey;
    case "block":
      return m.kindBlock;
    case "rawtx":
      return m.kindRawtx;
    case "extkey":
      return m.kindExtkey(q.flavor, q.isPrivate);
    case "mnemonic":
      return m.kindMnemonic(q.scheme);
    default:
      return "";
  }
}

/** The `?q=` search param holds the query, so back/forward step through lookups and links can be shared. */
const urlQuery = () => new URLSearchParams(location.search).get("q") ?? "";

/**
 * Only public lookups may appear in the address bar (it ends up in history, bookmarks and referrers):
 * never a seed phrase, private key or extended private key, and never a pasted raw transaction.
 */
function inUrl(q: Query): boolean {
  switch (q.kind) {
    case "tx":
    case "block":
    case "address":
      return true;
    case "pubkey":
      return !q.fromPrivateKey;
    case "extkey":
      return !q.isPrivate;
    default:
      return false;
  }
}

export function Scanner({ m }: { m: Messages }) {
  const [text, setText] = useState(() => (inUrl(classify(urlQuery())) ? urlQuery() : ""));
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const ctl = useRef<AbortController | null>(null);

  // Leaving the page (or the wipe remounting this component) cancels anything in flight.
  useEffect(() => () => ctl.current?.abort(), []);

  const query = useMemo(() => classify(text), [text]);

  const run = async (input: string, push = true) => {
    const q = classify(input);
    setResult(null);
    if (q.kind === "invalid") {
      setError(invalidMessage(q.reason, m));
      return;
    }
    const trimmed = input.trim();
    if (push && inUrl(q) && urlQuery() !== trimmed) {
      history.pushState(null, "", `${location.pathname}?q=${encodeURIComponent(trimmed)}`);
    }
    ctl.current?.abort();
    setBusy(false);
    setError("");
    // A raw transaction is answered from the input alone: no request is made.
    if (q.kind === "rawtx") {
      setResult({ kind: "rawtx", tx: q.tx });
      return;
    }
    const c = new AbortController();
    ctl.current = c;
    setBusy(true);
    try {
      if (q.kind === "tx") setResult({ kind: "tx", data: await lookupTx(q.txid, c.signal) });
      else if (q.kind === "block") setResult({ kind: "block", data: await lookupBlock(q.ref, c.signal) });
      else if (q.kind === "address") setResult({ kind: "address", data: await lookupAddress(q.address, c.signal) });
      else if (q.kind === "mnemonic" || q.kind === "extkey") {
        // Every protocol the pasted format can use is derived and looked up (see lookupList).
        // Key stretching blocks briefly, so it happens here on click, never while typing.
        const derived: WalletAddress[] =
          q.kind === "mnemonic"
            ? deriveWallet(q.scheme, q.phrase, passphrase, WALLET_ADDRESSES_PER_TYPE)
            : q.addresses.map((a) => ({ type: a.type, path: "m/0/${a.index}", address: a.address }));
        const rows = await mapLimited(derived, WALLET_CONCURRENCY, c.signal, async (w, signal) => ({
          ...w,
          result: await lookupAddress(w.address, signal, undefined, false),
        }));
        const note = q.kind === "mnemonic" ? m.mnemonicNote(WALLET_ADDRESSES_PER_TYPE) : m.extNote(q.isPrivate, EXT_ADDRESS_COUNT);
        setResult({ kind: "wallet", note, rows });
      } else {
        const all = await Promise.all(
          q.addresses.map(async (a) => ({ type: a.type, result: await lookupAddress(a.address, c.signal, a.script) })),
        );
        setResult({ kind: "pubkey", fromPrivateKey: q.fromPrivateKey, data: all });
      }
    } catch (e) {
      if (c.signal.aborted) return;
      setError(errorMessage(e, m));
    } finally {
      if (ctl.current === c) setBusy(false);
    }
  };

  // Clicking an address or txid inside a result looks that one up.
  // Typing or pasting makes the shown result stale, so drop it (and any request still in flight)
  // rather than leave an answer next to a question it no longer belongs to.
  const reset = () => {
    ctl.current?.abort();
    setBusy(false);
    setResult(null);
    setError("");
  };
  const edit = (set: (v: string) => void) => (v: string) => {
    reset();
    set(v);
  };

  // Back/forward (and opening a shared link) re-run the query the address bar holds.
  const sync = useRef<() => void>(() => {});
  sync.current = () => {
    const q = urlQuery();
    if (q && inUrl(classify(q))) {
      setText(q);
      void run(q, false);
    } else {
      reset();
      setText("");
    }
  };
  useEffect(() => {
    const onPop = () => sync.current();
    window.addEventListener("popstate", onPop);
    if (urlQuery()) sync.current();
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const follow = (value: string) => {
    setText(value);
    void run(value);
  };

  const kindLabel = kindText(query, m);

  return (
    <div className="c-panel s-panel">
      <Field label={m.inputLabel} value={text} onChange={edit(setText)} m={m} rows={3} />
      <p className="c-hint">{m.inputHint}</p>
      {query.kind === "mnemonic" && (
        <Field label={m.passphraseLabel} value={passphrase} onChange={edit(setPassphrase)} m={m} secret singleLine />
      )}
      {kindLabel && (
        <p className="c-hint" role="status">
          {m.detected}
          {kindLabel}
        </p>
      )}
      <button type="button" className="c-primary" disabled={busy} onClick={() => void run(text)}>
        {busy ? m.searching : m.search}
      </button>
      {error && <p role="alert" className="c-error">{error}</p>}
      {result?.kind === "tx" && <TxCard tx={result.data.tx} confirmations={result.data.confirmations} m={m} follow={follow} />}
      {result?.kind === "rawtx" && <TxCard tx={result.tx} local m={m} follow={follow} />}
      {result?.kind === "block" && <BlockCard block={result.data} m={m} follow={follow} />}
      {result?.kind === "address" && <AddressCard data={result.data} m={m} follow={follow} />}
      {result?.kind === "wallet" && <WalletCard rows={result.rows} note={result.note} m={m} follow={follow} />}
      {result?.kind === "pubkey" && (
        <>
          {result.fromPrivateKey && <p className="c-hint">{m.privateNote}</p>}
          <p className="c-hint">{m.pubkeyNote}</p>
          <div className="c-cols">
            {result.data.map((r) => (
              <AddressCard
                key={r.type}
                data={r.result}
                label={m.typeLabel(r.type)}
                addrLabel={r.type === "p2pk" ? m.pubkeyLabel : undefined}
                m={m}
                follow={follow}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

type Follow = (value: string) => void;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="s-kv">
      <span className="s-k">{label}</span>
      <span className="s-v">{children}</span>
    </div>
  );
}

function Link({ value, m, follow, children }: { value: string; m: Messages; follow: Follow; children?: React.ReactNode }) {
  return (
    <button type="button" className="c-link s-mono" title={m.lookupThis} onClick={() => follow(value)}>
      {children ?? value}
    </button>
  );
}

const short = (h: string) => `${h.slice(0, 12)}…${h.slice(-6)}`;
const abbr = (h: string) => `${h.slice(0, 8)}…${h.slice(-8)}`;
const usdText = (n: number, digits: number) => n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Who an input or output belongs to: an address, or for address-less scripts what kind of script it is. */
function Party({ io, m, follow }: { io: TxIO; m: Messages; follow: Follow }) {
  if (io.coinbase) return <>{m.coinbase}</>;
  if (io.address) return <Link value={io.address} m={m} follow={follow} />;
  if (io.script) {
    const info = describeScript(io.script);
    const label = m.scriptKind(info.kind);
    if (info.kind === "p2pk" && info.pubkeys) {
      return (
        <Link value={info.pubkeys[0]} m={m} follow={follow}>
          {label}
        </Link>
      );
    }
    if (info.kind === "multisig" && info.pubkeys && info.m !== undefined) {
      return <>{`${label} ${m.multisigOf(info.m, info.pubkeys.length)}`}</>;
    }
    if (info.kind === "opreturn") {
      const data = info.data ?? "";
      return <span className="s-mono">{`${label} ${data.slice(0, 80)}${data.length > 80 ? "…" : ""}`}</span>;
    }
    return <>{label}</>;
  }
  if (io.prev) {
    return (
      <>
        {m.spends}{" "}
        <Link value={io.prev.txid} m={m} follow={follow}>
          {short(io.prev.txid)}:{io.prev.vout}
        </Link>
      </>
    );
  }
  return <>{m.noAddress}</>;
}

function IoList({ rows, title, m, follow }: { rows: TxIO[]; title: string; m: Messages; follow: Follow }) {
  return (
    <section className="s-io" aria-label={title}>
      <p className="b-group-title">{title}</p>
      {rows.slice(0, MAX_ROWS).map((r, i) => (
        <div key={i} className="s-io-row">
          <span className="s-io-addr">
            <Party io={r} m={m} follow={follow} />
          </span>
          {!r.coinbase && <span className="s-amount">{r.value === undefined ? m.unknownAmount : formatBtc(r.value)}</span>}
        </div>
      ))}
      {rows.length > MAX_ROWS && <p className="c-hint">{m.moreRows(rows.length - MAX_ROWS)}</p>}
    </section>
  );
}

function feeRate(tx: TxInfo): string | undefined {
  if (tx.fee === undefined || tx.weight === 0) return undefined;
  return (tx.fee / (tx.weight / 4)).toFixed(2);
}

function lockText(locktime: number, m: Messages): string {
  if (locktime === 0) return "0";
  return locktime < LOCKTIME_THRESHOLD
    ? `${locktime} (${m.lockHeight(locktime)})`
    : `${locktime} (${m.lockTimestamp(new Date(locktime * 1000).toLocaleString())})`;
}

function TxCard({
  tx,
  confirmations = 0,
  local = false,
  m,
  follow,
}: {
  tx: TxInfo;
  confirmations?: number;
  local?: boolean;
  m: Messages;
  follow: Follow;
}) {
  const rate = feeRate(tx);
  return (
    <article className="b-card" aria-label={m.txTitle}>
      <header className="b-card-head">
        <strong>{m.txTitle}</strong>
      </header>
      {local && (
        <>
          <p className="c-hint">{m.localDecoded}</p>
          <button type="button" className="c-link" onClick={() => follow(tx.txid)}>
            {m.lookupOnline}
          </button>
        </>
      )}
      {tx.txid === GENESIS_TXID && <p className="c-hint">{m.genesisTx}</p>}
      <Output label={m.txid} value={tx.txid} m={m} rows={2} />
      {!local && <Row label={m.status}>{tx.confirmed ? m.statusConfirmed(confirmations) : m.statusUnconfirmed}</Row>}
      {tx.confirmed && tx.height !== undefined && <Row label={m.block}>{tx.height}</Row>}
      {tx.time !== undefined && <Row label={m.time}>{new Date(tx.time * 1000).toLocaleString()}</Row>}
      {tx.fee !== undefined && (
        <Row label={m.fee}>
          {formatBtc(tx.fee)} BTC{rate && ` (${m.feeRate(rate)})`}
        </Row>
      )}
      <Row label={m.size}>{m.sizeValue(tx.size, tx.weight)}</Row>
      {tx.version !== undefined && <Row label={m.version}>{tx.version}</Row>}
      {tx.locktime !== undefined && <Row label={m.locktime}>{lockText(tx.locktime, m)}</Row>}
      {tx.segwit !== undefined && <Row label={m.segwit}>{tx.segwit ? m.yes : m.no}</Row>}
      {tx.rbf !== undefined && <Row label={m.rbf}>{tx.rbf ? m.yes : m.no}</Row>}
      <div className="c-cols">
        <IoList rows={tx.vin} title={m.inputs(tx.vin.length)} m={m} follow={follow} />
        <IoList rows={tx.vout} title={m.outputs(tx.vout.length)} m={m} follow={follow} />
      </div>
    </article>
  );
}

const hex32 = (n: number) => `0x${n.toString(16).padStart(8, "0")}`;

function BlockCard({ block, m, follow }: { block: BlockInfo; m: Messages; follow: Follow }) {
  return (
    <article className="b-card" aria-label={m.blockTitle}>
      <header className="b-card-head">
        <strong>
          {m.blockTitle} {block.height}
        </strong>
      </header>
      {block.height === 0 && <p className="c-hint">{m.genesisBlock}</p>}
      <Output label={m.blockHash} value={block.hash} m={m} rows={2} />
      <Row label={m.blockTime}>{new Date(block.time * 1000).toLocaleString()}</Row>
      <Row label={m.blockTxCount}>{block.txCount}</Row>
      <Row label={m.size}>{m.sizeValue(block.size, block.weight)}</Row>
      <Row label={m.blockVersion}>{hex32(block.version)}</Row>
      <Row label={m.merkleRoot}>
        <span className="s-mono">{block.merkleRoot}</span>
      </Row>
      <Row label={m.nonce}>{block.nonce}</Row>
      <Row label={m.bits}>{hex32(block.bits)}</Row>
      <Row label={m.difficulty}>{block.difficulty.toLocaleString("en-US", { maximumFractionDigits: 2 })}</Row>
      {block.prevHash && (
        <Row label={m.prevBlock}>
          <Link value={block.prevHash} m={m} follow={follow}>
            {block.height - 1}
          </Link>
        </Row>
      )}
      <Row label={m.nextBlock}>
        <Link value={String(block.height + 1)} m={m} follow={follow} />
      </Row>
      <section aria-label={m.blockTxs(block.txids.length, block.txCount)}>
        <p className="b-group-title">{m.blockTxs(block.txids.length, block.txCount)}</p>
        {block.txids.map((id) => (
          <div key={id} className="s-io-row">
            <span className="s-io-addr">
              <Link value={id} m={m} follow={follow} />
            </span>
          </div>
        ))}
      </section>
    </article>
  );
}

function WalletCard({ rows, note, m, follow }: { rows: WalletRow[]; note: string; m: Messages; follow: Follow }) {
  const types = [...new Set(rows.map((r) => r.type))];
  const sum = (rs: WalletRow[]) => rs.reduce((s, r) => s + r.result.balance, 0);
  return (
    <>
      <p className="c-hint">{note}</p>
      <Row label={m.walletTotal}>{formatBtc(sum(rows))} BTC</Row>
      <div className="c-cols">
        {types.map((t) => {
          const mine = rows.filter((r) => r.type === t);
          // A type with no history is just an unused path of the same seed: keep it out of the way.
          const used = mine.some((r) => r.result.txCount > 0 || r.result.balance !== 0 || r.result.unconfirmed !== 0);
          return (
            <details key={t} className="b-card" open={used} aria-label={m.typeLabel(t)}>
              <summary className="b-card-head">
                <strong>{m.walletType(m.typeLabel(t), formatBtc(sum(mine)))}</strong>
                {!used && <span className="c-hint"> {m.walletUnused}</span>}
              </summary>
              {mine.map((r) => (
                <div key={r.path} className="s-io-row">
                  <span className="s-io-addr">
                    <span className="c-hint">{r.path} </span>
                    <Link value={r.address} m={m} follow={follow} />
                    <span className="c-hint"> {m.txCount} {r.result.txCount}</span>
                  </span>
                  <span className="s-amount">{formatBtc(r.result.balance)}</span>
                </div>
              ))}
            </details>
          );
        })}
      </div>
    </>
  );
}

function AddressCard({
  data,
  label,
  addrLabel,
  m,
  follow,
}: {
  data: AddressResult;
  label?: string;
  addrLabel?: string;
  m: Messages;
  follow: Follow;
}) {
  return (
    <article className="b-card" aria-label={label ?? m.addrTitle}>
      <header className="b-card-head">
        <strong>{label ?? m.addrTitle}</strong>
      </header>
      <Output label={addrLabel ?? m.addrTitle} value={data.address} m={m} rows={addrLabel ? 3 : 1} />
      <Row label={m.balance}>{formatBtc(data.balance)} BTC</Row>
      {data.unconfirmed !== 0 && <Row label={m.pending}>{formatBtc(data.unconfirmed)} BTC</Row>}
      <Row label={m.received}>{formatBtc(data.received)} BTC</Row>
      <Row label={m.txCount}>{data.txCount}</Row>
      {data.txCount === 0 ? <p className="c-hint">{m.noTxs}</p> : <TxHistory data={data} m={m} follow={follow} />}
    </article>
  );
}

/** The cursor for the next history page: the oldest confirmed transaction on this one. */
function lastConfirmed(page: AddressTx[]): string | undefined {
  for (let i = page.length - 1; i >= 0; i--) if (page[i].tx.confirmed) return page[i].tx.txid;
  return undefined;
}

/**
 * An address's transactions, newest first. Esplora hands out history by cursor, so pages are fetched
 * in order, kept for going back, and dropped when a different result is shown.
 */
function TxHistory({ data, m, follow }: { data: AddressResult; m: Messages; follow: Follow }) {
  const fresh = { src: data, pages: [data.txs], page: 0 };
  const [state, setState] = useState(fresh);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ctl = useRef<AbortController | null>(null);
  useEffect(() => () => ctl.current?.abort(), []);

  const cur = state.src === data ? state : fresh;
  const rows = cur.pages[cur.page];
  const before = cur.pages.slice(0, cur.page).reduce((n, p) => n + p.length, 0);
  const loaded = cur.pages.reduce((n, p) => n + p.length, 0);
  const cursor = lastConfirmed(rows);
  const hasNext = cur.page + 1 < cur.pages.length || (cursor !== undefined && data.txCount > loaded);

  const goNext = async () => {
    setError("");
    if (cur.page + 1 < cur.pages.length) {
      setState({ ...cur, page: cur.page + 1 });
      return;
    }
    if (!cursor) return;
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setBusy(true);
    try {
      const next = await lookupAddressPage(data.address, cursor, c.signal, data.script);
      if (c.signal.aborted) return;
      setState({ ...cur, pages: [...cur.pages, next], page: cur.page + 1 });
    } catch (e) {
      if (!c.signal.aborted) setError(errorMessage(e, m));
    } finally {
      if (ctl.current === c) setBusy(false);
    }
  };

  // Approximate historical prices (one lookup per distinct day), shown as they arrive.
  const [prices, setPrices] = useState<Record<number, number>>({});
  useEffect(() => {
    const c = new AbortController();
    const days = [...new Set(rows.flatMap(({ tx }) => (tx.time !== undefined ? [priceDay(tx.time)] : [])))];
    for (const day of days) {
      void priceUsdAt(day, c.signal).then((usd) => {
        if (usd !== undefined && !c.signal.aborted) setPrices((p) => (p[day] === undefined ? { ...p, [day]: usd } : p));
      });
    }
    return () => c.abort();
  }, [rows]);

  // The confirmed balance is known for "now"; walking back through the newer transactions gives the
  // balance right after each one. Unconfirmed ones are not part of it.
  const balances = new Map<string, number>();
  let running = data.balance;
  for (const p of cur.pages.slice(0, cur.page + 1)) {
    for (const { tx, net } of p) {
      if (!tx.confirmed) continue;
      balances.set(tx.txid, running);
      running -= net;
    }
  }

  const title = m.txRange(before + 1, before + rows.length, data.txCount);
  return (
    <section aria-label={title}>
      <p className="b-group-title">{title}</p>
      {rows.map(({ tx, net }) => {
        const price = tx.time !== undefined ? prices[priceDay(tx.time)] : undefined;
        const balance = balances.get(tx.txid);
        return (
          <div key={tx.txid} className="s-io-row">
            <span className="s-io-addr">
              <Link value={tx.txid} m={m} follow={follow}>
                {abbr(tx.txid)}
              </Link>
              <span className="c-hint">{tx.confirmed ? ` #${tx.height}` : ` ${m.unconfirmedMark}`}</span>
            </span>
            <span className={net >= 0 ? "s-amount s-pos" : "s-amount s-neg"}>
              {net > 0 ? "+" : ""}
              {formatBtc(net)}
            </span>
            <span className="s-tx-meta c-hint">
              {[
                tx.time !== undefined ? `${m.txTime} ${new Date(tx.time * 1000).toLocaleString()}` : undefined,
                balance !== undefined ? `${m.balanceAfter} ${formatBtc(balance)} BTC` : undefined,
                balance !== undefined && price !== undefined
                  ? m.worthAt(usdText((balance / 1e8) * price, 0), usdText(price, 2))
                  : undefined,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
        );
      })}
      {(cur.page > 0 || hasNext) && (
        <nav className="s-pager" aria-label={m.pager}>
          <button type="button" disabled={busy || cur.page === 0} onClick={() => setState({ ...cur, page: cur.page - 1 })}>
            {m.prevPage}
          </button>
          <span className="c-hint">{m.pageNumber(cur.page + 1)}</span>
          <button type="button" disabled={busy || !hasNext} onClick={() => void goNext()}>
            {busy ? m.searching : m.nextPage}
          </button>
        </nav>
      )}
      {error && <p role="alert" className="c-error">{error}</p>}
    </section>
  );
}
