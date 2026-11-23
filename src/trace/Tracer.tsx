import { useEffect, useRef, useState } from "react";
import { Field } from "../cipher/components/Fields";
import { formatBtc } from "../scan/query";
import { BadResponseError, NetworkError, scanWindow, type WindowScan } from "./api";
import { aggregate, pinWatched, type Flow, type Flows } from "./aggregate";
import {
  MAX_NOISE,
  MAX_WATCH,
  dateInput,
  dateTime,
  fromHash,
  lastDays,
  publicAddress,
  splitWatch,
  toHash,
  windowOf,
  type View,
} from "./view";
import { DatePicker } from "./DatePicker";
import { NumberInput } from "./NumberInput";
import { useTrouble } from "./useTrouble";
import { Graph } from "./Graph";
import type { Messages } from "./i18n";

/** Counterparties per list page; watched addresses do not count against it. */
export const PAGE_SIZE = 10;

const btc = (sats: number): string => `${formatBtc(sats)} BTC`;
const date = (t?: number): string => (t === undefined ? "" : dateTime(t));

function errorMessage(e: unknown, m: Messages): string {
  if (e instanceof NetworkError) return m.errNetwork;
  if (e instanceof BadResponseError) return m.errBad;
  return m.errRetry;
}

/** Keeps the address bar equal to the view; only public addresses and dates ever go there. */
function writeHash(v: View): void {
  history.replaceState(null, "", `${location.pathname}${location.search}${toHash(v)}`);
}

export interface Done {
  view: View;
  scan: WindowScan;
  flows: Flows;
}

export function Tracer({ m }: { m: Messages }) {
  const initial = useRef(fromHash(location.hash)).current;
  const [address, setAddress] = useState(initial.address);
  const [watch, setWatch] = useState(initial.watch.join("\n"));
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [noise, setNoise] = useState(initial.noise);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<[number, number]>([0, 0]);
  const [done, setDone] = useState<Done | undefined>();
  const abort = useRef<AbortController | undefined>(undefined);
  const today = dateInput(new Date());
  const trouble = useTrouble();

  useEffect(() => () => abort.current?.abort(), []);

  async function run(override?: Partial<View>) {
    const draft: View = { address: address.trim(), watch: splitWatch(watch), from, to, noise, ...override };
    const target = publicAddress(draft.address);
    if (!target) return setError(m.errAddress);
    if (draft.watch.length > MAX_WATCH) return setError(m.errWatchMany);
    const watched: string[] = [];
    for (const w of draft.watch) {
      const a = publicAddress(w);
      if (!a) return setError(m.errWatch(w));
      if (!watched.includes(a)) watched.push(a);
    }
    if (draft.from && draft.to && draft.from > draft.to) return setError(m.errRange);
    const view: View = { ...draft, address: target, watch: watched };

    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setError("");
    setDone(undefined);
    setRunning(true);
    setProgress([0, 0]);
    setAddress(view.address);
    setWatch(view.watch.join("\n"));
    writeHash(view);
    try {
      const scan = await scanWindow(view.address, windowOf(view), ctl.signal, {
        onProgress: (requests, found) => setProgress([requests, found]),
      });
      if (ctl.signal.aborted) return;
      setDone({ view, scan, flows: aggregate(view.address, scan.txs, view.noise) });
    } catch (e) {
      if (!ctl.signal.aborted) setError(errorMessage(e, m));
    } finally {
      if (abort.current === ctl) setRunning(false);
    }
  }

  // A shared link that carries an address runs at once.
  useEffect(() => {
    if (initial.address) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const quick = (days: number | "all") => {
    if (days === "all") {
      setFrom("");
      setTo("");
    } else {
      const r = lastDays(days);
      setFrom(r.from);
      setTo(r.to);
    }
  };

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <Field label={m.addressLabel} value={address} onChange={setAddress} m={m} singleLine />
        <Field label={m.watchLabel} value={watch} onChange={setWatch} m={m} rows={2} />
        <p className="c-hint">{m.watchHint}</p>
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
          <button type="submit" className="c-primary" disabled={running}>
            {running ? m.running : m.run}
          </button>
          {running && (
            <button type="button" onClick={() => {
                abort.current?.abort();
                setRunning(false);
              }}>
              {m.stop}
            </button>
          )}
        </div>
      </form>

      {running && <p role="status" className="c-hint">{m.progress(progress[0], progress[1])}</p>}
      {running && trouble && <p role="status" className="c-notice">{m.trouble(trouble.status)}</p>}
      {error && <p role="alert" className="c-error">{error}</p>}
      {done && <Result done={done} m={m} onTrace={(a) => void run({ address: a })} />}
    </>
  );
}

function Result({ done, m, onTrace }: { done: Done; m: Messages; onTrace: (a: string) => void }) {
  const { scan, flows, view } = done;
  const [mode, setMode] = useState<"graph" | "list">("graph");
  const seen = new Set([...flows.sources, ...flows.destinations].map((f) => f.address));
  const silent = view.watch.filter((a) => !seen.has(a));
  return (
    <section aria-live="polite">
      <div className="t-balance">
        {scan.balance ? (
          <>
            <div className="s-kv"><span className="s-k">{m.balanceEnter}</span><span className="s-v">{btc(scan.balance.enter)}</span></div>
            <div className="s-kv"><span className="s-k">{m.balanceLeave}</span><span className="s-v">{btc(scan.balance.leave)}</span></div>
            <div className="s-kv"><span className="s-k">{m.balanceNow}</span><span className="s-v">{btc(scan.balance.now)}</span></div>
          </>
        ) : (
          <p className="c-hint">{m.balanceUnknown}</p>
        )}
      </div>
      <p className="c-hint">{m.coverage(scan.requests, scan.txs.length, flows.filtered)}</p>
      {!scan.complete && <p role="alert" className="c-notice">{m.partial}</p>}
      {silent.map((a) => (
        <p key={a} className="t-watch-note">{m.watchedNone(a)}</p>
      ))}
      <div className="t-tabs" role="group">
        <button type="button" aria-pressed={mode === "graph"} onClick={() => setMode("graph")}>{m.viewGraph}</button>
        <button type="button" aria-pressed={mode === "list"} onClick={() => setMode("list")}>{m.viewList}</button>
      </div>
      {mode === "graph" ? (
        <Graph done={done} m={m} onTrace={onTrace} />
      ) : (
        <>
          <p className="c-hint">{m.directNote}</p>
          <div className="t-columns">
            <FlowList title={m.sourcesTitle} side="src" flows={flows.sources} watch={view.watch} m={m} onTrace={onTrace} />
            <FlowList title={m.destinationsTitle} side="dst" flows={flows.destinations} watch={view.watch} m={m} onTrace={onTrace} />
          </div>
        </>
      )}
    </section>
  );
}

function FlowList({
  title,
  side,
  flows,
  watch,
  m,
  onTrace,
}: {
  title: string;
  side: "src" | "dst";
  flows: Flow[];
  watch: string[];
  m: Messages;
  onTrace: (a: string) => void;
}) {
  const [page, setPage] = useState(0);
  const { pinned, rest } = pinWatched(flows, watch);
  const pages = Math.max(1, Math.ceil(rest.length / PAGE_SIZE));
  const at = Math.min(page, pages - 1);
  const shown = rest.slice(at * PAGE_SIZE, (at + 1) * PAGE_SIZE);
  return (
    <div className={`t-list t-${side}`}>
      <h2>{title}</h2>
      {pinned.length > 0 && (
        <ul className="t-rows">
          {pinned.map((f) => (
            <Row key={f.address} f={f} m={m} watched onTrace={onTrace} />
          ))}
        </ul>
      )}
      {rest.length === 0 && pinned.length === 0 ? (
        <p className="c-hint">{m.nothing}</p>
      ) : (
        <ul className="t-rows">
          {shown.map((f) => (
            <Row key={f.address} f={f} m={m} onTrace={onTrace} />
          ))}
        </ul>
      )}
      {rest.length > PAGE_SIZE && (
        <>
          <p className="c-hint">{m.tooMany(rest.length)}</p>
          <div className="t-pager">
            <button type="button" disabled={at === 0} onClick={() => setPage(at - 1)}>{m.prev}</button>
            <span>{m.page(at * PAGE_SIZE + 1, Math.min(rest.length, (at + 1) * PAGE_SIZE), rest.length)}</span>
            <button type="button" disabled={at >= pages - 1} onClick={() => setPage(at + 1)}>{m.next}</button>
          </div>
        </>
      )}
    </div>
  );
}

function Row({ f, m, watched, onTrace }: { f: Flow; m: Messages; watched?: boolean; onTrace: (a: string) => void }) {
  return (
    <li className={watched ? "t-row t-watch" : "t-row"}>
      <span className="t-addr">{f.address}</span>
      <span className="t-amt">
        {formatBtc(f.sats)} BTC
        {f.estimated && <abbr title={m.estimatedHint} className="t-est"> ~{m.estimated}</abbr>}
      </span>
      <span className="t-meta">
        {watched && <b>{m.watched} · </b>}
        {m.txCount(f.count)}
        {f.firstTime !== undefined && ` · ${m.firstLast(date(f.firstTime), date(f.lastTime))}`}
        {f.firstTime === undefined && ` · ${m.unconfirmed}`}
      </span>
      <button type="button" className="c-link" onClick={() => onTrace(f.address)}>
        {m.openInTrace}
      </button>
    </li>
  );
}
