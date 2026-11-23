import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { BadResponseError } from "./errors";

type Obj = Record<string, unknown>;

export function obj(v: unknown): Obj {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new BadResponseError();
  return v as Obj;
}
export function int(v: unknown): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) throw new BadResponseError();
  return v;
}
export function optStr(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
export function arr(v: unknown): unknown[] {
  if (!Array.isArray(v)) throw new BadResponseError();
  return v;
}
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new BadResponseError();
  }
}

export interface TxIO {
  address?: string;
  /** Unknown (undefined) for inputs of a locally decoded transaction: the bytes do not carry it. */
  value?: number;
  coinbase?: boolean;
  /** scriptPubKey as hex; what an address-less (P2PK, bare multisig, OP_RETURN...) output is identified by. */
  script?: string;
  /** The output this input spends. */
  prev?: { txid: string; vout: number };
  sequence?: number;
}

export interface TxInfo {
  txid: string;
  confirmed: boolean;
  height?: number;
  time?: number;
  fee?: number;
  size: number;
  weight: number;
  vin: TxIO[];
  vout: TxIO[];
  version?: number;
  locktime?: number;
  segwit?: boolean;
  /** BIP125: some input signals that the transaction may be replaced. */
  rbf?: boolean;
}

const HEX_RE = /^(?:[0-9a-fA-F]{2})+$/;
export const TXID_RE = /^[0-9a-f]{64}$/;

function optHex(v: unknown): string | undefined {
  return typeof v === "string" && HEX_RE.test(v) ? v.toLowerCase() : undefined;
}

export function parseTx(v: unknown): TxInfo {
  const o = obj(v);
  const status = obj(o.status);
  const confirmed = status.confirmed === true;
  const txid = optStr(o.txid);
  if (!txid || !TXID_RE.test(txid)) throw new BadResponseError();
  const size = int(o.size);
  const weight = int(o.weight);
  const vin = arr(o.vin).map((i) => {
    const x = obj(i);
    const prev = x.prevout === null || x.prevout === undefined ? undefined : obj(x.prevout);
    const prevTxid = optStr(x.txid);
    return {
      address: prev ? optStr(prev.scriptpubkey_address) : undefined,
      value: prev ? int(prev.value) : 0,
      coinbase: x.is_coinbase === true,
      script: prev ? optHex(prev.scriptpubkey) : undefined,
      prev: prevTxid && TXID_RE.test(prevTxid) && typeof x.vout === "number" ? { txid: prevTxid, vout: x.vout } : undefined,
      sequence: typeof x.sequence === "number" ? x.sequence : undefined,
    };
  });
  return {
    txid,
    confirmed,
    height: confirmed ? int(status.block_height) : undefined,
    time: confirmed && status.block_time !== undefined ? int(status.block_time) : undefined,
    fee: o.fee === undefined ? undefined : int(o.fee),
    size,
    weight,
    vin,
    vout: arr(o.vout).map((i) => {
      const x = obj(i);
      return { address: optStr(x.scriptpubkey_address), value: int(x.value), script: optHex(x.scriptpubkey) };
    }),
    version: typeof o.version === "number" ? o.version : undefined,
    locktime: typeof o.locktime === "number" ? o.locktime : undefined,
    segwit: weight < size * 4,
    rbf: vin.some((i) => i.sequence !== undefined && i.sequence < 0xfffffffe),
  };
}

export interface AddressTx {
  tx: TxInfo;
  /** Satoshis this address gained (positive) or lost (negative) in the transaction. */
  net: number;
}

export function netFor(tx: TxInfo, mine: (io: TxIO) => boolean): number {
  const gained = tx.vout.filter(mine).reduce((s, o) => s + (o.value ?? 0), 0);
  const spent = tx.vin.filter(mine).reduce((s, i) => s + (i.value ?? 0), 0);
  return gained - spent;
}

export function addressPath(address: string, script?: string): string {
  return script ? `/scripthash/${bytesToHex(sha256(hexToBytes(script)))}` : `/address/${address}`;
}

/** Esplora returns up to 50 unconfirmed plus 25 confirmed transactions on a first page; this is a safety cap. */
const MAX_PAGE_TXS = 100;

export function addressTxs(body: string, address: string, script?: string): AddressTx[] {
  const mine = (io: TxIO) => (script ? io.script === script.toLowerCase() : io.address === address);
  return arr(parseJson(body))
    .slice(0, MAX_PAGE_TXS)
    .map((t) => {
      const tx = parseTx(t);
      return { tx, net: netFor(tx, mine) };
    });
}
