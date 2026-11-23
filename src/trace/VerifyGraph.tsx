import { useMemo } from "react";
import { formatBtc } from "../scan/query";
import type { PairEdge } from "./correlate";
import { shortAddress } from "./graphModel";
import { usePanZoom } from "./usePanZoom";
import { V_NODE_H, V_NODE_W, layoutVerify } from "./verifyLayout";
import { dateTime } from "./view";
import type { Messages } from "./i18n";

export type Role = "target" | "middle" | "other";

export interface VerifyGraphProps {
  ids: string[];
  roles: Record<string, Role>;
  hot: ReadonlySet<string>;
  extras: ReadonlySet<string>;
  edges: PairEdge[];
  pathEdges: ReadonlySet<string>;
  selected?: { kind: "node" | "edge"; id: string };
  onSelect: (s: { kind: "node" | "edge"; id: string }) => void;
  m: Messages;
}

const btc = (sats: number): string => `${formatBtc(sats).replace(/0+$/, "").replace(/\.$/, "")} BTC`;

export function VerifyGraph({ ids, roles, hot, extras, edges, pathEdges, selected, onSelect, m }: VerifyGraphProps) {
  const layout = useMemo(() => layoutVerify(ids, edges), [ids, edges]);
  const { box, tf, fit, handlers } = usePanZoom(layout.width);
  const at = new Map(layout.nodes.map((n) => [n.id, n]));

  return (
    <div className="t-graph">
      <div className="t-graph-bar">
        <button type="button" onClick={fit}>{m.resetView}</button>
        <span className="c-hint">{m.graphHint}</span>
      </div>
      <div className="t-graph-box" ref={box} style={{ height: Math.max(220, layout.height + 16) }} {...handlers}>
        <svg width="100%" height="100%" role="img" aria-label={m.modeVerify}>
          <defs>
            <marker id="t-varrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10z" className="t-g-arrow" />
            </marker>
          </defs>
          <g transform={`translate(${tf.x} ${tf.y}) scale(${tf.k})`}>
            {edges.map((e) => {
              const a = at.get(e.a);
              const b = at.get(e.b);
              if (!a || !b) return null;
              const rightward = a.x <= b.x;
              const same = Math.abs(a.x - b.x) < 1;
              const x1 = same ? a.x + V_NODE_W / 2 : rightward ? a.x + V_NODE_W : a.x;
              const y1 = same ? (a.y < b.y ? a.y + V_NODE_H : a.y) : a.y + V_NODE_H / 2;
              const x2 = same ? b.x + V_NODE_W / 2 : rightward ? b.x - 2 : b.x + V_NODE_W + 2;
              const y2 = same ? (a.y < b.y ? b.y - 2 : b.y + V_NODE_H + 2) : b.y + V_NODE_H / 2;
              const mx = (x1 + x2) / 2;
              const my = (y1 + y2) / 2;
              const d = same ? `M${x1} ${y1} L${x2} ${y2}` : `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;
              const cls = ["t-g-edge", e.kind === "cospend" && "t-g-edge-dash", e.weak && "t-v-weak", pathEdges.has(e.id) && "t-v-path", selected?.id === e.id && "t-g-active"]
                .filter(Boolean)
                .join(" ");
              return (
                <g key={e.id} className={cls}>
                  <path d={d} fill="none" markerEnd={e.kind === "pay" ? "url(#t-varrow)" : undefined} />
                  <path d={d} className="t-g-hit" fill="none" onClick={() => onSelect({ kind: "edge", id: e.id })} />
                  <text x={mx} y={my - 4} textAnchor="middle" className="t-v-label">
                    {e.kind === "pay" ? btc(e.sats) : m.vCospendLabel(e.count)}
                  </text>
                  {e.firstTime !== undefined && (
                    <text x={mx} y={my + 8} textAnchor="middle" className="t-v-label t-v-sub">
                      {dateTime(e.firstTime)}
                      {e.count > 1 ? ` ×${e.count}` : ""}
                    </text>
                  )}
                </g>
              );
            })}
            {layout.nodes.map((n) => {
              const role = roles[n.id] ?? "other";
              const cls = ["t-g-node", "t-v-node", `t-v-${role}`, hot.has(n.id) && "t-v-hot", extras.has(n.id) && "t-v-extra", selected?.id === n.id && "t-g-active"]
                .filter(Boolean)
                .join(" ");
              const pick = () => onSelect({ kind: "node", id: n.id });
              return (
                <g
                  key={n.id}
                  className={cls}
                  transform={`translate(${n.x} ${n.y})`}
                  role="button"
                  tabIndex={0}
                  onClick={pick}
                  onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && (ev.preventDefault(), pick())}
                >
                  <rect width={V_NODE_W} height={V_NODE_H} rx={8} />
                  <text x={V_NODE_W / 2} y={19} textAnchor="middle">{shortAddress(n.id)}</text>
                  <text x={V_NODE_W / 2} y={35} textAnchor="middle" className="t-g-amt">
                    {role === "target" ? m.vRoleTarget : hot.has(n.id) ? `⚑ ${m.vHot}` : extras.has(n.id) ? m.vExtra : role === "middle" ? m.vRoleMiddle : ""}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}
