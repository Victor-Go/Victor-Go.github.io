import { useCallback, useEffect, useMemo, useState } from "react";
import { getConfig } from "./config";
import { messages, type Lang, type Messages } from "./i18n";
import { appMessages, type AppMessages } from "./i18nApp";
import { setLang, useLangStore } from "./lang";
import { checkHealth, probeWsPool, summarize, type Connectivity, type HealthState, type WsState } from "./net/health";
import { setPreferredWs } from "./net/preferred";

/** The shared UI language (memory only; starts from the browser, the vault may override it after sign-in). */
export function useLang(): { lang: Lang; m: Messages; a: AppMessages; toggle: () => void } {
  const lang = useLangStore((s) => s.lang);
  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, [lang]);
  return { lang, m: messages[lang], a: appMessages[lang], toggle: () => setLang(lang === "zh" ? "en" : "zh") };
}

/**
 * Checks the server once on mount and again whenever `recheck` is called: the sign-in interface (`state`, from `/health`) and the live channel
 * (`ws`, one plain HTTPS request to the live-channel host), both pools in parallel. `connectivity` is what the two together mean for the person.
 */
export function useHealth(): { state: HealthState; ws: WsState; connectivity: Connectivity; recheck: () => void } {
  // The pools are new arrays on every getConfig(): they must be taken once, or the effect below would run on every render.
  const pools = useMemo(() => getConfig(), []);
  const [state, setState] = useState<HealthState>(pools.api.length ? { kind: "checking" } : { kind: "unconfigured" });
  const [ws, setWs] = useState<WsState>(pools.ws.length ? { kind: "checking" } : { kind: "unconfigured" });
  const [round, setRound] = useState(0);
  useEffect(() => {
    let live = true;
    void checkHealth(pools.api).then((s) => {
      if (live) setState(s);
    });
    void probeWsPool(pools.ws).then((r) => {
      if (!live) return;
      if (r.state.kind === "ok" || r.state.kind === "slow") setPreferredWs(r.index);
      setWs(r.state);
    });
    return () => {
      live = false;
    };
  }, [pools, round]);
  const recheck = useCallback(() => {
    if (pools.api.length) setState({ kind: "checking" });
    if (pools.ws.length) setWs({ kind: "checking" });
    setRound((r) => r + 1);
  }, [pools]);
  const connectivity = useMemo(() => summarize(state, ws), [state, ws]);
  return { state, ws, connectivity, recheck };
}
