import { useCallback, useEffect, useState } from "react";
import { KeyExchange } from "./components/KeyExchange";
import { PasswordCrypto } from "./components/PasswordCrypto";
import { Tabs } from "./components/Fields";
import { wipeTracked } from "./crypto/secrets";
import { DEFAULT_LANG, messages, type Lang } from "./i18n";
import { isEmbeddedOrOpened } from "./isolation";
import { useWipeTriggers } from "./wipe";

type Mode = "kx" | "pw";

/** Everything secret lives in the useState of this subtree; remounting it discards all of it. */
function Workspace({ lang }: { lang: Lang }) {
  const m = messages[lang];
  const [mode, setMode] = useState<Mode>("kx");
  const modes = [
    { id: "kx", label: m.moduleKx, content: <KeyExchange m={m} /> },
    { id: "pw", label: m.modulePw, content: <PasswordCrypto m={m} /> },
  ];
  return (
    <Tabs label={m.modules} tabs={modes} active={mode} onChange={(t) => setMode(t as Mode)} className="c-modes" />
  );
}

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
      <p className="c-notice" role="note">
        {m.notice}
      </p>
      {clearedNote && <p role="status" className="c-hint">{m.cleared}</p>}
      <Workspace key={epoch} lang={lang} />
    </main>
  );
}
