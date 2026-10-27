import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

// The only module in /scan that touches the network. Both providers speak the same Esplora API.
// Requests carry no cookies, no referrer and no cache entries; nothing is stored afterwards.
export const PROVIDERS = ["https://mempool.space/api", "https://blockstream.info/api"] as const;

// How the two providers are used so that a slow or rate-limited one rarely holds a lookup up.
/** One attempt is abandoned after this long. */
const ATTEMPT_TIMEOUT_MS = 8_000;
/** If the first provider has not answered by then, ask the next one too and take whichever wins. */
const HEDGE_AFTER_MS = 2_000;
/** A provider that just failed is tried last for this long. */
const PENALTY_MS = 30_000;
/** Public providers throttle bursts (HTTP 429), so cap what is in flight at each one. */
const MAX_PER_PROVIDER = 3;
/**
 * When every provider has just failed, new lookups fail at once for this long instead of hammering
 * servers that are already refusing us. Each lookup tries each provider at most once, never in rounds.
 */
const COOLDOWN_MS = 5_000;
/** The chain tip only feeds a confirmation count, so one reading serves a short while. */
const TIP_TTL_MS = 30_000;
/** Esplora returns up to 50 unconfirmed plus 25 confirmed transactions on a first page; this is a safety cap. */
const MAX_PAGE_TXS = 100;

export class NotFoundError extends Error {}
export class NetworkError extends Error {}
export class BadResponseError extends Error {}

interface ProviderState {
  penalizedUntil: number;
  inflight: number;
  waiters: (() => void)[];
}

const freshState = (): Map<string, ProviderState> =>
  new Map(PROVIDERS.map((p) => [p, { penalizedUntil: 0, inflight: 0, waiters: [] }]));

let providers = freshState();
let rotation = 0;
let coolUntil = 0;
let tip: { height: number; at: number } | undefined;

/** Forgets which providers failed and restarts the rotation. For tests. */
export function resetProviderState(): void {
  providers = freshState();
  rotation = 0;
  coolUntil = 0;
  tip = undefined;
}

/** Healthy providers first, taking turns so concurrent lookups spread over both; failed ones last. */
function providerOrder(): string[] {
  const now = Date.now();
  const start = rotation++ % PROVIDERS.length;
  const turn = PROVIDERS.map((_, i) => PROVIDERS[(start + i) % PROVIDERS.length]);
  const ok = (p: string) => providers.get(p)!.penalizedUntil <= now;
  return [...turn.filter(ok), ...turn.filter((p) => !ok(p))];
}

/** Takes one of the provider's slots, waiting for a free one. A freed slot is handed straight to the next waiter. */
async function acquire(base: string, signal: AbortSignal): Promise<() => void> {
  const s = providers.get(base)!;
  if (s.inflight < MAX_PER_PROVIDER) s.inflight++;
  else {
    await new Promise<void>((resolve, reject) => {
      const wake = () => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      };
      const onAbort = () => {
        s.waiters.splice(s.waiters.indexOf(wake), 1);
        reject(signal.reason);
      };
      s.waiters.push(wake);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }
  return () => {
    const next = s.waiters.shift();
    if (next) next();
    else s.inflight--;
  };
}

type Outcome = { kind: "ok"; text: string } | { kind: "notfound" } | { kind: "fail" };

async function attempt(base: string, path: string, signal: AbortSignal, onSent: () => void): Promise<Outcome> {
  const state = providers.get(base)!;
  let release: (() => void) | undefined;
  try {
    release = await acquire(base, signal);
    onSent(); // only now is the request really on its way (it may have queued for a slot first)
    const res = await fetch(base + path, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.any([signal, AbortSignal.timeout(ATTEMPT_TIMEOUT_MS)]),
    });
    // A 404/400 is an answer, not an outage: do not repeat the query at the next provider.
    if (res.status === 404 || res.status === 400) return { kind: "notfound" };
    if (!res.ok) {
      state.penalizedUntil = Date.now() + PENALTY_MS;
      return { kind: "fail" };
    }
    const text = await res.text();
    state.penalizedUntil = 0;
    return { kind: "ok", text };
  } catch {
    // Losing a race (our own abort) says nothing about the provider's health.
    if (!signal.aborted) state.penalizedUntil = Date.now() + PENALTY_MS;
    return { kind: "fail" };
  } finally {
    release?.();
  }
}

/**
 * Asks the providers in turn: the next one is started as soon as the current one fails, or after
 * HEDGE_AFTER_MS if it is merely slow. The first real answer wins and the rest are cancelled.
 */
async function race(path: string, signal: AbortSignal): Promise<Outcome> {
  const own = new AbortController();
  const forward = () => own.abort(signal.reason);
  signal.addEventListener("abort", forward, { once: true });
  const queue = providerOrder();
  try {
    return await new Promise<Outcome>((resolve) => {
      let next = 0;
      let pending = 0;
      let done = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (o: Outcome) => {
        done = true;
        clearTimeout(timer);
        resolve(o);
      };
      const launch = (): boolean => {
        if (done || next >= queue.length) return false;
        pending++;
        const onSent = () => {
          // The wait for a provider's free slot is our own queueing, not the provider being slow.
          if (done || next >= queue.length) return;
          clearTimeout(timer);
          timer = setTimeout(launch, HEDGE_AFTER_MS);
        };
        void attempt(queue[next++], path, own.signal, onSent).then((o) => {
          pending--;
          if (done) return;
          if (o.kind !== "fail") finish(o);
          else if (!launch() && pending === 0) finish(o);
        });
        return true;
      };
      launch();
    });
  } finally {
    own.abort();
    signal.removeEventListener("abort", forward);
  }
}

async function get(path: string, signal: AbortSignal): Promise<string> {
  if (Date.now() < coolUntil) throw new NetworkError();
  const o = await race(path, signal);
  signal.throwIfAborted();
  if (o.kind === "ok") return o.text;
  if (o.kind === "notfound") throw new NotFoundError();
  coolUntil = Date.now() + COOLDOWN_MS;
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
const TXID_RE = /^[0-9a-f]{64}$/;

function optHex(v: unknown): string | undefined {
  return typeof v === "string" && HEX_RE.test(v) ? v.toLowerCase() : undefined;
}

function parseTx(v: unknown): TxInfo {
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

export interface AddressTx {
  tx: TxInfo;
  /** Satoshis this address gained (positive) or lost (negative) in the transaction. */
  net: number;
}

export interface AddressResult {
  address: string;
  /** Set when the lookup was keyed by script (pay-to-pubkey); needed to fetch further history pages. */
  script?: string;
  /** Confirmed balance in satoshis. */
  balance: number;
  unconfirmed: number;
  txCount: number;
  received: number;
  txs: AddressTx[];
}

function netFor(tx: TxInfo, mine: (io: TxIO) => boolean): number {
  const gained = tx.vout.filter(mine).reduce((s, o) => s + (o.value ?? 0), 0);
  const spent = tx.vin.filter(mine).reduce((s, i) => s + (i.value ?? 0), 0);
  return gained - spent;
}

function addressPath(address: string, script?: string): string {
  return script ? `/scripthash/${bytesToHex(sha256(hexToBytes(script)))}` : `/address/${address}`;
}

function addressTxs(body: string, address: string, script?: string): AddressTx[] {
  const mine = (io: TxIO) => (script ? io.script === script.toLowerCase() : io.address === address);
  return arr(parseJson(body))
    .slice(0, MAX_PAGE_TXS)
    .map((t) => {
      const tx = parseTx(t);
      return { tx, net: netFor(tx, mine) };
    });
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
  const o = await attempt(PROVIDERS[0], `/v1/historical-price?currency=USD&timestamp=${day}`, signal, () => {});
  if (o.kind !== "ok") return undefined;
  try {
    const first = arr(obj(parseJson(o.text)).prices)[0];
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
