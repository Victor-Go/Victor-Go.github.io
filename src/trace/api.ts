import { BadResponseError, NetworkError, NotFoundError } from "../shared/esplora/errors";
import { MEMPOOL, request, type RequestOptions } from "../shared/esplora/transport";
import { TXID_RE, addressPath, addressTxs, arr, obj, parseJson, type AddressTx } from "../shared/esplora/parse";

export { BadResponseError, NetworkError, NotFoundError };

/** Unix seconds, both ends inclusive. */
export interface TimeWindow {
  from: number;
  to: number;
}

export const ALL_TIME: TimeWindow = { from: 0, to: Number.MAX_SAFE_INTEGER };

/** A block's timestamp may be off from its neighbours' by hours; stop paging only well past the window. */
export const SKEW_S = 6 * 3600;
/** mempool.space's summary endpoint returns this many entries per page (an undocumented endpoint, so it may change). */
export const SUMMARY_PAGE = 5_000;
/** Esplora's detail pages. */
export const DETAIL_PAGE = 25;

// Heavy pages (about 700 KB) and many requests in a row: give each one longer, back off per provider on
// 429/5xx instead of failing the whole batch, and skip the global fail-fast cooldown.
const BULK: RequestOptions = { cooldown: false, backoff: true, retries: 3 };
const SUMMARY_OPTS: RequestOptions = { ...BULK, only: [MEMPOOL], timeoutMs: 25_000 };

/** One line of the summary: no counterparties, just that the address took part in the transaction. */
export interface SummaryEntry {
  txid: string;
  /** Absent for an unconfirmed transaction. */
  height?: number;
  /** Net change of the address, in satoshis (negative: it paid out more than it received). */
  value: number;
  time?: number;
}

export async function fetchSummaryPage(address: string, after: string | undefined, signal: AbortSignal): Promise<SummaryEntry[]> {
  if (after !== undefined && !TXID_RE.test(after)) throw new BadResponseError();
  const text = await request(`/address/${address}/txs/summary${after ? `/${after}` : ""}`, signal, SUMMARY_OPTS);
  return arr(parseJson(text)).map((v) => {
    const o = obj(v);
    const txid = o.txid;
    const value = o.value;
    if (typeof txid !== "string" || !TXID_RE.test(txid) || typeof value !== "number" || !Number.isSafeInteger(value)) throw new BadResponseError();
    const height = typeof o.height === "number" && o.height > 0 ? o.height : undefined;
    const time = height !== undefined && typeof o.time === "number" ? o.time : undefined;
    return { txid, height, value, time };
  });
}

export interface SummaryScan {
  /** Entries whose block time is inside the window, newest first. */
  entries: SummaryEntry[];
  /** Unconfirmed entries (only meaningful when the window reaches the present). */
  unconfirmed: SummaryEntry[];
  /**
   * The last transaction that is certainly newer than the window: the detail pages start right after it.
   * Undefined when nothing is newer than the window.
   */
  cursor?: string;
  /** Net change (satoshis) of all confirmed transactions newer than the window. */
  afterSum: number;
  /** False when the page budget ran out before the window's start was reached. */
  complete: boolean;
  pages: number;
}

/** Walks the summary pages from the newest down until the window's start is passed (ordered by height, so this is safe). */
export async function scanSummary(
  address: string,
  win: TimeWindow,
  signal: AbortSignal,
  maxPages = 60,
  onPage?: (pages: number) => void,
): Promise<SummaryScan> {
  const entries: SummaryEntry[] = [];
  const unconfirmed: SummaryEntry[] = [];
  let cursor: string | undefined;
  let after: string | undefined;
  let pages = 0;
  let afterSum = 0;
  for (;;) {
    if (pages >= maxPages) return { entries, unconfirmed, cursor, afterSum, complete: false, pages };
    const page = await fetchSummaryPage(address, after, signal);
    pages++;
    onPage?.(pages);
    let passed = false;
    for (const e of page) {
      if (e.time === undefined) unconfirmed.push(e);
      else if (e.time > win.to) {
        afterSum += e.value;
        if (e.time > win.to + SKEW_S) cursor = e.txid;
      } else if (e.time >= win.from) entries.push(e);
      else if (e.time < win.from - SKEW_S) passed = true;
    }
    if (passed || page.length < SUMMARY_PAGE) return { entries, unconfirmed, cursor, afterSum, complete: true, pages };
    after = page[page.length - 1].txid;
  }
}

/** The address's balance (satoshis) when the window begins and ends, and now. */
export interface WindowBalance {
  enter: number;
  leave: number;
  now: number;
}

/** Confirmed plus unconfirmed balance right now. */
export async function fetchBalance(address: string, signal: AbortSignal): Promise<number> {
  const o = obj(parseJson(await request(`/address/${address}`, signal, BULK)));
  const chain = obj(o.chain_stats);
  const pool = obj(o.mempool_stats);
  const n = (v: unknown) => (typeof v === "number" && Number.isSafeInteger(v) ? v : (() => { throw new BadResponseError(); })());
  return n(chain.funded_txo_sum) - n(chain.spent_txo_sum) + n(pool.funded_txo_sum) - n(pool.spent_txo_sum);
}

export interface WindowScan {
  address: string;
  /** Transactions inside the window, newest first, with full inputs and outputs. */
  txs: AddressTx[];
  /** False when the request budget ran out before the whole window was read: the list is partial. */
  complete: boolean;
  via: "summary" | "paging";
  requests: number;
  /** Known only when the whole window was read (otherwise the sums would be wrong). */
  balance?: WindowBalance;
}

export interface ScanOptions {
  /** At most this many requests (summary pages included). */
  budget?: number;
  /** Do not try the summary endpoint (known to be missing, or turned off). */
  noSummary?: boolean;
  onProgress?: (requests: number, found: number) => void;
}

const inWindow = (t: AddressTx, win: TimeWindow, withUnconfirmed: boolean): boolean =>
  t.tx.time === undefined ? withUnconfirmed : t.tx.time >= win.from && t.tx.time <= win.to;

/**
 * The transactions of one address inside a time window, with all counterparties.
 * Fast path: the summary endpoint gives the window's txids and a cursor, so only the window's own pages are read.
 * Fallback: read pages from the newest down, within the request budget.
 */
export async function scanWindow(address: string, win: TimeWindow, signal: AbortSignal, opts: ScanOptions = {}): Promise<WindowScan> {
  const budget = opts.budget ?? 120;
  const nowS = Math.floor(Date.now() / 1000);
  const withUnconfirmed = win.to >= nowS;
  let requests = 0;
  const bump = (found: number) => {
    requests++;
    opts.onProgress?.(requests, found);
  };

  let via: WindowScan["via"] = "paging";
  let want: Set<string> | undefined;
  let cursor: string | undefined;
  let pool: AddressTx[] = [];
  let after: number | undefined; // net of everything newer than the window
  let inSum: number | undefined; // net inside the window (summary path)
  if (!opts.noSummary) {
    try {
      const s = await scanSummary(address, win, signal, Math.max(1, Math.floor(budget / 2)), () => bump(0));
      if (s.complete) {
        via = "summary";
        cursor = s.cursor;
        want = new Set(s.entries.map((e) => e.txid));
        const pending = s.unconfirmed.reduce((a, e) => a + e.value, 0);
        after = s.afterSum + (withUnconfirmed ? 0 : pending);
        inSum = s.entries.reduce((a, e) => a + e.value, 0) + (withUnconfirmed ? pending : 0);
        if (withUnconfirmed && s.unconfirmed.length > 0) {
          // Unconfirmed transactions are not on the chain pages: they have their own endpoint.
          pool = addressTxs(await request(`${addressPath(address)}/txs/mempool`, signal, BULK), address);
          bump(0);
        }
        if (want.size === 0) return { address, txs: pool, complete: true, via, requests, balance: await balanceOf(address, signal, after, inSum, bump) };
      }
    } catch (e) {
      if (!(e instanceof NotFoundError) && !(e instanceof NetworkError)) throw e;
      // 404: the provider does not have the endpoint; a network failure: do without it this time.
    }
  }

  const found: AddressTx[] = [...pool];
  const base = addressPath(address);
  // The first page of /txs holds the unconfirmed ones; a cursor starts right after the newest transaction outside the window.
  let next: string | undefined = cursor;
  let complete = true;
  let pagingAfter = 0;
  for (let first = true; ; first = false) {
    if (requests >= budget) {
      complete = false;
      break;
    }
    const path: string = first && next === undefined ? `${base}/txs` : `${base}/txs/chain/${next}`;
    const page = addressTxs(await request(path, signal, BULK), address);
    bump(found.length);
    let passed = false;
    for (const t of page) {
      if (inWindow(t, win, withUnconfirmed)) {
        found.push(t);
        want?.delete(t.tx.txid);
      } else {
        if (via === "paging" && (t.tx.time === undefined ? !withUnconfirmed : t.tx.time > win.to)) pagingAfter += t.net;
        if (t.tx.time !== undefined && t.tx.time < win.from - SKEW_S) passed = true;
      }
    }
    const confirmed = page.filter((t) => t.tx.time !== undefined);
    if (passed || confirmed.length < DETAIL_PAGE || (want && want.size === 0)) break;
    next = confirmed[confirmed.length - 1].tx.txid;
  }
  const seen = new Set<string>();
  const txs = found.filter((t) => !seen.has(t.tx.txid) && !!seen.add(t.tx.txid));
  if (via === "paging") {
    after = pagingAfter;
    inSum = txs.reduce((a, t) => a + t.net, 0);
  }
  return { address, txs, complete, via, requests, balance: complete ? await balanceOf(address, signal, after, inSum, bump) : undefined };
}

/** Balances at the window's edges: now, minus what came after the window, minus what happened inside it. */
async function balanceOf(
  address: string,
  signal: AbortSignal,
  after: number | undefined,
  inSum: number | undefined,
  bump: (found: number) => void,
): Promise<WindowBalance | undefined> {
  if (after === undefined || inSum === undefined) return undefined;
  try {
    const now = await fetchBalance(address, signal);
    bump(0);
    const leave = now - after;
    return { enter: leave - inSum, leave, now };
  } catch (e) {
    if (e instanceof NetworkError || e instanceof NotFoundError || e instanceof BadResponseError) return undefined;
    throw e;
  }
}
