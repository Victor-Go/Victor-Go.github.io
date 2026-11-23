import { BadResponseError, NetworkError, NotFoundError } from "../shared/esplora/errors";
import { request } from "../shared/esplora/transport";
import { parseJson, parseTx, type AddressTx, type TxInfo } from "../shared/esplora/parse";
import { scanSummary, scanWindow, type TimeWindow } from "./api";
import { isNoise } from "./aggregate";

/** An address with more transactions than this inside the window is a hub (exchange, pool): links through it are weak. */
export const HOT_TX = 1_000;
/** Detail lookups (one request per shared transaction) a check may spend. */
export const DETAIL_BUDGET = 150;
/** Summary pages one address may use. */
const SUMMARY_PAGES = 60;

export type EdgeKind = "pay" | "cospend";

export interface PairEdge {
  id: string;
  kind: EdgeKind;
  /** For "pay": money moved a → b. For "cospend": the two were spent together (order is just sorted). */
  a: string;
  b: string;
  sats: number;
  count: number;
  firstTime?: number;
  lastTime?: number;
  txids: string[];
  /** The amount is a share of a multi-party transaction. */
  estimated: boolean;
  /** One end is a hub, so this is a weak link kept apart from the strong ones. */
  weak: boolean;
}

export interface AddrInfo {
  address: string;
  /** Transactions of the address inside the window that were seen. */
  entries: number;
  /** The whole window was read for this address. */
  complete: boolean;
  via: "summary" | "paging";
  hot: boolean;
  failed: boolean;
}

export interface Correlation {
  infos: Record<string, AddrInfo>;
  edges: PairEdge[];
  /** Transactions that two or more of the addresses share. */
  shared: number;
  /** Shared transactions whose details were read. */
  read: number;
  /** Shared transactions left unread because the detail budget ended. */
  unread: number;
  /** Shared transactions ignored for having too many inputs or outputs. */
  filtered: number;
  requests: number;
  /** Everything was read: no truncated address, no unread transaction, no failure. */
  complete: boolean;
}

export interface CorrelateOptions {
  noise: number;
  detailBudget?: number;
  onProgress?: (done: number, total: number, requests: number) => void;
}

const pool = async <T>(items: T[], limit: number, fn: (x: T) => Promise<void>): Promise<void> => {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
};

/** From shared transactions to edges between the given addresses. Pure, so it can be tested without a network. */
export function relate(addresses: readonly string[], txs: readonly TxInfo[], noise: number, hot: ReadonlySet<string> = new Set()): { edges: PairEdge[]; filtered: number } {
  const mine = new Set(addresses);
  const map = new Map<string, PairEdge>();
  let filtered = 0;
  const add = (kind: EdgeKind, a: string, b: string, sats: number, tx: TxInfo, estimated: boolean) => {
    if (kind === "cospend" && a > b) [a, b] = [b, a];
    const id = `${kind}:${a}>${b}`;
    const e = map.get(id) ?? { id, kind, a, b, sats: 0, count: 0, txids: [], estimated: false, weak: hot.has(a) || hot.has(b) };
    e.sats += sats;
    e.count++;
    e.estimated ||= estimated;
    e.txids.push(tx.txid);
    if (tx.time !== undefined) {
      e.firstTime = e.firstTime === undefined ? tx.time : Math.min(e.firstTime, tx.time);
      e.lastTime = e.lastTime === undefined ? tx.time : Math.max(e.lastTime, tx.time);
    }
    map.set(id, e);
  };
  for (const tx of txs) {
    if (isNoise(tx, noise)) {
      filtered++;
      continue;
    }
    const inValue = new Map<string, number>();
    for (const i of tx.vin) if (i.address && mine.has(i.address)) inValue.set(i.address, (inValue.get(i.address) ?? 0) + (i.value ?? 0));
    const outValue = new Map<string, number>();
    for (const o of tx.vout) if (o.address && mine.has(o.address)) outValue.set(o.address, (outValue.get(o.address) ?? 0) + (o.value ?? 0));
    const total = tx.vin.reduce((s, i) => s + (i.value ?? 0), 0);
    const spenders = [...inValue.keys()];
    for (let i = 0; i < spenders.length; i++) for (let j = i + 1; j < spenders.length; j++) add("cospend", spenders[i], spenders[j], 0, tx, false);
    for (const [a, v] of inValue) {
      const share = total > 0 ? v / total : 1;
      for (const [b, out] of outValue) if (b !== a && !inValue.has(b)) add("pay", a, b, Math.round(out * share), tx, share < 1);
    }
  }
  return { edges: [...map.values()], filtered };
}

/** Reads each address's window, finds the transactions that two or more share, reads only those, and relates them. */
export async function correlate(addresses: readonly string[], win: TimeWindow, signal: AbortSignal, opts: CorrelateOptions): Promise<Correlation> {
  const nowS = Math.floor(Date.now() / 1000);
  const withUnconfirmed = win.to >= nowS;
  const infos: Record<string, AddrInfo> = {};
  const sets = new Map<string, Set<string>>();
  const cache = new Map<string, TxInfo>();
  let requests = 0;
  let done = 0;
  const total = addresses.length;
  const tick = () => opts.onProgress?.(done, total, requests);

  await pool([...addresses], 2, async (a) => {
    const info: AddrInfo = { address: a, entries: 0, complete: true, via: "summary", hot: false, failed: false };
    let set = new Set<string>();
    try {
      const s = await scanSummary(a, win, signal, SUMMARY_PAGES, () => {
        requests++;
        tick();
      });
      set = new Set([...s.entries, ...(withUnconfirmed ? s.unconfirmed : [])].map((e) => e.txid));
      info.complete = s.complete;
    } catch (e) {
      if (!(e instanceof NotFoundError) && !(e instanceof NetworkError)) throw e;
      // No summary endpoint (or it failed): read the window the slow way, within a budget.
      info.via = "paging";
      try {
        const r = await scanWindow(a, win, signal, { budget: SUMMARY_PAGES, noSummary: true, onProgress: () => (requests++, tick()) });
        for (const t of r.txs) {
          set.add(t.tx.txid);
          cache.set(t.tx.txid, t.tx);
        }
        info.complete = r.complete;
      } catch (e2) {
        if (!(e2 instanceof NetworkError) && !(e2 instanceof NotFoundError) && !(e2 instanceof BadResponseError)) throw e2;
        info.failed = true;
        info.complete = false;
      }
    }
    info.entries = set.size;
    info.hot = set.size > HOT_TX;
    infos[a] = info;
    sets.set(a, set);
    done++;
    tick();
  });

  const owners = new Map<string, string[]>();
  for (const [a, set] of sets) for (const id of set) owners.set(id, [...(owners.get(id) ?? []), a]);
  const sharedIds = [...owners].filter(([, as]) => as.length >= 2).map(([id]) => id);

  const budget = opts.detailBudget ?? DETAIL_BUDGET;
  const need = sharedIds.filter((id) => !cache.has(id));
  const toRead = need.slice(0, budget);
  await pool(toRead, 3, async (id) => {
    try {
      const tx = parseTx(parseJson(await request(`/tx/${id}`, signal, { cooldown: false, backoff: true, retries: 3 })));
      if (tx.txid !== id) throw new BadResponseError();
      cache.set(id, tx);
    } catch (e) {
      if (!(e instanceof NetworkError) && !(e instanceof NotFoundError) && !(e instanceof BadResponseError)) throw e;
      // Left unread: counted in `unread`, which makes the check incomplete.
    }
    requests++;
    tick();
  });

  const hot = new Set(Object.values(infos).filter((i) => i.hot).map((i) => i.address));
  const read = sharedIds.filter((id) => cache.has(id)).map((id) => cache.get(id)!);
  const { edges, filtered } = relate(addresses, read, opts.noise, hot);
  const unread = sharedIds.length - read.length;
  const complete = unread === 0 && Object.values(infos).every((i) => i.complete && !i.failed);
  return { infos, edges, shared: sharedIds.length, read: read.length, unread, filtered, requests, complete };
}

export interface Verdict {
  /** Joined by strong links (and by the kinds the user left switched on). */
  connected: boolean;
  /** The route from the first target to the second, if any: nodes and the links between them. */
  path?: { nodes: string[]; edges: PairEdge[] };
  /** A route that needs a hub: weak, kept apart. Only looked for when there is no strong one. */
  weakPath?: { nodes: string[]; edges: PairEdge[] };
  /** Addresses that paid (directly or through others) both targets. */
  commonUpstream: string[];
  /** Addresses both targets paid. */
  commonDownstream: string[];
}

export interface Kinds {
  pay: boolean;
  cospend: boolean;
}

function route(edges: PairEdge[], from: string, to: string): { nodes: string[]; edges: PairEdge[] } | undefined {
  const adj = new Map<string, { to: string; e: PairEdge }[]>();
  for (const e of edges) {
    adj.set(e.a, [...(adj.get(e.a) ?? []), { to: e.b, e }]);
    adj.set(e.b, [...(adj.get(e.b) ?? []), { to: e.a, e }]);
  }
  const prev = new Map<string, { from: string; e: PairEdge } | null>([[from, null]]);
  for (const queue = [from]; queue.length; ) {
    const n = queue.shift()!;
    if (n === to) break;
    for (const x of adj.get(n) ?? [])
      if (!prev.has(x.to)) {
        prev.set(x.to, { from: n, e: x.e });
        queue.push(x.to);
      }
  }
  if (!prev.has(to)) return undefined;
  const nodes = [to];
  const es: PairEdge[] = [];
  for (let n = to; prev.get(n); ) {
    const p = prev.get(n)!;
    es.unshift(p.e);
    nodes.unshift(p.from);
    n = p.from;
  }
  return { nodes, edges: es };
}

/** Everything that can reach (`up`) or be reached from (`down`) `start` along payments. */
function closure(edges: PairEdge[], start: string, up: boolean): Set<string> {
  const seen = new Set<string>();
  for (const queue = [start]; queue.length; ) {
    const n = queue.shift()!;
    for (const e of edges) {
      if (e.kind !== "pay") continue;
      const [near, far] = up ? [e.b, e.a] : [e.a, e.b];
      if (near === n && !seen.has(far)) {
        seen.add(far);
        queue.push(far);
      }
    }
  }
  return seen;
}

/** Are the two targets joined? The form "X pays Y, X pays A, Y pays B" is covered: A and B share the ancestor X. */
export function analyse(edges: PairEdge[], first: string, second: string, kinds: Kinds = { pay: true, cospend: true }): Verdict {
  const on = edges.filter((e) => (e.kind === "pay" ? kinds.pay : kinds.cospend));
  const strong = on.filter((e) => !e.weak);
  const path = route(strong, first, second);
  const weakPath = path ? undefined : route(on, first, second);
  const common = (up: boolean) => {
    const a = closure(strong, first, up);
    const b = closure(strong, second, up);
    return [...a].filter((x) => b.has(x) && x !== first && x !== second);
  };
  return { connected: !!path, path, weakPath, commonUpstream: common(true), commonDownstream: common(false) };
}

/** Most addresses a check may hold, so a search cannot grow without end. */
export const MAX_ADDRESSES = 90;
/** Neighbours kept per expanded address. */
export const PER_NODE = 25;

/** An address seen next to another one inside the window: it paid it, was paid by it, or was spent together with it. */
export interface Neighbour {
  address: string;
  count: number;
  sats: number;
}

/**
 * Everyone that touches `address` in these transactions. When it receives, the neighbours are the inputs;
 * when it spends, they are the outputs (not change) and the other inputs, which belong to the same wallet.
 * Ranked by how often they appear, then by amount, so a small but recurring partner is not lost behind a big one.
 */
export function neighbours(address: string, txs: readonly AddressTx[], noise: number): Neighbour[] {
  const map = new Map<string, Neighbour>();
  const add = (a: string | undefined, sats: number) => {
    if (!a || a === address) return;
    const n = map.get(a) ?? { address: a, count: 0, sats: 0 };
    n.count++;
    n.sats += sats;
    map.set(a, n);
  };
  for (const { tx } of txs) {
    if (isNoise(tx, noise)) continue;
    const signers = new Set(tx.vin.map((i) => i.address));
    // Each input address once, with what it put in; an address that signed spends together with the others.
    const inputs = new Map<string, number>();
    for (const i of tx.vin) if (i.address) inputs.set(i.address, (inputs.get(i.address) ?? 0) + (i.value ?? 0));
    for (const [a, v] of inputs) add(a, v);
    if (signers.has(address)) for (const o of tx.vout) if (o.address && !signers.has(o.address)) add(o.address, o.value ?? 0);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || b.sats - a.sats || a.address.localeCompare(b.address));
}

/**
 * Which addresses to widen next: the targets first, then whoever already has links (they are on the way to something),
 * then the quietest ones. Hubs are never widened (their neighbours are everybody), nor is anything done twice.
 */
export function pickFrontier(
  targets: readonly string[],
  edges: readonly PairEdge[],
  infos: Record<string, AddrInfo>,
  expanded: ReadonlySet<string>,
  limit: number,
): string[] {
  const degree = new Map<string, number>();
  for (const e of edges) for (const a of [e.a, e.b]) degree.set(a, (degree.get(a) ?? 0) + 1);
  const rank = (a: string) => (targets.includes(a) ? -1 : 0);
  return Object.keys(infos)
    .filter((a) => !expanded.has(a) && !infos[a].hot && !infos[a].failed)
    .sort((a, b) => rank(a) - rank(b) || (degree.get(b) ?? 0) - (degree.get(a) ?? 0) || infos[a].entries - infos[b].entries)
    .slice(0, limit);
}

/**
 * Widens by one layer: reads each of `nodes` in the window and returns their neighbours that are not known yet
 * (at most `perNode` each, at most `room` in all). `incomplete` counts nodes whose window could not be read fully.
 */
export async function expand(
  nodes: readonly string[],
  known: ReadonlySet<string>,
  win: TimeWindow,
  signal: AbortSignal,
  opts: { noise: number; perNode?: number; room: number; budget?: number; onNode?: (done: number, total: number) => void },
): Promise<{ added: string[]; incomplete: number }> {
  const added: string[] = [];
  let incomplete = 0;
  let done = 0;
  for (const n of nodes) {
    if (added.length >= opts.room) break;
    try {
      const r = await scanWindow(n, win, signal, { budget: opts.budget ?? 30 });
      if (!r.complete) incomplete++;
      for (const x of neighbours(n, r.txs, opts.noise).slice(0, opts.perNode ?? PER_NODE)) {
        if (known.has(x.address) || added.includes(x.address)) continue;
        if (added.length < opts.room) added.push(x.address);
      }
    } catch (e) {
      if (!(e instanceof NetworkError) && !(e instanceof NotFoundError) && !(e instanceof BadResponseError)) throw e;
      incomplete++;
    }
    opts.onNode?.(++done, nodes.length);
  }
  return { added, incomplete };
}
