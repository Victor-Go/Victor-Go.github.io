import type { PairEdge } from "./correlate";

export const V_NODE_W = 132;
export const V_NODE_H = 44;
const COL_GAP = 110;
const ROW = V_NODE_H + 30;
const PAD = 10;

export interface Placed {
  id: string;
  x: number;
  y: number;
}

/**
 * Columns by payment order: whoever pays comes left of whoever is paid (longest chain of payments),
 * so "X pays Y, X pays A, Y pays B" reads left to right. Addresses with no payment sit in the first column.
 */
export function layoutVerify(ids: readonly string[], edges: readonly PairEdge[]): { nodes: Placed[]; width: number; height: number } {
  const set = new Set(ids);
  const layer = new Map(ids.map((id) => [id, 0]));
  const pays = edges.filter((e) => e.kind === "pay" && set.has(e.a) && set.has(e.b));
  // At most n rounds: a payment cycle cannot push the columns apart forever.
  for (let round = 0; round < ids.length; round++) {
    let changed = false;
    for (const e of pays) {
      const want = Math.min(ids.length - 1, layer.get(e.a)! + 1);
      if (layer.get(e.b)! < want) {
        layer.set(e.b, want);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const columns = new Map<number, string[]>();
  for (const id of ids) columns.set(layer.get(id)!, [...(columns.get(layer.get(id)!) ?? []), id]);
  const tallest = Math.max(1, ...[...columns.values()].map((c) => c.length));
  const nodes: Placed[] = [];
  const used = [...columns.keys()].sort((a, b) => a - b);
  used.forEach((l, col) => {
    const list = columns.get(l)!;
    const top = ((tallest - list.length) * ROW) / 2;
    list.forEach((id, i) => nodes.push({ id, x: PAD + col * (V_NODE_W + COL_GAP), y: 20 + top + i * ROW }));
  });
  return {
    nodes,
    width: PAD * 2 + used.length * V_NODE_W + Math.max(0, used.length - 1) * COL_GAP,
    height: 20 + tallest * ROW,
  };
}
