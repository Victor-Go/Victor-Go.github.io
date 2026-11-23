import { useEffect, useMemo, useRef, useState } from "react";
import { NumberInput } from "./NumberInput";
import { usePanZoom } from "./usePanZoom";
import { formatBtc } from "../scan/query";
import { scanWindow } from "./api";
import { aggregate } from "./aggregate";
import { NODE_H, NODE_W, buildGraph, centerId, moreKey, shortAddress, type GEdge, type GNode, type Neighbor } from "./graphModel";
import { dateTime, windowOf } from "./view";
import type { Done } from "./Tracer";
import type { Messages } from "./i18n";

/** Neighbours are read a couple at a time: the providers throttle bursts. */
const NEIGHBOR_PARALLEL = 2;
/** One neighbour may use this many requests; past it the node is marked incomplete. */
const NEIGHBOR_BUDGET = 30;

const btc = (sats: number): string => `${formatBtc(sats).replace(/0+$/, "").replace(/\.$/, "")} BTC`;
const day = (t?: number): string => (t === undefined ? "" : dateTime(t));

type Selected = { kind: "node"; id: string } | { kind: "edge"; id: string } | undefined;

export function Graph({ done, m, onTrace }: { done: Done; m: Messages; onTrace: (a: string) => void }) {
  const { view, flows, scan } = done;
  const [hops, setHops] = useState<1 | 2>(2);
  const [perLayer, setPerLayer] = useState(2);
  const [more, setMore] = useState<Record<string, number>>({});
  const [neighbors, setNeighbors] = useState<Record<string, Neighbor>>({});
  const [selected, setSelected] = useState<Selected>();
  const txs = useRef(new Map(scan.txs.map((t) => [t.tx.txid, t.tx])));

  const graph = useMemo(
    () => buildGraph({ center: view.address, flows, neighbors, hops, perLayer, more }),
    [view.address, flows, neighbors, hops, perLayer, more],
  );

  // Read the neighbours that are on screen (two hops need their own flows), a few at a time.
  const started = useRef(new Set<string>());
  const queue = useRef<string[]>([]);
  const running = useRef(0);
  const ctl = useRef(new AbortController());
  useEffect(() => {
    const c = ctl.current;
    return () => c.abort();
  }, []);

  useEffect(() => {
    if (hops !== 2) return;
    for (const n of graph.nodes) {
      if (n.level === 1 && n.address && !started.current.has(n.address)) {
        started.current.add(n.address);
        queue.current.push(n.address);
      }
    }
    const pump = () => {
      while (running.current < NEIGHBOR_PARALLEL && queue.current.length) {
        const a = queue.current.shift()!;
        running.current++;
        setNeighbors((s) => ({ ...s, [a]: { status: "loading" } }));
        void scanWindow(a, windowOf(view), ctl.current.signal, { budget: NEIGHBOR_BUDGET })
          .then((r) => {
            for (const t of r.txs) txs.current.set(t.tx.txid, t.tx);
            setNeighbors((s) => ({ ...s, [a]: { status: "done", flows: aggregate(a, r.txs, view.noise), complete: r.complete } }));
          })
          .catch(() => {
            if (!ctl.current.signal.aborted) setNeighbors((s) => ({ ...s, [a]: { status: "error" } }));
          })
          .finally(() => {
            running.current--;
            pump();
          });
      }
    };
    pump();
  }, [graph, hops, view]);

  const { box, tf, fit, handlers } = usePanZoom(graph.width);

  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const pick = (n: GNode) => {
    if (n.fold) {
      const key = moreKey(n.side as "src" | "dst", n.parent!);
      setMore((s) => ({ ...s, [key]: (s[key] ?? 0) + 1 }));
    }
    else setSelected({ kind: "node", id: n.id });
  };
  const sel = selected?.kind === "node" ? byId.get(selected.id) : undefined;
  const selEdge = selected?.kind === "edge" ? graph.edges.find((e) => e.id === selected.id) : undefined;
  const heading = (c: { level: number; side: string }) =>
    c.side === "center" ? m.colCenter : c.side === "src" ? (c.level === 2 ? m.colBack2 : m.colBack1) : c.level === 2 ? m.colFwd2 : m.colFwd1;

  return (
    <div className="t-graph">
      <div className="t-graph-bar">
        <label>
          {m.hops}{" "}
          <select className="s-select" value={hops} onChange={(e) => setHops(Number(e.target.value) as 1 | 2)}>
            <option value={1}>1</option>
            <option value={2}>2</option>
          </select>
        </label>
        <label>
          {m.perLayer}{" "}
          <NumberInput value={perLayer} min={1} max={10} onChange={setPerLayer} />
        </label>
        <button type="button" onClick={fit}>{m.resetView}</button>
      </div>
      <p className="c-hint">{m.directNote} {m.graphHint}</p>
      <div
        className="t-graph-box"
        style={{ height: Math.max(220, graph.height + 16) }}
        ref={box}
        {...handlers}
      >
        <svg width="100%" height="100%" role="img" aria-label={m.viewGraph}>
          <defs>
            <marker id="t-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10z" className="t-g-arrow" />
            </marker>
          </defs>
          <g transform={`translate(${tf.x} ${tf.y}) scale(${tf.k})`}>
            {graph.columns.map((c) => (
              <text key={`${c.side}${c.level}`} x={c.x + NODE_W / 2} y={16} textAnchor="middle" className="t-g-col">
                {heading(c)}
              </text>
            ))}
            {graph.edges.map((e) => (
              <Edge key={e.id} e={e} from={byId.get(e.from)!} to={byId.get(e.to)!} active={selEdge?.id === e.id} onPick={() => setSelected({ kind: "edge", id: e.id })} />
            ))}
            {graph.nodes.map((n) => (
              <Node key={n.id} n={n} m={m} active={sel?.id === n.id} onPick={() => pick(n)} />
            ))}
          </g>
        </svg>
      </div>
      {(sel || selEdge) && (
        <aside className="t-drawer" aria-label={sel ? m.nodeAddress : m.edgeTitle}>
          <button type="button" className="t-drawer-x" onClick={() => setSelected(undefined)}>{m.closePanel}</button>
          {sel && <NodeInfo n={sel} m={m} onTrace={onTrace} nb={sel.address ? neighbors[sel.address] : undefined} />}
          {selEdge && <EdgeInfo e={selEdge} m={m} byId={byId} txs={txs.current} />}
        </aside>
      )}
    </div>
  );
}

function Node({ n, m, active, onPick }: { n: GNode; m: Messages; active: boolean; onPick: () => void }) {
  const cls = ["t-g-node", `t-g-${n.side}`, n.fold && "t-g-fold", n.incomplete && "t-g-warn", active && "t-g-active"].filter(Boolean).join(" ");
  return (
    <g
      className={cls}
      transform={`translate(${n.x} ${n.y})`}
      role="button"
      tabIndex={0}
      onClick={onPick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onPick())}
    >
      <rect width={NODE_W} height={NODE_H} rx={8} />
      {n.fold ? (
        <text x={NODE_W / 2} y={NODE_H / 2 + 5} textAnchor="middle">{m.more(n.fold)}</text>
      ) : (
        <>
          <text x={NODE_W / 2} y={18} textAnchor="middle">{shortAddress(n.address!)}</text>
          <text x={NODE_W / 2} y={35} textAnchor="middle" className="t-g-amt">
            {n.id === centerId ? "" : n.loading ? m.loadingNode : n.failed ? "!" : btc(n.sats)}
          </text>
          {n.incomplete && <text x={NODE_W - 8} y={14} textAnchor="end" className="t-g-flag">⚠</text>}
        </>
      )}
    </g>
  );
}

function Edge({ e, from, to, active, onPick }: { e: GEdge; from: GNode; to: GNode; active: boolean; onPick: () => void }) {
  const x1 = from.x + NODE_W;
  const y1 = from.y + NODE_H / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_H / 2;
  const mid = (x1 + x2) / 2;
  const d = `M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2 - 2} ${y2}`;
  return (
    <g className={["t-g-edge", !e.flow && "t-g-edge-dash", active && "t-g-active"].filter(Boolean).join(" ")}>
      <path d={d} markerEnd="url(#t-arrow)" fill="none" />
      {e.flow && <path d={d} className="t-g-hit" fill="none" onClick={onPick} />}
    </g>
  );
}

function NodeInfo({ n, m, onTrace, nb }: { n: GNode; m: Messages; onTrace: (a: string) => void; nb?: Neighbor }) {
  return (
    <div>
      <p className="t-drawer-addr">{n.address}</p>
      {n.sats > 0 && <p className="c-hint">{m.amountBetween}: {btc(n.sats)}</p>}
      {(n.incomplete || (nb && nb.complete === false)) && <p className="c-notice">{m.incompleteNode}</p>}
      {n.failed && <p className="c-error">{m.failedNode}</p>}
      <p>
        <a className="c-link" href={`/scan/?q=${n.address}`} target="_blank" rel="noreferrer noopener">{m.explorer}</a>
        {n.id !== centerId && (
          <>
            {" · "}
            <button type="button" className="c-link" onClick={() => onTrace(n.address!)}>{m.traceFromHere}</button>
          </>
        )}
      </p>
    </div>
  );
}

function EdgeInfo({ e, m, byId, txs }: { e: GEdge; m: Messages; byId: Map<string, GNode>; txs: Map<string, { fee?: number }> }) {
  const f = e.flow!;
  const fee = f.count === 1 ? txs.get(f.txids[0])?.fee : undefined;
  return (
    <div>
      <p className="t-drawer-addr">
        {shortAddress(byId.get(e.from)?.address ?? "")} → {shortAddress(byId.get(e.to)?.address ?? "")}
      </p>
      <div className="s-kv"><span className="s-k">{m.edgeAmount}</span><span className="s-v">{btc(f.sats)}{f.estimated ? ` (${m.estimated})` : ""}</span></div>
      <div className="s-kv"><span className="s-k">{m.edgeCount}</span><span className="s-v">{f.count}</span></div>
      <div className="s-kv"><span className="s-k">{m.edgeDate}</span><span className="s-v">{f.firstTime === undefined ? m.unconfirmed : m.firstLast(day(f.firstTime), day(f.lastTime))}</span></div>
      {fee !== undefined && <div className="s-kv"><span className="s-k">{m.edgeFee}</span><span className="s-v">{fee} {m.sat}</span></div>}
      <ul className="t-rows">
        {f.txids.slice(0, 5).map((id) => (
          <li key={id} className="t-row">
            <a className="c-link t-addr" href={`/scan/?q=${id}`} target="_blank" rel="noreferrer noopener">{id}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
