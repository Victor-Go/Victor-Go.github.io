import { Address, NETWORK } from "@scure/btc-signer";
import { pubECDSA } from "@scure/btc-signer/utils.js";
import { createBase58check } from "@scure/base";
import { HDKey } from "@scure/bip32";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import type { BlockRef, TxInfo } from "./api";
import { addressFor, type AddrType, type AddressableType } from "./derive";
import { detectMnemonic, type MnemonicScheme } from "./mnemonic";
import { lookupList } from "./protocols";
import { decodeRawTx } from "./rawtx";
import { p2pkScript } from "./script";

export type { AddrType };

export interface DerivedAddress {
  type: AddrType;
  /** For P2PK, which has no address form, the public key in hex. */
  address: string;
  /** Set for P2PK: the scriptPubKey the lookup is keyed by. */
  script?: string;
}

export interface ExtAddress {
  type: AddressableType;
  index: number;
  address: string;
}

export type InvalidReason =
  | "empty"
  | "format"
  | "pubkey"
  | "testnet"
  | "bech32"
  | "base58"
  | "rawtx"
  | "extkey"
  | "wif"
  | "mnemonic";

export type Query =
  | { kind: "tx"; txid: string }
  | { kind: "address"; address: string }
  | { kind: "pubkey"; addresses: DerivedAddress[]; fromPrivateKey: boolean }
  | { kind: "block"; ref: BlockRef }
  /** Decoded offline from the serialized bytes; nothing is sent anywhere. */
  | { kind: "rawtx"; tx: TxInfo }
  /** Derived offline from an extended key; looking an address up is a separate, explicit step. */
  | { kind: "extkey"; flavor: "xpub" | "ypub" | "zpub"; isPrivate: boolean; addresses: ExtAddress[] }
  /** A valid seed phrase. Key stretching and derivation wait for an explicit lookup. */
  | { kind: "mnemonic"; scheme: MnemonicScheme; phrase: string }
  | { kind: "invalid"; reason: InvalidReason };

const HEX = /^[0-9a-fA-F]+$/;
const BASE58 = "[1-9A-HJ-NP-Za-km-z]";
/** Blocks need at least 32 leading zero bits of work, so a real block hash starts with 8 hex zeros. */
const BLOCK_HASH = /^0{8}[0-9a-f]{56}$/;
const MAX_HEIGHT_DIGITS = 9;
/** Smallest possible serialized transaction is well over 60 bytes. */
const MIN_RAWTX_HEX = 120;
const MAX_RAWTX_HEX = 8_000_000;
export const EXT_ADDRESS_COUNT = 5;

const EXT_VERSIONS = {
  xpub: { public: 0x0488b21e, private: 0x0488ade4 },
  ypub: { public: 0x049d7cb2, private: 0x049d7878 },
  zpub: { public: 0x04b24746, private: 0x04b2430c },
} as const;

/**
 * Every mainnet script a public key can control (see lookupList for which types a key format allows).
 * Pay-to-pubkey has no address of its own, so it is keyed by its script.
 */
export function addressesForPubkey(pubkey: Uint8Array): DerivedAddress[] {
  return lookupList({ kind: "pubkey", compressed: pubkey.length === 33 }).map((type) =>
    type === "p2pk"
      ? { type, address: bytesToHex(pubkey), script: p2pkScript(pubkey) }
      : { type, address: addressFor(type, pubkey) },
  );
}

function classifyExtended(s: string): Query {
  const flavor = s.slice(0, 4).toLowerCase().replace("prv", "pub") as "xpub" | "ypub" | "zpub";
  try {
    const key = HDKey.fromExtendedKey(s, EXT_VERSIONS[flavor]);
    const addresses: ExtAddress[] = [];
    const types = lookupList({ kind: "extkey", flavor }).filter((t): t is AddressableType => t !== "p2pk");
    const receive = key.deriveChild(0);
    for (let index = 0; index < EXT_ADDRESS_COUNT; index++) {
      const pub = receive.deriveChild(index).publicKey!;
      for (const type of types) addresses.push({ type, index, address: addressFor(type, pub) });
    }
    return { kind: "extkey", flavor, isPrivate: s.slice(1, 4) === "prv", addresses };
  } catch {
    return { kind: "invalid", reason: "extkey" };
  }
}

const base58check = createBase58check(sha256);

/** Mainnet WIF: 0x80, the 32-byte key, and a trailing 0x01 when the key is for compressed public keys. */
function classifyWif(s: string): Query {
  try {
    const raw = base58check.decode(s);
    const compressed = raw.length === 34 && raw[33] === 0x01;
    if (raw[0] !== 0x80 || !(compressed || raw.length === 33)) throw new Error("wif");
    const pubkey = pubECDSA(raw.subarray(1, 33), compressed);
    return { kind: "pubkey", addresses: addressesForPubkey(pubkey), fromPrivateKey: true };
  } catch {
    return { kind: "invalid", reason: "wif" };
  }
}

/** Why an address did not decode, so the user is told what to fix instead of just "bad format". */
function addressFailure(s: string): InvalidReason {
  if (/^(tb1|bcrt1)/i.test(s)) return "testnet";
  if (/^bc1/i.test(s)) return "bech32";
  if (new RegExp(`^[13]${BASE58}{25,34}$`).test(s)) return "base58";
  if (new RegExp(`^[mn2]${BASE58}{25,34}$`).test(s)) return "testnet";
  return "format";
}

/** Strips a BIP21 "bitcoin:<address>?amount=…" wrapper; the query part is ignored. */
function unwrapUri(s: string): string {
  const m = /^bitcoin:\/{0,2}([^?]*)/i.exec(s);
  return m ? m[1] : s;
}

/**
 * Decides what the user pasted. Everything here is local: nothing is sent anywhere until the
 * caller looks up the result. A 64-hex string is always a transaction id or block hash (an x-only
 * key is indistinguishable from one, so it is not accepted).
 */
export function classify(input: string): Query {
  const seedPhrase = detectMnemonic(input);
  if (seedPhrase === "invalid") return { kind: "invalid", reason: "mnemonic" };
  if (seedPhrase) return { kind: "mnemonic", ...seedPhrase };

  const s =unwrapUri(input.replace(/\s+/g, ""));
  if (!s) return { kind: "invalid", reason: "empty" };

  if (HEX.test(s)) {
    if (s.length === 64) {
      const h = s.toLowerCase();
      return BLOCK_HASH.test(h) ? { kind: "block", ref: { hash: h } } : { kind: "tx", txid: h };
    }
    if (s.length === 66 || s.length === 130) {
      try {
        return { kind: "pubkey", addresses: addressesForPubkey(hexToBytes(s.toLowerCase())), fromPrivateKey: false };
      } catch {
        return { kind: "invalid", reason: "pubkey" };
      }
    }
    if (s.length >= MIN_RAWTX_HEX && s.length <= MAX_RAWTX_HEX && s.length % 2 === 0) {
      try {
        return { kind: "rawtx", tx: decodeRawTx(hexToBytes(s.toLowerCase())) };
      } catch {
        return { kind: "invalid", reason: "rawtx" };
      }
    }
  }

  const digits = s.replace(/[,_]/g, "");
  if (/^\d+$/.test(digits) && digits.length <= MAX_HEIGHT_DIGITS) {
    return { kind: "block", ref: { height: Number(digits) } };
  }

  if (/^[xyz](pub|prv)/.test(s) && new RegExp(`^[xyz](pub|prv)${BASE58}{100,112}$`).test(s)) return classifyExtended(s);
  if (new RegExp(`^[5KL]${BASE58}{50,51}$`).test(s)) return classifyWif(s);

  const addr = /^BC1/.test(s) ? s.toLowerCase() : s;
  try {
    Address(NETWORK).decode(addr);
    return { kind: "address", address: addr };
  } catch {
    return { kind: "invalid", reason: addressFailure(s) };
  }
}

/** Integer satoshis to a fixed 8-decimal BTC string without floating point error. */
export function formatBtc(sats: number): string {
  const v = BigInt(Math.round(sats));
  const abs = v < 0n ? -v : v;
  const frac = (abs % 100000000n).toString().padStart(8, "0");
  return `${v < 0n ? "-" : ""}${abs / 100000000n}.${frac}`;
}
