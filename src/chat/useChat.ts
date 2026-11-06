import { useCallback, useEffect, useState } from "react";
import { getConfig } from "./config";
import { messages, type Lang, type Messages } from "./i18n";
import { appMessages, type AppMessages } from "./i18nApp";
import { setLang, useLangStore } from "./lang";
import { checkHealth, type HealthState } from "./net/health";

/** The shared UI language (memory only; starts from the browser, the vault may override it after sign-in). */
export function useLang(): { lang: Lang; m: Messages; a: AppMessages; toggle: () => void } {
  const lang = useLangStore((s) => s.lang);
  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, [lang]);
  return { lang, m: messages[lang], a: appMessages[lang], toggle: () => setLang(lang === "zh" ? "en" : "zh") };
}

/** Checks the server once on mount and again whenever `recheck` is called. */
export function useHealth(): { state: HealthState; recheck: () => void } {
  const { api } = getConfig();
  const [state, setState] = useState<HealthState>(api ? { kind: "checking" } : { kind: "unconfigured" });
  const [round, setRound] = useState(0);
  useEffect(() => {
    let live = true;
    void checkHealth(api).then((s) => {
      if (live) setState(s);
    });
    return () => {
      live = false;
    };
  }, [api, round]);
  const recheck = useCallback(() => {
    if (api) setState({ kind: "checking" });
    setRound((r) => r + 1);
  }, [api]);
  return { state, recheck };
}
