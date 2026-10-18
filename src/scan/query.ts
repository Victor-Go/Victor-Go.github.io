import { Address, NETWORK, p2pkh, p2sh, p2tr, p2wpkh } from "@scure/btc-signer";

export type AddrType = "p2pkh" | "p2sh-p2wpkh" | "p2wpkh" | "p2tr";

export interface DerivedAddress {
  type: AddrType;
  address: string;
}

export type Query =
  | { kind: "tx"; txid: string }
  | { kind: "address"; address: string }
  | { kind: "pubkey"; addresses: DerivedAddress[] }
  | { kind: "invalid"; reason: "empty" | "format" | "pubkey" };

const HEX = /^[0-9a-fA-F]+$/;

function fromHex(s: string): Uint8Array {
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Every mainnet address a public key can control. Uncompressed keys are only valid in legacy P2PKH. */
export function addressesForPubkey(pubkey: Uint8Array): DerivedAddress[] {
  if (pubkey.length === 65) return [{ type: "p2pkh", address: p2pkh(pubkey, NETWORK).address! }];
  const w = p2wpkh(pubkey, NETWORK);
  return [
    { type: "p2pkh", address: p2pkh(pubkey, NETWORK).address! },
    { type: "p2sh-p2wpkh", address: p2sh(w, NETWORK).address! },
    { type: "p2wpkh", address: w.address! },
    { type: "p2tr", address: p2tr(pubkey.slice(1), undefined, NETWORK).address! },
  ];
}

/**
 * Decides what the user pasted. Everything here is local: nothing is sent anywhere until the
 * caller looks up the result. A 64-hex string is always a transaction id (an x-only key is
 * indistinguishable from one, so it is not accepted).
 */
export function classify(input: string): Query {
  const s = input.replace(/\s+/g, "");
  if (!s) return { kind: "invalid", reason: "empty" };
  if (HEX.test(s)) {
    if (s.length === 64) return { kind: "tx", txid: s.toLowerCase() };
    if (s.length === 66 || s.length === 130) {
      try {
        return { kind: "pubkey", addresses: addressesForPubkey(fromHex(s)) };
      } catch {
        return { kind: "invalid", reason: "pubkey" };
      }
    }
    return { kind: "invalid", reason: "format" };
  }
  const addr = /^BC1/.test(s) ? s.toLowerCase() : s;
  try {
    Address(NETWORK).decode(addr);
    return { kind: "address", address: addr };
  } catch {
    return { kind: "invalid", reason: "format" };
  }
}

/** Integer satoshis to a fixed 8-decimal BTC string without floating point error. */
export function formatBtc(sats: number): string {
  const v = BigInt(Math.round(sats));
  const abs = v < 0n ? -v : v;
  const frac = (abs % 100000000n).toString().padStart(8, "0");
  return `${v < 0n ? "-" : ""}${abs / 100000000n}.${frac}`;
}
