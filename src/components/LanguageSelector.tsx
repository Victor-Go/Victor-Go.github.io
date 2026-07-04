import React from "react";
import { Globe } from "lucide-react";
import { translations } from "../utils/translations";

type SupportedLang =
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

interface LanguageSelectorProps {
  lang: SupportedLang;
  setLang: (lang: SupportedLang) => void;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  lang,
  setLang,
}) => {
  const t = translations[lang];

  return (
    <div className="language-selector-wrapper">
      <label htmlFor="lang-select" className="sr-only">
        {t.languageLabel}
      </label>
      <div className="select-container">
        <Globe size={16} className="select-icon" />
        <select
          id="lang-select"
          value={lang}
          onChange={(e) => setLang(e.target.value as SupportedLang)}
          className="app-select"
        >
          <option value="en">English (EN)</option>
          <option value="zh">简体中文 (ZH)</option>
          <option value="zh-tw">繁體中文 (ZH-TW)</option>
          <option value="fr">Français (FR)</option>
          <option value="de">Deutsch (DE)</option>
          <option value="it">Italiano (IT)</option>
          <option value="es">Español (ES)</option>
          <option value="pt">Português (PT)</option>
          <option value="ja">日本語 (JA)</option>
          <option value="ko">한국어 (KO)</option>
          <option value="ru">Русский (RU)</option>
          <option value="uk">Українська (UK)</option>
        </select>
      </div>
    </div>
  );
};
