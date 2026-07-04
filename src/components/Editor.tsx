import React from "react";
import { Edit3 } from "lucide-react";
import { translations } from "../utils/translations";

interface EditorProps {
  markdown: string;
  onChange: (md: string) => void;
  lang:
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
}

export const Editor: React.FC<EditorProps> = ({ markdown, onChange, lang }) => {
  const t = translations[lang];

  // Simple stats
  const charCount = markdown.length;
  const wordCount = markdown.trim() === "" ? 0 : markdown.trim().split(/\s+/).length;

  return (
    <div className="editor-container">
      <div className="pane-header">
        <Edit3 size={16} />
        <h2>{t.editor}</h2>
      </div>
      <div className="editor-textarea-wrapper">
        <textarea
          value={markdown}
          onChange={(e) => onChange(e.target.value)}
          placeholder="# Your Name..."
          className="editor-textarea"
          spellCheck="false"
        />
      </div>
      <div className="editor-footer">
        <span>{wordCount} words</span>
        <span>{charCount} characters</span>
      </div>
    </div>
  );
};
