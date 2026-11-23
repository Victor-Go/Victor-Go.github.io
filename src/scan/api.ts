import { BadResponseError, NetworkError, NotFoundError } from "../shared/esplora/errors";
import { PROVIDERS, attemptOne, request, resetTransportState } from "../shared/esplora/transport";
import {
  TXID_RE,
  addressPath,
  addressTxs,
  arr,
  int,
  obj,
  parseJson,
  parseTx,
  type AddressTx,
  type TxInfo,
  type TxIO,
} from "../shared/esplora/parse";

// The network code lives in ../shared/esplora (shared with /trace): both providers speak the same
// Esplora API, requests carry no cookies, no referrer and no cache entries, and nothing is stored.
export { BadResponseError, NetworkError, NotFoundError, PROVIDERS };
export type { AddressTx, TxInfo, TxIO };

/** The chain tip only feeds a confirmation count, so one reading serves a short while. */
const TIP_TTL_MS = 30_000;

let tip: { height: number; at: number } | undefined;

const get = (path: string, signal: AbortSignal): Promise<string> => request(path, signal);

/** Forgets which providers failed and restarts the rotation. For tests. */
export function resetProviderState(): void {
  resetTransportState();
  tip = undefined;
}

export interface TxResult {
  tx: TxInfo;
  confirmations: number;
}

/** The chain tip height, reused for a short while unless it is older than the block we need it for. */
async function chainTip(atLeast: number, signal: AbortSignal): Promise<number> {
  if (tip && Date.now() - tip.at < TIP_TTL_MS && tip.height >= atLeast) return tip.height;
  const height = Number.parseInt(await get("/blocks/tip/height", signal), 10);
  if (!Number.isSafeInteger(height)) throw new BadResponseError();
  tip = { height, at: Date.now() };
  return height;
}

export async function lookupTx(txid: string, signal: AbortSignal): Promise<TxResult> {
  const tx = parseTx(parseJson(await get(`/tx/${txid}`, signal)));
  if (tx.txid !== txid) throw new BadResponseError();
  let confirmations = 0;
  if (tx.confirmed && tx.height !== undefined) {
    confirmations = Math.max(0, (await chainTip(tx.height, signal)) - tx.height + 1);
  }
  return { tx, confirmations };
}

export interface AddressResult {
  address: string;
  /** Set when the lookup was keyed by script (pay-to-pubkey); needed to page further through the history. */
  script?: string;
  /** Confirmed balance in satoshis. */
  balance: number;
  unconfirmed: number;
  txCount: number;
  received: number;
  txs: AddressTx[];
}

/**
 * The confirmed transactions that come after `lastSeen` in an address's history, newest first
 * (25 per page). Esplora pages by cursor, not by number, so pages can only be walked in order.
 */
export async function lookupAddressPage(
  address: string,
  lastSeen: string,
  signal: AbortSignal,
  script?: string,
): Promise<AddressTx[]> {
  if (!TXID_RE.test(lastSeen)) throw new BadResponseError();
  return addressTxs(await get(`${addressPath(address, script)}/txs/chain/${lastSeen}`, signal), address, script);
}

/**
 * Looks up an address. Outputs with no address form (pay-to-pubkey) are looked up by script instead:
 * pass the scriptPubKey hex and the provider is asked about its SHA-256, never the key itself.
 */
export async function lookupAddress(
  address: string,
  signal: AbortSignal,
  script?: string,
  withTxs = true,
): Promise<AddressResult> {
  const base = addressPath(address, script);
  const o = obj(parseJson(await get(base, signal)));
  const chain = obj(o.chain_stats);
  const pool = obj(o.mempool_stats);
  const confirmedTxCount = int(chain.tx_count);
  const poolTxCount = int(pool.tx_count);
  let txs: AddressTx[] = [];
  if (withTxs && confirmedTxCount + poolTxCount > 0) {
    txs = addressTxs(await get(`${base}/txs`, signal), address, script);
  }
  return {
    address,
    script,
    balance: int(chain.funded_txo_sum) - int(chain.spent_txo_sum),
    unconfirmed: int(pool.funded_txo_sum) - int(pool.spent_txo_sum),
    txCount: confirmedTxCount + poolTxCount,
    received: int(chain.funded_txo_sum),
    txs,
  };
}

const DAY = 86_400;
const priceCache = new Map<number, number>();

/**
 * Approximate USD price of 1 BTC around `time` (Unix seconds), from mempool.space only: Esplora itself
 * has no prices. Only a day number is sent, never an address. Failure is not an error, the price is
 * an extra: undefined means unknown.
 */
export async function priceUsdAt(time: number, signal: AbortSignal): Promise<number | undefined> {
  const day = Math.floor(time / DAY) * DAY;
  const known = priceCache.get(day);
  if (known !== undefined) return known;
  const text = await attemptOne(PROVIDERS[0], `/v1/historical-price?currency=USD&timestamp=${day}`, signal);
  if (text === undefined) return undefined;
  try {
    const first = arr(obj(parseJson(text)).prices)[0];
    const usd = obj(first).USD;
    if (typeof usd !== "number" || !Number.isFinite(usd) || usd <= 0) return undefined;
    priceCache.set(day, usd);
    return usd;
  } catch {
    return undefined;
  }
}

export const priceDay = (time: number): number => Math.floor(time / DAY) * DAY;

export interface BlockInfo {
  hash: string;
  height: number;
  version: number;
  time: number;
  txCount: number;
  size: number;
  weight: number;
  merkleRoot: string;
  prevHash?: string;
  nonce: number;
  bits: number;
  difficulty: number;
  /** The first MAX_BLOCK_TXIDS transaction ids, coinbase first. */
  txids: string[];
}

export const MAX_BLOCK_TXIDS = 50;

export type BlockRef = { height: number } | { hash: string };

function hash64(v: unknown): string {
  if (typeof v !== "string" || !TXID_RE.test(v)) throw new BadResponseError();
  return v;
}

export async function lookupBlock(ref: BlockRef, signal: AbortSignal): Promise<BlockInfo> {
  const hash = "hash" in ref ? ref.hash : hash64((await get(`/block-height/${ref.height}`, signal)).trim());
  const o = obj(parseJson(await get(`/block/${hash}`, signal)));
  if (o.id !== hash) throw new BadResponseError();
  const height = int(o.height);
  if ("height" in ref && height !== ref.height) throw new BadResponseError();
  const txids = arr(parseJson(await get(`/block/${hash}/txids`, signal))).slice(0, MAX_BLOCK_TXIDS).map(hash64);
  return {
    hash,
    height,
    version: int(o.version),
    time: int(o.timestamp),
    txCount: int(o.tx_count),
    size: int(o.size),
    weight: int(o.weight),
    merkleRoot: hash64(o.merkle_root),
    prevHash: o.previousblockhash === null || o.previousblockhash === undefined ? undefined : hash64(o.previousblockhash),
    nonce: int(o.nonce),
    bits: int(o.bits),
    difficulty: typeof o.difficulty === "number" && Number.isFinite(o.difficulty) ? o.difficulty : 0,
    txids,
  };
}
