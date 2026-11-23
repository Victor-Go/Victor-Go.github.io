import { useCallback, useEffect, useState } from "react";
import { Tracer } from "./Tracer";
import { Verify } from "./Verify";
import { isVerifyHash } from "./verifyView";
import { isEmbeddedOrOpened } from "../cipher/isolation";
import { DEFAULT_WIPE_MINUTES, useWipeTriggers } from "../cipher/wipe";
import { IdleSelect } from "../cipher/components/Fields";
import { getDefaultLang, messages, type Lang } from "./i18n";

export function App() {
  const [lang, setLang] = useState<Lang>(getDefaultLang);
  const [epoch, setEpoch] = useState(0);
  const [mode, setMode] = useState<"trace" | "verify">(() => (isVerifyHash(location.hash) ? "verify" : "trace"));
  const [clearedNote, setClearedNote] = useState(false);
  const [idleMinutes, setIdleMinutes] = useState<number>(DEFAULT_WIPE_MINUTES);
  const m = messages[lang];

  // Remounting Tracer drops the inputs and results and aborts any request in flight.
  // The view lives in the # fragment, so a wipe clears it from the address bar too (and the remounted Tracer then starts empty).
  const wipe = useCallback(() => {
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    setEpoch((e) => e + 1);
  }, []);
  useWipeTriggers(wipe, idleMinutes * 60_000);

  // Each mode keeps its own view in the fragment, so switching starts the other one clean.
  const switchTo = (next: "trace" | "verify") => {
    if (next === mode) return;
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    setMode(next);
    setEpoch((e) => e + 1);
  };

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    document.title = m.title;
  }, [lang, m.title]);

  if (isEmbeddedOrOpened()) {
    return (
      <main className="c-shell">
        <p role="alert" className="c-error">{m.refused}</p>
      </main>
    );
  }

  return (
    <main className="c-shell">
      <header className="c-header">
        <h1>{m.title}</h1>
        <div className="c-header-actions">
          <button
            type="button"
            onClick={() => {
              wipe();
              setClearedNote(true);
            }}
          >
            {m.clearAll}
          </button>
          <button type="button" lang={lang === "zh" ? "en" : "zh"} aria-label={m.langSwitchLabel} onClick={() => setLang(lang === "zh" ? "en" : "zh")}>
            {m.langSwitch}
          </button>
        </div>
      </header>
      <p className="c-tagline">{m.tagline}</p>
      <IdleSelect minutes={idleMinutes} onChange={setIdleMinutes} label={m.autoClear} option={m.autoClearOption} />
      {clearedNote && <p role="status" className="c-hint">{m.cleared}</p>}
      <div className="t-tabs" role="group">
        <button type="button" aria-pressed={mode === "trace"} onClick={() => switchTo("trace")}>{m.modeTrace}</button>
        <button type="button" aria-pressed={mode === "verify"} onClick={() => switchTo("verify")}>{m.modeVerify}</button>
      </div>
      {mode === "trace" ? <Tracer key={epoch} m={m} /> : <Verify key={epoch} m={m} />}
    </main>
  );
}
