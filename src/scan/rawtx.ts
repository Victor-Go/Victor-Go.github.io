import { RawTx } from "@scure/btc-signer";
import { RawOldTx } from "@scure/btc-signer/script.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { TxInfo, TxIO } from "./api";
import { describeScript } from "./script";

const NO_UTXO_HASH = "0".repeat(64);

function reversedHex(b: Uint8Array): string {
  return bytesToHex(Uint8Array.from(b).reverse());
}

function sats(v: bigint): number {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error("amount");
  return n;
}

/**
 * Decodes a serialized transaction entirely offline: legacy and SegWit/Taproot encodings alike.
 * Input amounts and the fee are not in the bytes, so they stay unknown. Throws on anything malformed
 * or with trailing bytes.
 */
export function decodeRawTx(bytes: Uint8Array): TxInfo {
  const raw = RawTx.decode(bytes);
  const base = RawOldTx.encode({
    version: raw.version,
    inputs: raw.inputs,
    outputs: raw.outputs,
    lockTime: raw.lockTime,
  });
  const segwit = raw.segwitFlag === true || (raw.witnesses?.some((w) => w.length > 0) ?? false);
  const size = bytes.length;
  const weight = segwit ? base.length * 3 + size : size * 4;
  const vin: TxIO[] = raw.inputs.map((i) => {
    const txid = reversedHex(i.txid);
    return {
      value: undefined,
      coinbase: txid === NO_UTXO_HASH && i.index === 0xffffffff,
      prev: { txid, vout: i.index },
      sequence: i.sequence,
    };
  });
  const vout: TxIO[] = raw.outputs.map((o) => {
    const script = bytesToHex(o.script);
    return { address: describeScript(script).address, value: sats(o.amount), script };
  });
  return {
    txid: reversedHex(sha256(sha256(base))),
    confirmed: false,
    size,
    weight,
    vin,
    vout,
    version: raw.version,
    locktime: raw.lockTime,
    segwit,
    rbf: raw.inputs.some((i) => i.sequence < 0xfffffffe),
  };
}
