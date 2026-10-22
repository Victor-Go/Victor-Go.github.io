import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { App } from '../App';
import { ALGORITHMS, hashHex } from '../hash';

const ABC: Record<string, string> = {
  md5: '900150983cd24fb0d6963f7d28e17f72',
  sha1: 'a9993e364706816aba3e25717850c26c9cd0d89d',
  sha224: '23097d223405d8228642a477bda255b32aadbce4bda0b3f7e36c9da7',
  sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  sha384: 'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7',
  sha512: 'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
  'sha3-256': '3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532',
  keccak256: '4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45',
  ripemd160: '8eb208f7e05d987a9b044a8e98c6b087f15a0bfc',
};

describe('hashHex', () => {
  it('matches the known digests of "abc"', () => {
    for (const [id, hex] of Object.entries(ABC)) expect(hashHex(id, 'abc'), id).toBe(hex);
  });

  it('accepts raw bytes and every listed algorithm works', () => {
    expect(hashHex('md5', new Uint8Array([97, 98, 99]))).toBe(ABC.md5);
    for (const a of ALGORITHMS) expect(hashHex(a.id, ''), a.id).toMatch(/^[0-9a-f]+$/);
  });

  it('rejects unknown algorithms', () => {
    expect(() => hashHex('nope', 'abc')).toThrow();
  });
});

describe('hash page', () => {
  it('hashes typed text with the chosen algorithm and shows both cases', () => {
    render(<App />);
    fireEvent.change(screen.getByRole('textbox', { name: /^要计算的文本/ }), { target: { value: 'abc' } });
    expect((screen.getByRole('textbox', { name: '哈希值(小写)' }) as HTMLTextAreaElement).value).toBe(ABC.sha256);
    fireEvent.change(screen.getByRole('combobox', { name: '哈希算法' }), { target: { value: 'md5' } });
    expect((screen.getByRole('textbox', { name: '哈希值(小写)' }) as HTMLTextAreaElement).value).toBe(ABC.md5);
    expect((screen.getByRole('textbox', { name: '哈希值(大写)' }) as HTMLTextAreaElement).value).toBe(ABC.md5.toUpperCase());
    expect(screen.getByText(/碰撞可被轻易构造/)).toBeTruthy();
  });

  it('hashes a chosen file and re-hashes when the algorithm changes', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: '文件' }));
    const file = new File(['abc'], 'a.txt');
    fireEvent.change(document.querySelector('input[type=file]')!, { target: { files: [file] } });
    const box = async (name: string) => ((await screen.findByRole('textbox', { name })) as HTMLTextAreaElement).value;
    expect(await box('哈希值(小写)')).toBe(ABC.sha256);
    fireEvent.change(screen.getByRole('combobox', { name: '哈希算法' }), { target: { value: 'sha1' } });
    expect(await box('哈希值(小写)')).toBe(ABC.sha1);
  });
});
