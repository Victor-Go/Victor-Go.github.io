import type { Flow, Flows } from "./aggregate";

export type Side = "src" | "dst";

export interface GNode {
  id: string;
  side: Side | "center";
  /** Distance from the target: 0 is the target itself. */
  level: 0 | 1 | 2;
  address?: string;
  /** Satoshis between this node and the layer nearer the target. */
  sats: number;
  /** Set on a "N more" node: how many are hidden behind it. */
  fold?: number;
  parent?: string;
  /** Reading this address in the window did not finish: its neighbours are partial. */
  incomplete?: boolean;
  loading?: boolean;
  failed?: boolean;
  x: number;
  y: number;
}

export interface GEdge {
  id: string;
  /** Money moves from `from` to `to`. */
  from: string;
  to: string;
  /** Absent on the dashed link of a "N more" node. */
  flow?: Flow;
}

/** What is known about one neighbour once it has been scanned in the same window. */
export interface Neighbor {
  status: "loading" | "done" | "error";
  flows?: Flows;
  complete?: boolean;
}

export interface GraphInput {
  center: string;
  flows: Flows;
  neighbors: Record<string, Neighbor | undefined>;
  hops: 1 | 2;
  /** At most this many nodes per parent and per step; the rest fold into "N more". */
  perLayer: number;
  /** How many extra steps of `perLayer` the user has opened, by moreKey(side, parent id). */
  more: Record<string, number>;
}

export interface Graph {
  nodes: GNode[];
  edges: GEdge[];
  width: number;
  height: number;
  /** Column x of each level, for the column headings. */
  columns: { level: 0 | 1 | 2; side: Side | "center"; x: number }[];
}

export const NODE_W = 132;
export const NODE_H = 44;
const COL_GAP = 60;
const ROW = NODE_H + 16;
const TOP = 36;
const PAD = 10;

export const centerId = "c";

/** The key under which the user's "show more" steps are counted: per side, so the two folds at the target are independent. */
export const moreKey = (side: Side, parent: string): string => `${side}:${parent}`;

const shown = (inp: GraphInput, side: Side, parent: string) => inp.perLayer * (1 + (inp.more[moreKey(side, parent)] ?? 0));

/** The children of one parent: the biggest ones up to the allowance, then a fold node for the rest. */
function children(list: Flow[], inp: GraphInput, parent: string, side: Side, level: 1 | 2): GNode[] {
  const n = shown(inp, side, parent);
  const out: GNode[] = list.slice(0, n).map((f) => ({
    id: `${side}:${parent}:${f.address}`,
    side,
    level,
    address: f.address,
    sats: f.sats,
    parent,
    x: 0,
    y: 0,
  }));
  if (list.length > n) out.push({ id: `${side}:${parent}:fold`, side, level, sats: 0, fold: list.length - n, parent, x: 0, y: 0 });
  return out;
}

const flowOf = (side: Side, flows: Flows) => (side === "src" ? flows.sources : flows.destinations);

/**
 * Builds the column layout: sources on the left, destinations on the right, the target in the middle.
 * Layout is plain columns (no force simulation), so the same address can stand on both sides.
 */
export function buildGraph(inp: GraphInput): Graph {
  const nodes: GNode[] = [{ id: centerId, side: "center", level: 0, address: inp.center, sats: 0, x: 0, y: 0 }];
  const edges: GEdge[] = [];
  const flowById = new Map<string, Flow>();
  const link = (n: GNode, parent: GNode) => {
    const flow = n.fold ? undefined : flowById.get(n.id);
    edges.push(
      n.side === "src"
        ? { id: `${n.id}>${parent.id}`, from: n.id, to: parent.id, flow }
        : { id: `${parent.id}>${n.id}`, from: parent.id, to: n.id, flow },
    );
  };

  // y of each side is computed on its own, then both are centred on each other.
  const extent: Record<Side, [number, number]> = { src: [0, 0], dst: [0, 0] };
  for (const side of ["src", "dst"] as const) {
    const level1 = children(flowOf(side, inp.flows), inp, centerId, side, 1);
    for (const n of level1) {
      const f = flowOf(side, inp.flows).find((x) => x.address === n.address);
      if (f) flowById.set(n.id, f);
    }
    let cursor = 0;
    const placed: GNode[] = [];
    for (const n of level1) {
      nodes.push(n);
      link(n, nodes[0]);
      let kids: GNode[] = [];
      if (inp.hops === 2 && n.address) {
        const nb = inp.neighbors[n.address];
        if (nb?.status === "loading" || nb === undefined) n.loading = true;
        else if (nb.status === "error") n.failed = true;
        else if (nb.flows) {
          if (nb.complete === false) n.incomplete = true;
          const list = flowOf(side, nb.flows).filter((f) => f.address !== inp.center && f.address !== n.address);
          kids = children(list, inp, n.id, side, 2);
          for (const k of kids) {
            const f = list.find((x) => x.address === k.address);
            if (f) flowById.set(k.id, f);
          }
        }
      }
      for (const k of kids) {
        k.y = cursor;
        cursor += ROW;
        nodes.push(k);
        link(k, n);
        placed.push(k);
      }
      if (kids.length) n.y = (kids[0].y + kids[kids.length - 1].y) / 2;
      else {
        n.y = cursor;
        cursor += ROW;
      }
      placed.push(n);
    }
    const ys = placed.map((n) => n.y);
    extent[side] = ys.length ? [Math.min(...ys), Math.max(...ys)] : [0, 0];
  }

  const mid = (e: [number, number]) => (e[0] + e[1]) / 2;
  const centerY = Math.max(mid(extent.src), mid(extent.dst));
  for (const n of nodes) {
    if (n.side === "center") continue;
    n.y += centerY - mid(extent[n.side as Side]);
  }
  nodes[0].y = centerY;

  const minY = Math.min(...nodes.map((n) => n.y));
  const maxY = Math.max(...nodes.map((n) => n.y));
  const colX = (col: number) => PAD + col * (NODE_W + COL_GAP);
  const colOf = (n: GNode) => (n.side === "src" ? inp.hops - n.level : n.side === "dst" ? inp.hops + n.level : inp.hops);
  for (const n of nodes) {
    n.x = colX(colOf(n));
    n.y = n.y - minY + TOP;
  }
  const columns = [
    ...(inp.hops === 2 ? [{ level: 2 as const, side: "src" as const, x: colX(0) }] : []),
    { level: 1 as const, side: "src" as const, x: colX(inp.hops - 1) },
    { level: 0 as const, side: "center" as const, x: colX(inp.hops) },
    { level: 1 as const, side: "dst" as const, x: colX(inp.hops + 1) },
    ...(inp.hops === 2 ? [{ level: 2 as const, side: "dst" as const, x: colX(4) }] : []),
  ];
  return {
    nodes,
    edges,
    columns,
    width: colX(2 * inp.hops + 1) - COL_GAP + PAD,
    height: maxY - minY + TOP + NODE_H + PAD,
  };
}

/** "1Abc…x1": the ends of an address, the middle left out. */
export function shortAddress(a: string): string {
  return a.length > 13 ? `${a.slice(0, 5)}…${a.slice(-4)}` : a;
}
