import { Address, NETWORK, OutScript } from "@scure/btc-signer";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

/** Every output script shape seen on Bitcoin mainnet, from the 2009 pay-to-pubkey to Taproot. */
export type ScriptKind =
  | "p2pk"
  | "p2pkh"
  | "p2sh"
  | "p2wpkh"
  | "p2wsh"
  | "p2tr"
  | "p2a"
  | "multisig"
  | "opreturn"
  | "nonstandard";

export interface ScriptInfo {
  kind: ScriptKind;
  /** Present when the script has a standard address form. */
  address?: string;
  /** P2PK: the one key; bare multisig: every key. */
  pubkeys?: string[];
  /** Bare multisig: signatures required. */
  m?: number;
  /** OP_RETURN: the bytes following the opcode (push opcodes included), as hex. */
  data?: string;
}

const HEX = /^(?:[0-9a-fA-F]{2})*$/;

/** Classifies a scriptPubKey given as hex. Never throws: anything unrecognised is "nonstandard". */
export function describeScript(hex: string): ScriptInfo {
  if (!HEX.test(hex) || hex.length === 0) return { kind: "nonstandard" };
  const bytes = hexToBytes(hex.toLowerCase());
  if (bytes[0] === 0x6a) return { kind: "opreturn", data: bytesToHex(bytes.subarray(1)) };
  try {
    const out = OutScript.decode(bytes);
    const address = () => {
      try {
        return Address(NETWORK).encode(out);
      } catch {
        return undefined;
      }
    };
    switch (out.type) {
      case "pk":
        return { kind: "p2pk", pubkeys: [bytesToHex(out.pubkey)] };
      case "pkh":
        return { kind: "p2pkh", address: address() };
      case "sh":
        return { kind: "p2sh", address: address() };
      case "wpkh":
        return { kind: "p2wpkh", address: address() };
      case "wsh":
        return { kind: "p2wsh", address: address() };
      case "tr":
        return { kind: "p2tr", address: address() };
      case "p2a":
        return { kind: "p2a", address: address() };
      case "ms":
        return { kind: "multisig", m: out.m, pubkeys: out.pubkeys.map((k) => bytesToHex(k)) };
      default:
        return { kind: "nonstandard" };
    }
  } catch {
    return { kind: "nonstandard" };
  }
}

/** scriptPubKey of a pay-to-pubkey output: <push key> OP_CHECKSIG. Keys are 33 or 65 bytes, so one-byte pushes. */
export function p2pkScript(pubkey: Uint8Array): string {
  return bytesToHex(new Uint8Array([pubkey.length, ...pubkey, 0xac]));
}
