import type { AddressTx, TxInfo } from "../shared/esplora/parse";

/** One counterparty of the target address inside the window. */
export interface Flow {
  address: string;
  /** Satoshis that moved between the target and this address (estimated when `estimated`). */
  sats: number;
  /** Number of transactions it appears in. */
  count: number;
  firstTime?: number;
  lastTime?: number;
  /** Newest first. */
  txids: string[];
  /** The amount is a share of a multi-party transaction, not a plain payment. */
  estimated: boolean;
}

export interface Flows {
  /** Where the money came from: addresses that paid the target. */
  sources: Flow[];
  /** Where it went: addresses the target paid. */
  destinations: Flow[];
  /** Transactions left out because they have more inputs or outputs than the noise limit. */
  filtered: number;
  /** Transactions looked at. */
  total: number;
}

/** Transactions with more inputs or outputs than this are mostly batch payouts or dust sprays. */
export const DEFAULT_NOISE_LIMIT = 8;

/**
 * Batch payouts and dust sprays have many outputs. A transaction with many inputs but at most two outputs is a
 * consolidation: its inputs belong together, which is the strongest evidence there is, so it is never noise.
 * Many inputs AND many outputs (a mix) is noise.
 */
export const isNoise = (tx: TxInfo, limit: number): boolean => tx.vout.length > limit || (tx.vin.length > limit && tx.vout.length > 2);

const inputsOf = (tx: TxInfo, me: string) => tx.vin.filter((i) => i.address !== undefined && i.address !== me && !i.coinbase);

/**
 * Splits the target's transactions into sources and destinations.
 * - The target is among the inputs (it spent): every output that is not back to one of the inputs (change)
 *   is a destination, carrying the target's share of the inputs' value.
 * - Otherwise (it only received): every input address is a source, carrying its share of what the target received.
 */
export function aggregate(address: string, txs: AddressTx[], noiseLimit = DEFAULT_NOISE_LIMIT): Flows {
  const sources = new Map<string, Flow>();
  const destinations = new Map<string, Flow>();
  let filtered = 0;

  const add = (m: Map<string, Flow>, addr: string, sats: number, tx: TxInfo, estimated: boolean) => {
    const f = m.get(addr) ?? { address: addr, sats: 0, count: 0, txids: [], estimated: false };
    f.sats += sats;
    f.count++;
    f.estimated ||= estimated;
    f.txids.push(tx.txid);
    if (tx.time !== undefined) {
      f.firstTime = f.firstTime === undefined ? tx.time : Math.min(f.firstTime, tx.time);
      f.lastTime = f.lastTime === undefined ? tx.time : Math.max(f.lastTime, tx.time);
    }
    m.set(addr, f);
  };

  for (const { tx } of txs) {
    if (isNoise(tx, noiseLimit)) {
      filtered++;
      continue;
    }
    const total = tx.vin.reduce((s, i) => s + (i.value ?? 0), 0);
    const mine = tx.vin.filter((i) => i.address === address).reduce((s, i) => s + (i.value ?? 0), 0);
    if (mine > 0) {
      const inputSet = new Set(tx.vin.map((i) => i.address));
      const outs = tx.vout.filter((o) => o.address !== undefined && o.address !== address && !inputSet.has(o.address));
      const share = total > 0 ? mine / total : 1;
      const estimated = share < 1 || outs.length > 1;
      for (const o of outs) add(destinations, o.address!, Math.round((o.value ?? 0) * share), tx, estimated);
    } else {
      const received = tx.vout.filter((o) => o.address === address).reduce((s, o) => s + (o.value ?? 0), 0);
      if (received === 0) continue;
      const ins = inputsOf(tx, address);
      const sum = ins.reduce((s, i) => s + (i.value ?? 0), 0);
      const byAddr = new Map<string, number>();
      for (const i of ins) byAddr.set(i.address!, (byAddr.get(i.address!) ?? 0) + (i.value ?? 0));
      const estimated = byAddr.size > 1;
      for (const [a, v] of byAddr) add(sources, a, Math.round(sum > 0 ? (received * v) / sum : received), tx, estimated);
    }
  }

  const sort = (m: Map<string, Flow>) => [...m.values()].sort((a, b) => b.sats - a.sats || a.address.localeCompare(b.address));
  return { sources: sort(sources), destinations: sort(destinations), filtered, total: txs.length };
}

/** The `watch` addresses first (even those with no flow, as empty entries), then the rest; `rest` is what is paged. */
export function pinWatched(list: Flow[], watch: readonly string[]): { pinned: Flow[]; rest: Flow[]; missing: string[] } {
  const w = new Set(watch);
  const pinned = list.filter((f) => w.has(f.address));
  const have = new Set(pinned.map((f) => f.address));
  return { pinned, rest: list.filter((f) => !w.has(f.address)), missing: watch.filter((a) => !have.has(a)) };
}
