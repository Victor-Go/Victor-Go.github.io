import { create } from "zustand";
import { getDefaultLang, type Lang } from "./i18n";

/** The UI language, in memory only. It starts from the browser; once signed in the vault may override it. */
export const useLangStore = create<{ lang: Lang }>(() => ({ lang: getDefaultLang() }));

export const setLang = (lang: Lang): void => useLangStore.setState({ lang });
