import { useEffect } from "react";
import { useResumeStore } from "../stores/useResumeStore";
import type { SupportedLang } from "../stores/useResumeStore";
import { translations, extraTranslations } from "../utils/translations";

export function useLanguage() {
  const lang = useResumeStore((state) => state.lang);
  const setLang = useResumeStore((state) => state.setLang);
  const markdown = useResumeStore((state) => state.markdown);
  const setMarkdown = useResumeStore((state) => state.setMarkdown);
  const isFirstLoad = useResumeStore((state) => state.isFirstLoad);
  const setIsFirstLoad = useResumeStore((state) => state.setIsFirstLoad);

  // Initialize only once. An intentionally blank editor must remain blank until
  // the user explicitly switches language or layout.
  useEffect(() => {
    if (isFirstLoad) {
      setIsFirstLoad(false);
      const saved = localStorage.getItem("markdown_resume_content");
      if (saved !== null) {
        setMarkdown(saved);
      } else {
        setMarkdown(translations[lang].defaultResume);
      }
    }
  }, [lang, isFirstLoad, setMarkdown, setIsFirstLoad]);

  // Sync language selection to localStorage
  useEffect(() => {
    localStorage.setItem("markdown_resume_lang", lang);
  }, [lang]);

  // Dynamic SEO Updates
  useEffect(() => {
    const t = translations[lang];
    const extra = extraTranslations[lang] || extraTranslations["en"];
    document.title = `${t.title} | ${extra.metaTitleSuffix}`;

    // Set HTML lang attribute
    document.documentElement.lang = lang;

    // Set Meta Description
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute("content", t.metaDescription);
    }
  }, [lang]);

  const handleLangChange = (newLang: SupportedLang) => {
    // Overwrite the resume ONLY if they haven't modified the default template resume
    if (!markdown.trim() || markdown === translations[lang].defaultResume) {
      setMarkdown(translations[newLang].defaultResume);
    }
    setLang(newLang);

    // Update URL query parameter silently
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("lang", newLang);
      window.history.replaceState({}, "", url.pathname + url.search);
    } catch (e) {
      console.error(e);
    }
  };

  return {
    lang,
    handleLangChange,
  };
}
export type { SupportedLang };
