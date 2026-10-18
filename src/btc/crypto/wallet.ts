import { entropyToMnemonic, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { HDKey } from "@scure/bip32";
import { NETWORK, WIF, p2wpkh } from "@scure/btc-signer";

export const WORD_COUNT = 24;
const ENTROPY_BYTES = 32;
const LABEL = new TextEncoder().encode("btc-wallet/v1");

export interface Address {
  index: number;
  path: string;
  address: string;
  /** Wallet Import Format of this address's key. Only shown on explicit request. */
  wif: string;
}

/**
 * 32 bytes from the OS CSPRNG, optionally mixed with user-supplied text through SHA-256.
 * Hashing the CSPRNG output together with extra input can never make it weaker than the CSPRNG
 * alone, but protects against a browser whose random source is silently broken.
 */
export function generateEntropy(extra = "", random: (n: number) => Uint8Array = defaultRandom): Uint8Array {
  const rnd = random(ENTROPY_BYTES);
  if (rnd.length !== ENTROPY_BYTES || rnd.every((b) => b === rnd[0])) throw new Error("random-source");
  const extraBytes = new TextEncoder().encode(extra);
  const buf = new Uint8Array(LABEL.length + rnd.length + extraBytes.length);
  buf.set(LABEL, 0);
  buf.set(rnd, LABEL.length);
  buf.set(extraBytes, LABEL.length + rnd.length);
  const out = sha256(buf);
  rnd.fill(0);
  buf.fill(0);
  return out;
}

function defaultRandom(n: number): Uint8Array {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

export function generateMnemonic24(extra = ""): string {
  const entropy = generateEntropy(extra);
  try {
    return entropyToMnemonic(entropy, wordlist);
  } finally {
    entropy.fill(0);
  }
}

/** Normalizes whitespace and case; true only for 24 words with a valid BIP-39 checksum. */
export function normalizeMnemonic(text: string): string {
  return text.trim().toLowerCase().split(/\s+/).join(" ");
}

export function isValidMnemonic24(text: string): boolean {
  const m = normalizeMnemonic(text);
  return m.split(" ").length === WORD_COUNT && validateMnemonic(m, wordlist);
}

/** BIP-84 native SegWit receive addresses: m/84'/0'/0'/0/i (bc1q…). */
export function deriveAddresses(mnemonic: string, count = 5): Address[] {
  const seed = mnemonicToSeedSync(normalizeMnemonic(mnemonic));
  try {
    const root = HDKey.fromMasterSeed(seed);
    const out: Address[] = [];
    for (let index = 0; index < count; index++) {
      const path = `m/84'/0'/0'/0/${index}`;
      const child = root.derive(path);
      if (!child.privateKey || !child.publicKey) throw new Error("derive");
      out.push({
        index,
        path,
        address: p2wpkh(child.publicKey, NETWORK).address!,
        wif: WIF(NETWORK).encode(child.privateKey),
      });
    }
    return out;
  } finally {
    seed.fill(0);
  }
}
