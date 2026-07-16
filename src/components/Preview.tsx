import React, { useMemo, useState, useEffect, useRef } from "react";
import { marked } from "marked";
import { Eye, Maximize2, FileText } from "lucide-react";
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
  avoidPageBreakLevels: string[];
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
  avoidPageBreakLevels,
}) => {
  const t = translations[lang];
  const [previewMode, setPreviewMode] = useState<"fit-width" | "real-size">("fit-width");
  const viewportRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [containerHeight, setContainerHeight] = useState(1123);

  useEffect(() => {
    const viewport = viewportRef.current;
    const container = containerRef.current;
    if (!viewport || !container) return;

    const handleResize = () => {
      if (previewMode === "real-size") {
        const computedStyle = window.getComputedStyle(viewport);
        const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
        const paddingRight = parseFloat(computedStyle.paddingRight) || 0;
        const viewportWidth = viewport.clientWidth - (paddingLeft + paddingRight);

        const a4Width = 794; // 210mm in pixels at 96dpi (793.7px)

        if (viewportWidth < a4Width && viewportWidth > 0) {
          setScale(viewportWidth / a4Width);
        } else {
          setScale(1);
        }

        setContainerHeight(container.offsetHeight);
      } else {
        setScale(1);
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });

    resizeObserver.observe(viewport);
    resizeObserver.observe(container);

    handleResize();

    return () => {
      resizeObserver.disconnect();
    };
  }, [markdown, styles, template, previewMode]);

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
      "--preview-margin-horizontal": `${styles.marginHorizontal !== undefined ? styles.marginHorizontal : 18}mm`,
      "--preview-margin-vertical": `${styles.marginVertical !== undefined ? styles.marginVertical : 20}mm`,
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

  const avoidClasses = avoidPageBreak
    ? avoidPageBreakLevels.map((lvl) => `avoid-${lvl}`).join(" ")
    : "";

  const verticalMargin = styles.marginVertical !== undefined ? styles.marginVertical : 20;

  return (
    <div className="preview-container-wrapper">
      <style>
        {`
          @media print {
            @page {
              margin-top: ${verticalMargin}mm !important;
              margin-bottom: ${verticalMargin}mm !important;
              margin-left: 0 !important;
              margin-right: 0 !important;
            }
          }
        `}
      </style>
      <div className="pane-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Eye size={16} />
          <h2>{t.preview}</h2>
        </div>
        <div className="preview-mode-toggle">
          <button
            type="button"
            className={`preview-mode-btn ${previewMode === "fit-width" ? "active" : ""}`}
            onClick={() => setPreviewMode("fit-width")}
            title={t.fitWidthTitle}
          >
            <Maximize2 size={13} />
            <span>{t.fitWidth}</span>
          </button>
          <button
            type="button"
            className={`preview-mode-btn ${previewMode === "real-size" ? "active" : ""}`}
            onClick={() => setPreviewMode("real-size")}
            title={t.realSizeTitle}
          >
            <FileText size={13} />
            <span>{t.realSize}</span>
          </button>
        </div>
      </div>
      <div className="preview-scroll-viewport" ref={viewportRef}>
        {previewMode === "real-size" ? (
          <div
            className="preview-scale-wrapper"
            style={{
              width: `${794 * scale}px`,
              height: `${containerHeight * scale}px`,
              overflow: "hidden",
              display: "flex",
              justifyContent: "center",
              alignItems: "flex-start",
              flexShrink: 0,
            }}
          >
            <div
              id="preview-container"
              ref={containerRef}
              className={`template-${template} ${avoidClasses} preview-mode-real-size`}
              style={{
                ...inlineStyles,
                transform: `scale(${scale})`,
                transformOrigin: "top center",
                width: "210mm",
                flexShrink: 0,
              }}
              data-avoid-break={avoidPageBreak}
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
          </div>
        ) : (
          <div
            id="preview-container"
            ref={containerRef}
            className={`template-${template} ${avoidClasses} preview-mode-fit-width`}
            style={inlineStyles}
            data-avoid-break={avoidPageBreak}
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        )}
      </div>
    </div>
  );
};
