import { useEffect, useMemo, useRef, useState } from "react";
import { Field } from "../cipher/components/Fields";
import { formatBtc } from "../scan/query";
import { BadResponseError, NetworkError, type TimeWindow } from "./api";
import { MAX_ADDRESSES, analyse, correlate, expand, pickFrontier, type Correlation, type PairEdge } from "./correlate";
import { DatePicker } from "./DatePicker";
import { NumberInput } from "./NumberInput";
import { useTrouble } from "./useTrouble";
import { shortAddress } from "./graphModel";
import { VerifyGraph, type Role } from "./VerifyGraph";
import { MAX_CANDIDATES, MAX_SEARCH, fromVerifyHash, toVerifyHash, type VerifyView } from "./verifyView";
import { MAX_NOISE, dateInput, dateTime, lastDays, publicAddress, splitWatch, windowOf } from "./view";
import type { Messages } from "./i18n";

const btc = (sats: number): string => `${formatBtc(sats).replace(/0+$/, "").replace(/\.$/, "")} BTC`;
/** Addresses widened per round after the first. */
const FRONTIER = 8;
const AUTO_ROUNDS = 3;

interface Done {
  view: VerifyView;
  /** The window that was really used (when the tool chooses it, this is where it ended). */
  win: TimeWindow;
  addresses: string[];
  extras: string[];
  corr: Correlation;
}

function errorText(e: unknown, m: Messages): string {
  if (e instanceof NetworkError) return m.errNetwork;
  if (e instanceof BadResponseError) return m.errBad;
  return m.errRetry;
}

export function Verify({ m }: { m: Messages }) {
  const initial = useRef(fromVerifyHash(location.hash)).current;
  const [first, setFirst] = useState(initial.first);
  const [second, setSecond] = useState(initial.second);
  const [cands, setCands] = useState(initial.candidates.join("\n"));
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [noise, setNoise] = useState(initial.noise);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [done, setDone] = useState<Done | undefined>();
  const abort = useRef<AbortController | undefined>(undefined);
  const today = dateInput(new Date());
  const trouble = useTrouble();

  useEffect(() => () => abort.current?.abort(), []);

  const quick = (days: number | "all") => {
    const r = days === "all" ? { from: "", to: "" } : lastDays(days);
    setFrom(r.from);
    setTo(r.to);
  };

  /** Addresses whose neighbours were already added, so a search never widens the same one twice. */
  const expanded = useRef(new Set<string>());
  /** Rounds of search run since the last plain check: kept in the URL so the link repeats them. */
  const roundsRun = useRef(0);

  async function run(autoRounds = 0) {
    const t1 = publicAddress(first);
    const t2 = publicAddress(second);
    if (!t1 || !t2 || t1 === t2) return setError(t1 && t2 ? m.vErrCount : m.errAddress);
    const list = splitWatch(cands);
    if (list.length > MAX_CANDIDATES) return setError(m.vErrTooMany);
    const candidates: string[] = [];
    for (const c of list) {
      const a = publicAddress(c);
      if (!a) return setError(m.errWatch(c));
      if (a !== t1 && a !== t2 && !candidates.includes(a)) candidates.push(a);
    }
    if (from && to && from > to) return setError(m.errRange);
    const view: VerifyView = { first: t1, second: t2, candidates, from, to, noise, search: 0 };
    const addresses = [...new Set([t1, t2, ...candidates])];

    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    expanded.current = new Set();
    roundsRun.current = 0;
    setError("");
    setDone(undefined);
    setFirst(t1);
    setSecond(t2);
    setCands(candidates.join("\n"));
    history.replaceState(null, "", `${location.pathname}${location.search}${toVerifyHash(view)}`);
    setBusy(m.vProgress(0, addresses.length, 0));
    try {
      const win = windowOf(view);
      const corr = await correlate(addresses, win, ctl.signal, { noise, onProgress: (d, t, r) => setBusy(m.vProgress(d, t, r)) });
      if (ctl.signal.aborted) return;
      const first: Done = { view, win, addresses, extras: [], corr };
      setDone(first);
      // A link that carries `s=n` repeats the search it was made after.
      if (autoRounds > 0) await searchFrom(first, autoRounds, ctl);
    } catch (e) {
      if (!ctl.signal.aborted) setError(errorText(e, m));
    } finally {
      if (abort.current === ctl) setBusy("");
    }
  }

  /**
   * Widens the check by up to `rounds` layers, stopping as soon as the targets are connected:
   * each round adds the neighbours of the addresses that are most likely on the way, then checks everything again.
   */
  async function searchFrom(start: Done, rounds: number, ctl: AbortController) {
    let cur = start;
    const win = cur.win;
    for (let r = 1; r <= rounds; r++) {
      if (analyse(cur.corr.edges, cur.view.first, cur.view.second).connected) break;
      const room = MAX_ADDRESSES - cur.addresses.length;
      const frontier = pickFrontier([cur.view.first, cur.view.second], cur.corr.edges, cur.corr.infos, expanded.current, !expanded.current.size ? 2 : FRONTIER);
      if (room <= 0 || frontier.length === 0) {
        setError(m.vMoreHopNone);
        break;
      }
      const { added } = await expand(frontier, new Set(cur.addresses), win, ctl.signal, {
        noise: cur.view.noise,
        room,
        onNode: (d, t) => setBusy(m.vRound(r, rounds, d, t)),
      });
      for (const f of frontier) expanded.current.add(f);
      if (ctl.signal.aborted) return;
      // The link now says how many rounds were run, so opening it repeats them.
      roundsRun.current = Math.min(MAX_SEARCH, roundsRun.current + 1);
      history.replaceState(null, "", `${location.pathname}${location.search}${toVerifyHash({ ...cur.view, search: roundsRun.current })}`);
      if (added.length === 0) continue;
      const addresses = [...cur.addresses, ...added];
      const corr = await correlate(addresses, win, ctl.signal, {
        noise: cur.view.noise,
        onProgress: (d, t, q) => setBusy(`${m.vRound(r, rounds, t, t)} · ${m.vProgress(d, t, q)}`),
      });
      if (ctl.signal.aborted) return;
      cur = { ...cur, addresses, extras: [...cur.extras, ...added], corr };
      setDone(cur);
    }
  }

  async function search(rounds: number) {
    if (!done) return;
    const ctl = new AbortController();
    abort.current?.abort();
    abort.current = ctl;
    setError("");
    try {
      await searchFrom(done, rounds, ctl);
    } catch (e) {
      if (!ctl.signal.aborted) setError(errorText(e, m));
    } finally {
      if (abort.current === ctl) setBusy("");
    }
  }

  useEffect(() => {
    if (initial.first && initial.second) void run(initial.search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <p className="c-hint">{m.vIntro}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <Field label={m.vTarget1} value={first} onChange={setFirst} m={m} singleLine />
        <Field label={m.vTarget2} value={second} onChange={setSecond} m={m} singleLine />
        <Field label={m.vCandidates} value={cands} onChange={setCands} m={m} rows={3} />
        <fieldset className="t-window">
          <legend>{m.windowLabel}</legend>
          <DatePicker label={m.from} value={from} max={to || today} onChange={setFrom} placeholder={m.anyDate} locale={m.locale} />
          <DatePicker label={m.to} value={to} min={from || undefined} max={today} onChange={setTo} placeholder={m.anyDate} locale={m.locale} />
          <span className="t-quick">
            <button type="button" onClick={() => quick(7)}>{m.quick7}</button>
            <button type="button" onClick={() => quick(30)}>{m.quick30}</button>
            <button type="button" onClick={() => quick(365)}>{m.quick365}</button>
            <button type="button" onClick={() => quick("all")}>{m.quickAll}</button>
          </span>
        </fieldset>
        <label className="t-noise">
          {m.noiseLabel}{" "}
          <NumberInput value={noise} min={2} max={MAX_NOISE} onChange={setNoise} />
        </label>
        <div className="c-actions">
          <button type="submit" className="c-primary" disabled={!!busy}>{busy ? m.running : m.vRun}</button>
          <button type="button" disabled={!!busy} onClick={() => void run(AUTO_ROUNDS)} title={m.vAutoHint}>{m.vAuto}</button>
          <button type="button" disabled={!!busy || !done || done.addresses.length >= MAX_ADDRESSES} onClick={() => void search(1)} title={m.vMoreHopHint}>{m.vMoreHop}</button>
          {busy && (
            <button
              type="button"
              onClick={() => {
                abort.current?.abort();
                setBusy("");
              }}
            >
              {m.stop}
            </button>
          )}
        </div>
      </form>
      {busy && <p role="status" className="c-hint">{busy}</p>}
      {busy && trouble && <p role="status" className="c-notice">{m.trouble(trouble.status)}</p>}
      {error && <p role="alert" className="c-error">{error}</p>}
      {done && <Outcome done={done} m={m} />}
    </>
  );
}

function Outcome({ done, m }: { done: Done; m: Messages }) {
  const { corr, view } = done;
  const [kinds, setKinds] = useState({ pay: true, cospend: true, weak: true });
  const [others, setOthers] = useState(false);
  const [selected, setSelected] = useState<{ kind: "node" | "edge"; id: string } | undefined>();

  const verdict = useMemo(() => analyse(corr.edges, view.first, view.second, kinds), [corr.edges, view.first, view.second, kinds]);
  const edges = corr.edges.filter((e) => (e.kind === "pay" ? kinds.pay : kinds.cospend) && (e.weak ? kinds.weak : true));
  const shown = verdict.path ?? (kinds.weak ? verdict.weakPath : undefined);
  const roles: Record<string, Role> = {};
  for (const a of done.addresses) roles[a] = "other";
  for (const a of [...(shown?.nodes ?? []), ...verdict.commonUpstream, ...verdict.commonDownstream]) roles[a] = "middle";
  roles[view.first] = "target";
  roles[view.second] = "target";
  const hidden = done.addresses.filter((a) => roles[a] === "other");
  const ids = others ? done.addresses : done.addresses.filter((a) => roles[a] !== "other");
  const hot = new Set(Object.values(corr.infos).filter((i) => i.hot).map((i) => i.address));
  const pathEdges = new Set((shown?.edges ?? []).map((e) => e.id));

  const sh = shortAddress;
  const names = (xs: string[]) => xs.map(sh).join("、");
  const walk = (p: { nodes: string[]; edges: PairEdge[] }) =>
    p.nodes
      .map((n, i) => {
        if (i === 0) return sh(n);
        const e = p.edges[i - 1];
        const arrow = e.kind === "cospend" ? "⇄" : e.a === p.nodes[i - 1] ? "→" : "←";
        return ` ${arrow} ${sh(n)}`;
      })
      .join("");

  const status = verdict.connected ? "ok" : corr.complete ? "none" : "partial";
  const sel = selected?.kind === "node" ? selected.id : undefined;
  const selEdge = selected?.kind === "edge" ? corr.edges.find((e) => e.id === selected.id) : undefined;

  return (
    <section aria-live="polite" className="t-verify">
      <div className={`t-verdict t-verdict-${status}`} role="status">
        <strong>
          {verdict.connected
            ? m.vConnected
            : corr.complete
              ? m.vNotConnectedComplete
              : m.vNotConnectedPartial}
        </strong>
        {verdict.connected && verdict.commonUpstream.length > 0 && <p>{m.vCommonUp(sh(view.first), sh(view.second), names(verdict.commonUpstream))}</p>}
        {verdict.connected && verdict.commonDownstream.length > 0 && <p>{m.vCommonDown(sh(view.first), sh(view.second), names(verdict.commonDownstream))}</p>}
        {verdict.path && <p>{m.vPathLabel}: {walk(verdict.path)}</p>}
        {!verdict.connected && verdict.weakPath && (
          <p className="t-weak-note">
            {m.vWeakOnly} {walk(verdict.weakPath)}
          </p>
        )}
      </div>

      <details className="t-cover" open>
        <summary>{m.vCover}</summary>
        <ul>
          <li>{m.vWindow(done.win.from > 0 ? dateInput(new Date(done.win.from * 1000)) : m.vAnyTime, done.win.to < Number.MAX_SAFE_INTEGER ? dateInput(new Date(done.win.to * 1000)) : m.vAnyTime)}</li>
          <li>{m.vCoverCount(done.addresses.length, done.extras.length)}</li>
          {Object.values(corr.infos).filter((i) => !i.complete || i.failed || i.hot || i.address === view.first || i.address === view.second).map((i) => (
            <li key={i.address}>
              {m.vCoverAddr(sh(i.address), i.entries)}
              {!i.complete && ` · ${m.vTruncated}`}
              {i.failed && ` · ${m.vFailed}`}
              {i.hot && ` · ⚑ ${m.vHot}`}
              {done.extras.includes(i.address) && ` · ${m.vExtra}`}
            </li>
          ))}
          <li>{m.vCoverShared(corr.shared, corr.read, corr.unread, corr.filtered, corr.requests)}</li>
        </ul>
      </details>

      <div className="t-kinds" role="group">
        <label><input type="checkbox" checked={kinds.pay} onChange={(e) => setKinds({ ...kinds, pay: e.target.checked })} /> {m.vKindPay}</label>
        <label><input type="checkbox" checked={kinds.cospend} onChange={(e) => setKinds({ ...kinds, cospend: e.target.checked })} /> {m.vKindCospend}</label>
        <label><input type="checkbox" checked={kinds.weak} onChange={(e) => setKinds({ ...kinds, weak: e.target.checked })} /> {m.vKindWeak}</label>
      </div>

      {corr.shared === 0 && <p className="c-hint">{m.vEmpty}</p>}
      <VerifyGraph ids={ids} roles={roles} hot={hot} extras={new Set(done.extras)} edges={edges} pathEdges={pathEdges} selected={selected} onSelect={setSelected} m={m} />
      {hidden.length > 0 && (
        <p>
          <button type="button" onClick={() => setOthers(!others)}>{others ? m.vHideOthers : m.vShowOthers(hidden.length)}</button>
        </p>
      )}

      {(sel || selEdge) && (
        <aside className="t-drawer">
          <button type="button" className="t-drawer-x" onClick={() => setSelected(undefined)}>{m.closePanel}</button>
          {sel && (
            <div>
              <p className="t-drawer-addr">{sel}</p>
              <p className="c-hint">{roles[sel] === "target" ? m.vRoleTarget : roles[sel] === "middle" ? m.vRoleMiddle : m.vRoleOther}</p>
              {hot.has(sel) && <p className="c-notice">{m.vHot}</p>}
              <p>
                <a className="c-link" href={`/scan/?q=${sel}`} target="_blank" rel="noreferrer noopener">{m.explorer}</a>
                {" · "}
                <a className="c-link" href={`#a=${sel}`} target="_blank" rel="noreferrer noopener">{m.openInTrace}</a>
              </p>
            </div>
          )}
          {selEdge && <EdgeDetail e={selEdge} m={m} />}
        </aside>
      )}
    </section>
  );
}

function EdgeDetail({ e, m }: { e: PairEdge; m: Messages }) {
  return (
    <div>
      <p className="t-drawer-addr">{shortAddress(e.a)} {e.kind === "pay" ? "→" : "⇄"} {shortAddress(e.b)}</p>
      <div className="s-kv"><span className="s-k">{e.kind === "pay" ? m.vPayEdge : m.vCospendEdge}</span><span className="s-v">{e.weak ? m.vWeakEdge : ""}</span></div>
      {e.kind === "pay" && <div className="s-kv"><span className="s-k">{m.edgeAmount}</span><span className="s-v">{btc(e.sats)}{e.estimated ? ` (${m.estimated})` : ""}</span></div>}
      <div className="s-kv"><span className="s-k">{m.edgeCount}</span><span className="s-v">{e.count}</span></div>
      {e.firstTime !== undefined && (
        <div className="s-kv"><span className="s-k">{m.edgeDate}</span><span className="s-v">{m.firstLast(dateTime(e.firstTime), dateTime(e.lastTime ?? e.firstTime))}</span></div>
      )}
      <ul className="t-rows">
        {e.txids.slice(0, 5).map((id) => (
          <li key={id} className="t-row">
            <a className="c-link t-addr" href={`/scan/?q=${id}`} target="_blank" rel="noreferrer noopener">{id}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
