import React, { useMemo } from "react";
import { marked } from "marked";
import { Eye } from "lucide-react";
import type { AppStyles } from "../utils/storage";
import type { ResumeTemplate } from "../utils/cookies";
import { translations } from "../utils/translations";

interface PreviewProps {
  markdown: string;
  styles: AppStyles;
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
  template: ResumeTemplate;
  avoidPageBreak: boolean;
}

// Map custom style font families to cross-platform fallbacks
function getFontFamily(family: string): string {
  switch (family) {
    case "playfair":
    case "serif":
      return '"Playfair Display", Georgia, "Times New Roman", serif';
    case "lora":
      return '"Lora", Georgia, serif';
    case "merriweather":
      return '"Merriweather", Georgia, serif';
    case "inter":
    case "sans-serif":
      return '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    case "outfit":
      return '"Outfit", sans-serif';
    case "roboto":
      return '"Roboto", sans-serif';
    case "open-sans":
      return '"Open Sans", sans-serif';
    case "fira-code":
    case "monospace":
      return '"Fira Code", Consolas, "Courier New", monospace';
    case "jetbrains-mono":
      return '"JetBrains Mono", Consolas, monospace';
    case "source-code-pro":
      return '"Source Code Pro", "Courier New", monospace';
    case "inherit":
    default:
      return "inherit";
  }
}

/**
 * Group flat markdown-generated HTML elements into a structured hierarchy:
 * - `.resume-header` (everything before the first H2, e.g., name, info)
 * - `.resume-section` (each H2 starts a section)
 * - `.resume-item` (each H3 starts a sub-item like a job or degree)
 */
function structureResumeHtml(rawHtml: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(rawHtml, "text/html");
  const body = doc.body;

  const wrapper = doc.createElement("div");
  wrapper.className = "resume-wrapper";

  const headerDiv = doc.createElement("div");
  headerDiv.className = "resume-header";

  let currentSection: HTMLElement | null = null;
  let currentItem: HTMLElement | null = null;
  let inHeader = true;

  const nodes = Array.from(body.childNodes);
  for (const node of nodes) {
    const el = node as HTMLElement;
    if (el.nodeType === Node.TEXT_NODE && !el.textContent?.trim()) {
      continue; // Skip empty text nodes
    }

    if (el.tagName === "H2") {
      inHeader = false;
      // Close previous section/item
      if (currentSection) {
        if (currentItem) {
          currentSection.appendChild(currentItem);
          currentItem = null;
        }
        wrapper.appendChild(currentSection);
      }
      currentSection = doc.createElement("section");
      // Add section class based on name for specific custom styles, preserving Unicode/Chinese characters
      const secName = el.textContent?.toLowerCase().trim().replace(/[^a-z0-9\u4e00-\u9fa5]/gi, "") || "item";
      currentSection.className = `resume-section section-${secName}`;
      currentSection.appendChild(el.cloneNode(true));
    } else if (el.tagName === "H1") {
      // H1 goes to header
      headerDiv.appendChild(el.cloneNode(true));
    } else {
      if (inHeader) {
        headerDiv.appendChild(el.cloneNode(true));
      } else if (currentSection) {
        if (el.tagName === "H3") {
          // H3 starts a job experience or education block
          if (currentItem) {
            currentSection.appendChild(currentItem);
          }
          currentItem = doc.createElement("div");
          currentItem.className = "resume-item";
          currentItem.appendChild(el.cloneNode(true));
        } else {
          if (currentItem) {
            currentItem.appendChild(el.cloneNode(true));
          } else {
            currentSection.appendChild(el.cloneNode(true));
          }
        }
      } else {
        headerDiv.appendChild(el.cloneNode(true));
      }
    }
  }

  // Flush remaining section and item
  if (currentItem && currentSection) {
    currentSection.appendChild(currentItem);
  }
  if (currentSection) {
    wrapper.appendChild(currentSection);
  }

  if (headerDiv.childNodes.length > 0) {
    wrapper.insertBefore(headerDiv, wrapper.firstChild);
  }

  return wrapper.outerHTML;
}

export const Preview: React.FC<PreviewProps> = ({
  markdown,
  styles,
  lang,
  template,
  avoidPageBreak,
}) => {
  const t = translations[lang];

  // Dynamic CSS custom variables map
  const inlineStyles = useMemo(() => {
    const vars: Record<string, string> = {
      "--preview-body-size": `${styles.bodySize}px`,
      "--preview-h1-size": `${styles.h1Size}px`,
      "--preview-h2-size": `${styles.h2Size}px`,
      "--preview-h3-size": `${styles.h3Size}px`,
      "--preview-h4-size": `${styles.h4Size}px`,
      "--preview-h5-size": `${styles.h5Size}px`,
      "--preview-h6-size": `${styles.h6Size}px`,
    };

    const keys: ("global" | "h1" | "h2" | "h3" | "p" | "strong" | "em" | "a")[] = [
      "global",
      "h1",
      "h2",
      "h3",
      "p",
      "strong",
      "em",
      "a",
    ];

    keys.forEach((key) => {
      const elStyle = styles[key];
      if (elStyle.color && elStyle.color !== "inherit") {
        vars[`--preview-${key}-color`] = elStyle.color;
      }
      if (elStyle.fontFamily && elStyle.fontFamily !== "inherit") {
        vars[`--preview-${key}-font`] = getFontFamily(elStyle.fontFamily);
      }
      if (elStyle.bold !== "inherit") {
        vars[`--preview-${key}-weight`] = elStyle.bold ? "bold" : "normal";
      }
      if (elStyle.italic !== "inherit") {
        vars[`--preview-${key}-style`] = elStyle.italic ? "italic" : "normal";
      }
    });

    return vars as React.CSSProperties;
  }, [styles]);

  // Parse markdown and build structured HTML output
  const htmlContent = useMemo(() => {
    try {
      const rawHtml = marked.parse(markdown) as string;
      return structureResumeHtml(rawHtml);
    } catch (e) {
      console.error("Markdown parsing failed:", e);
      return `<div class="error-msg">Failed to render markdown content</div>`;
    }
  }, [markdown]);

  return (
    <div className="preview-container-wrapper">
      <div className="pane-header">
        <Eye size={16} />
        <h2>{t.preview}</h2>
      </div>
      <div className="preview-scroll-viewport">
        <div
          id="preview-container"
          className={`template-${template}`}
          style={inlineStyles}
          data-avoid-break={avoidPageBreak}
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      </div>
    </div>
  );
};
