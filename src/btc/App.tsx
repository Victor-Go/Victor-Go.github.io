import { useCallback, useEffect, useState } from "react";
import { Wallet } from "./Wallet";
import { wipeTracked } from "../cipher/crypto/secrets";
import { isEmbeddedOrOpened } from "../cipher/isolation";
import { useWipeTriggers } from "../cipher/wipe";
import { DEFAULT_LANG, messages, type Lang } from "./i18n";

export function App() {
  const [lang, setLang] = useState<Lang>(DEFAULT_LANG);
  const [epoch, setEpoch] = useState(0);
  const [clearedNote, setClearedNote] = useState(false);
  const m = messages[lang];

  const wipe = useCallback(() => {
    wipeTracked();
    setEpoch((e) => e + 1);
  }, []);
  useWipeTriggers(wipe);

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
      <p className="c-notice" role="note">{m.notice}</p>
      {clearedNote && <p role="status" className="c-hint">{m.cleared}</p>}
      <Wallet key={epoch} m={m} />
    </main>
  );
}
