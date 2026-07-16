import { create } from "zustand";
import { loadStylesFromStorage } from "../utils/storage";
import type { AppStyles } from "../utils/storage";
import type { ResumeTemplate } from "../utils/cookies";

export type SupportedLang =
  | "en"
  | "zh"
  | "zh-tw"
  | "fr"
  | "de"
  | "it"
  | "es"
  | "pt"
  | "ja"
  | "ko"
  | "ru"
  | "uk";

export interface ResumeState {
  lang: SupportedLang;
  template: ResumeTemplate;
  styles: AppStyles;
  markdown: string;
  fileName: string;
  avoidPageBreak: boolean;
  avoidPageBreakLevels: string[];
  isFirstLoad: boolean;

  setLang: (lang: SupportedLang) => void;
  setTemplate: (template: ResumeTemplate) => void;
  setStyles: (styles: AppStyles | ((prev: AppStyles) => AppStyles)) => void;
  setMarkdown: (markdown: string) => void;
  setFileName: (fileName: string) => void;
  setAvoidPageBreak: (avoid: boolean) => void;
  setAvoidPageBreakLevels: (levels: string[]) => void;
  setIsFirstLoad: (first: boolean) => void;
  loadResume: (
    markdown: string,
    styles: AppStyles,
    template: ResumeTemplate,
    fileName?: string
  ) => void;
}

const getInitialLang = (): SupportedLang => {
  const supported: SupportedLang[] = [
    "en",
    "zh",
    "zh-tw",
    "fr",
    "de",
    "it",
    "es",
    "pt",
    "ja",
    "ko",
    "ru",
    "uk",
  ];
  const urlParams = new URLSearchParams(window.location.search);
  const urlLang = urlParams.get("lang");
  if (urlLang && supported.includes(urlLang as SupportedLang)) {
    return urlLang as SupportedLang;
  }

  const saved = localStorage.getItem("markdown_resume_lang");
  if (saved && supported.includes(saved as SupportedLang)) {
    return saved as SupportedLang;
  }

  const sysLangFull = (navigator.language || "en").toLowerCase();
  if (
    sysLangFull.includes("zh-tw") ||
    sysLangFull.includes("zh-hk") ||
    sysLangFull.includes("zh-hant") ||
    sysLangFull.includes("tw") ||
    sysLangFull.includes("hk")
  ) {
    return "zh-tw";
  }
  const sysLang = sysLangFull.split("-")[0];
  return supported.includes(sysLang as SupportedLang)
    ? (sysLang as SupportedLang)
    : "en";
};

const getInitialAvoidPageBreak = (): boolean => {
  try {
    const saved = localStorage.getItem("markdown_resume_avoid_page_break");
    return saved === null ? true : saved === "true";
  } catch (e) {
    console.error("Failed to load avoidPageBreak from localStorage", e);
    return true;
  }
};

const getInitialAvoidPageBreakLevels = (): string[] => {
  try {
    const saved = localStorage.getItem("markdown_resume_avoid_page_break_levels");
    return saved ? JSON.parse(saved) : ["h3"];
  } catch (e) {
    console.error("Failed to load avoidPageBreakLevels from localStorage", e);
    return ["h3"];
  }
};

export const useResumeStore = create<ResumeState>((set) => ({
  lang: getInitialLang(),
  template: (localStorage.getItem("markdown_resume_template") as ResumeTemplate) || "classic",
  styles: loadStylesFromStorage(),
  markdown: localStorage.getItem("markdown_resume_content") || "",
  fileName: localStorage.getItem("markdown_resume_file_name") || "resume",
  avoidPageBreak: getInitialAvoidPageBreak(),
  avoidPageBreakLevels: getInitialAvoidPageBreakLevels(),
  isFirstLoad: true,

  setLang: (lang) => set({ lang }),
  setTemplate: (template) => set({ template }),
  setStyles: (styles) =>
    set((state) => ({
      styles: typeof styles === "function" ? styles(state.styles) : styles,
    })),
  setMarkdown: (markdown) => set({ markdown }),
  setFileName: (fileName) => set({ fileName }),
  setAvoidPageBreak: (avoidPageBreak) => set({ avoidPageBreak }),
  setAvoidPageBreakLevels: (avoidPageBreakLevels) => set({ avoidPageBreakLevels }),
  setIsFirstLoad: (isFirstLoad) => set({ isFirstLoad }),
  loadResume: (markdown, styles, template, fileName) =>
    set((state) => ({
      markdown,
      styles,
      template,
      fileName: fileName !== undefined ? fileName : state.fileName,
    })),
}));
