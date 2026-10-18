// The only module in /scan that touches the network. Both providers speak the same Esplora API.
// Requests carry no cookies, no referrer and no cache entries; nothing is stored afterwards.
export const PROVIDERS = ["https://mempool.space/api", "https://blockstream.info/api"] as const;

const TIMEOUT_MS = 15_000;
export const MAX_TXS = 25;

export class NotFoundError extends Error {}
export class NetworkError extends Error {}
export class BadResponseError extends Error {}

async function get(path: string, signal: AbortSignal): Promise<string> {
  for (const base of PROVIDERS) {
    try {
      const res = await fetch(base + path, {
        method: "GET",
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
      });
      // A 404/400 is an answer, not an outage: do not repeat the query at the next provider.
      if (res.status === 404 || res.status === 400) throw new NotFoundError();
      if (!res.ok) continue;
      return await res.text();
    } catch (e) {
      if (e instanceof NotFoundError || signal.aborted) throw e;
    }
  }
  throw new NetworkError();
}

type Obj = Record<string, unknown>;

function obj(v: unknown): Obj {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new BadResponseError();
  return v as Obj;
}
function int(v: unknown): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) throw new BadResponseError();
  return v;
}
function optStr(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function arr(v: unknown): unknown[] {
  if (!Array.isArray(v)) throw new BadResponseError();
  return v;
}
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new BadResponseError();
  }
}

export interface TxIO {
  address?: string;
  value: number;
  coinbase?: boolean;
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
}

function parseTx(v: unknown): TxInfo {
  const o = obj(v);
  const status = obj(o.status);
  const confirmed = status.confirmed === true;
  const txid = optStr(o.txid);
  if (!txid || !/^[0-9a-f]{64}$/.test(txid)) throw new BadResponseError();
  return {
    txid,
    confirmed,
    height: confirmed ? int(status.block_height) : undefined,
    time: confirmed && status.block_time !== undefined ? int(status.block_time) : undefined,
    fee: o.fee === undefined ? undefined : int(o.fee),
    size: int(o.size),
    weight: int(o.weight),
    vin: arr(o.vin).map((i) => {
      const x = obj(i);
      const prev = x.prevout === null || x.prevout === undefined ? undefined : obj(x.prevout);
      return {
        address: prev ? optStr(prev.scriptpubkey_address) : undefined,
        value: prev ? int(prev.value) : 0,
        coinbase: x.is_coinbase === true,
      };
    }),
    vout: arr(o.vout).map((i) => {
      const x = obj(i);
      return { address: optStr(x.scriptpubkey_address), value: int(x.value) };
    }),
  };
}

export interface TxResult {
  tx: TxInfo;
  confirmations: number;
}

export async function lookupTx(txid: string, signal: AbortSignal): Promise<TxResult> {
  const tx = parseTx(parseJson(await get(`/tx/${txid}`, signal)));
  if (tx.txid !== txid) throw new BadResponseError();
  let confirmations = 0;
  if (tx.confirmed && tx.height !== undefined) {
    const tip = Number.parseInt(await get("/blocks/tip/height", signal), 10);
    if (!Number.isSafeInteger(tip)) throw new BadResponseError();
    confirmations = Math.max(0, tip - tx.height + 1);
  }
  return { tx, confirmations };
}

export interface AddressTx {
  tx: TxInfo;
  /** Satoshis this address gained (positive) or lost (negative) in the transaction. */
  net: number;
}

export interface AddressResult {
  address: string;
  /** Confirmed balance in satoshis. */
  balance: number;
  unconfirmed: number;
  txCount: number;
  received: number;
  txs: AddressTx[];
}

function netFor(tx: TxInfo, address: string): number {
  const gained = tx.vout.filter((o) => o.address === address).reduce((s, o) => s + o.value, 0);
  const spent = tx.vin.filter((i) => i.address === address).reduce((s, i) => s + i.value, 0);
  return gained - spent;
}

export async function lookupAddress(address: string, signal: AbortSignal): Promise<AddressResult> {
  const o = obj(parseJson(await get(`/address/${address}`, signal)));
  const chain = obj(o.chain_stats);
  const pool = obj(o.mempool_stats);
  const confirmedTxCount = int(chain.tx_count);
  const poolTxCount = int(pool.tx_count);
  let txs: AddressTx[] = [];
  if (confirmedTxCount + poolTxCount > 0) {
    txs = arr(parseJson(await get(`/address/${address}/txs`, signal)))
      .slice(0, MAX_TXS)
      .map((t) => {
        const tx = parseTx(t);
        return { tx, net: netFor(tx, address) };
      });
  }
  return {
    address,
    balance: int(chain.funded_txo_sum) - int(chain.spent_txo_sum),
    unconfirmed: int(pool.funded_txo_sum) - int(pool.spent_txo_sum),
    txCount: confirmedTxCount + poolTxCount,
    received: int(chain.funded_txo_sum),
    txs,
  };
}
