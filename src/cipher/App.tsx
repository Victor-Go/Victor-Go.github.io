import { useCallback, useEffect, useState } from "react";
import { KeyExchange } from "./components/KeyExchange";
import { FileCrypto } from "./components/FileCrypto";
import { PasswordCrypto } from "./components/PasswordCrypto";
import { Tabs } from "./components/Fields";
import { wipeTracked } from "./crypto/secrets";
import { getDefaultLang, messages, type Lang } from "./i18n";
import { cancelPendingKdf } from "./workers/kdfClient";
import { isEmbeddedOrOpened } from "./isolation";
import { epochsAvailable } from "./crypto/epochsEnv";
import { CIPHER_IDLE_MILLISECONDS, useWipeTriggers } from "./wipe";

type Mode = "kx" | "pw" | "file";

/** Everything secret lives in the useState of this subtree; remounting it discards all of it. */
function Workspace({ lang }: { lang: Lang }) {
  const m = messages[lang];
  const [mode, setMode] = useState<Mode>("pw");
  const modes = [
    { id: "pw", label: m.modulePw, content: <PasswordCrypto m={m} /> },
    { id: "file", label: m.moduleFile, content: <FileCrypto m={m} /> },
    { id: "kx", label: m.moduleKx, content: <KeyExchange m={m} /> },
  ];
  return (
    <Tabs label={m.modules} tabs={modes} active={mode} onChange={(t) => setMode(t as Mode)} className="c-modes" />
  );
}

export function App() {
  const [lang, setLang] = useState<Lang>(getDefaultLang);
  const [epoch, setEpoch] = useState(0);
  const [clearedNote, setClearedNote] = useState(false);
  const [autoClear, setAutoClear] = useState(true);
  const m = messages[lang];

  const wipe = useCallback(() => {
    cancelPendingKdf();
    wipeTracked();
    setEpoch((e) => e + 1);
  }, []);
  useWipeTriggers(wipe, autoClear ? CIPHER_IDLE_MILLISECONDS : null);

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    document.title = m.title;
  }, [lang, m.title]);

  if (isEmbeddedOrOpened() || !epochsAvailable()) {
    return (
      <main className="c-shell">
        <p role="alert" className="c-error">{isEmbeddedOrOpened() ? m.refused : m.unavailable}</p>
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
      <p className="c-notice" role="note">
        {m.notice}
      </p>
      <button
        type="button"
        role="switch"
        aria-checked={autoClear}
        className="c-switch"
        onClick={() => setAutoClear((v) => !v)}
      >
        <span className="c-switch-box" aria-hidden="true">{autoClear ? "✓" : ""}</span>
        {m.autoClear}
      </button>
      {clearedNote && <p role="status" className="c-hint">{m.cleared}</p>}
      <Workspace key={epoch} lang={lang} />
    </main>
  );
}
