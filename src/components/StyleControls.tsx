import React, { useState } from "react";
import { Sliders, Type, Palette, Layout, Sparkles, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import type { AppStyles, ElementStyle } from "../utils/storage";
import type { ResumeTemplate } from "../utils/cookies";
import { translations, extraTranslations } from "../utils/translations";

interface StyleControlsProps {
  styles: AppStyles;
  onChange: (updatedStyles: AppStyles) => void;
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
  setTemplate: (tpl: ResumeTemplate) => void;
  style?: React.CSSProperties;
  onReset: () => void;
  showReset: boolean;
}

const templatesList: ResumeTemplate[] = [
  "classic",
  "creative",
  "minimalist",
  "developer",
  "academic",
  "compact",
  "editorial",
  "modernist",
  "executive",
  "tech",
  "vintage",
  "grid",
  "clean",
  "bold",
  "stylish",
  "hybrid"
];

const getLayoutLabel = (tpl: ResumeTemplate, lang: string): string => {
  const extra = extraTranslations[lang] || extraTranslations["en"];
  switch (tpl) {
    case "classic": return extra.layoutClassic;
    case "creative": return extra.layoutCreative;
    case "minimalist": return extra.layoutMinimalist;
    case "developer": return extra.layoutDeveloper;
    case "academic": return extra.layoutAcademic;
    case "compact": return extra.layoutCompact;
    case "editorial": return extra.layoutEditorial;
    case "modernist": return extra.layoutModernist || "Modernist";
    case "executive": return extra.layoutExecutive || "Executive";
    case "tech": return extra.layoutTech || "Advanced Tech";
    case "vintage": return extra.layoutVintage || "Vintage Literary";
    case "grid": return extra.layoutGrid || "Grid Portfolio";
    case "clean": return extra.layoutClean || "Clean Minimalist";
    case "bold": return extra.layoutBold || "Bold High-Contrast";
    case "stylish": return extra.layoutStylish || "Stylish Creative";
    case "hybrid": return extra.layoutHybrid || "Hybrid Column";
    default: return tpl;
  }
};

const getThemeLabel = (themeName: string, lang: string): string => {
  const extra = extraTranslations[lang] || extraTranslations["en"];
  const key = `theme${themeName.replace(/\s+/g, "")}` as keyof typeof extra;
  return extra[key] || themeName;
};

type ActiveElementKey = "global" | "h1" | "h2" | "h3" | "p" | "strong" | "em" | "a";

interface PresetColor {
  name: string;
  colors: {
    h1: string;
    h2: string;
    h3: string;
    p: string;
    strong: string;
  };
}

// 12 Professional color presets
const colorPresets: PresetColor[] = [
  {
    name: "Royal Sapphire",
    colors: { h1: "#1e3a8a", h2: "#2563eb", h3: "#3b82f6", p: "#374151", strong: "#1e3a8a" },
  },
  {
    name: "Emerald Forest",
    colors: { h1: "#064e3b", h2: "#059669", h3: "#10b981", p: "#374151", strong: "#064e3b" },
  },
  {
    name: "Burgundy Executive",
    colors: { h1: "#7f1d1d", h2: "#991b1b", h3: "#b91c1c", p: "#374151", strong: "#7f1d1d" },
  },
  {
    name: "Charcoal Modern",
    colors: { h1: "#1f2937", h2: "#4b5563", h3: "#6b7280", p: "#374151", strong: "#111827" },
  },
  {
    name: "Sunset Bronze",
    colors: { h1: "#7c2d12", h2: "#9a3412", h3: "#c2410c", p: "#374151", strong: "#7c2d12" },
  },
  {
    name: "Midnight Purple",
    colors: { h1: "#4a044e", h2: "#701a75", h3: "#86198f", p: "#374151", strong: "#4a044e" },
  },
  {
    name: "Ocean Teal",
    colors: { h1: "#134e5e", h2: "#0f766e", h3: "#0d9488", p: "#374151", strong: "#134e5e" },
  },
  {
    name: "Warm Terracotta",
    colors: { h1: "#9a3412", h2: "#b45309", h3: "#d97706", p: "#374151", strong: "#9a3412" },
  },
  {
    name: "Rose Gold",
    colors: { h1: "#881337", h2: "#9f1239", h3: "#be123c", p: "#374151", strong: "#881337" },
  },
  {
    name: "Lavender Fields",
    colors: { h1: "#3b0764", h2: "#581c87", h3: "#701a75", p: "#374151", strong: "#3b0764" },
  },
  {
    name: "Slate Steel",
    colors: { h1: "#0f172a", h2: "#334155", h3: "#475569", p: "#374151", strong: "#0f172a" },
  },
  {
    name: "Forest Moss",
    colors: { h1: "#14532d", h2: "#15803d", h3: "#16a34a", p: "#374151", strong: "#14532d" },
  },
  {
    name: "Neon Cyberpunk",
    colors: { h1: "#ec4899", h2: "#06b6d4", h3: "#3b82f6", p: "#1f2937", strong: "#db2777" },
  },
  {
    name: "Vibrant Tangerine",
    colors: { h1: "#ff5a00", h2: "#ff7a00", h3: "#ff9f00", p: "#27272a", strong: "#e04f00" },
  },
  {
    name: "Electric Violet",
    colors: { h1: "#6d28d9", h2: "#8b5cf6", h3: "#a78bfa", p: "#1e293b", strong: "#5b21b6" },
  },
  {
    name: "Vibrant Crimson",
    colors: { h1: "#dc2626", h2: "#ef4444", h3: "#f87171", p: "#1f2937", strong: "#b91c1c" },
  },
  {
    name: "Solar Gold",
    colors: { h1: "#ca8a04", h2: "#eab308", h3: "#facc15", p: "#1c1917", strong: "#a16207" },
  },
  {
    name: "Vivid Lime",
    colors: { h1: "#15803d", h2: "#16a34a", h3: "#22c55e", p: "#1f2937", strong: "#166534" },
  },
];



export const StyleControls: React.FC<StyleControlsProps> = ({
  styles,
  onChange,
  lang,
  template,
  setTemplate,
  style,
  onReset,
  showReset,
}) => {
  const t = translations[lang];
  const [activeTab, setActiveTab] = useState<ActiveElementKey>("global");

  // Collapsible sections state
  const [isLayoutOpen, setIsLayoutOpen] = useState(true);
  const [isSizesOpen, setIsSizesOpen] = useState(true);
  const [isPresetsOpen, setIsPresetsOpen] = useState(true);
  const [isOverridesOpen, setIsOverridesOpen] = useState(true);

  // Helper to update specific properties of AppStyles
  const updateStyle = <K extends keyof AppStyles>(key: K, value: AppStyles[K]) => {
    onChange({
      ...styles,
      [key]: value,
    });
  };

  // Helper to update a specific element override style
  const updateElementStyle = (
    el: ActiveElementKey,
    property: keyof ElementStyle,
    value: any
  ) => {
    const updatedElement = {
      ...styles[el],
      [property]: value,
    };
    onChange({
      ...styles,
      [el]: updatedElement,
    });
  };

  // Apply a preset color palette to the style overrides
  const applyPreset = (preset: PresetColor) => {
    onChange({
      ...styles,
      global: { ...styles.global, color: "inherit" }, // Reset global color
      h1: { ...styles.h1, color: preset.colors.h1 },
      h2: { ...styles.h2, color: preset.colors.h2 },
      h3: { ...styles.h3, color: preset.colors.h3 },
      p: { ...styles.p, color: preset.colors.p },
      strong: { ...styles.strong, color: preset.colors.strong },
      em: { ...styles.em, color: "inherit" }, // EM defaults to inherit
      a: { ...styles.a, color: preset.colors.h3 }, // Link defaults to the accent (h3) color of the preset
    });
  };

  const extra = extraTranslations[lang] || extraTranslations["en"];
  const elementsList: { key: ActiveElementKey; label: string }[] = [
    { key: "global", label: extra.overallTab },
    { key: "h1", label: "H1" },
    { key: "h2", label: "H2" },
    { key: "h3", label: "H3" },
    { key: "p", label: extra.bodyTab },
    { key: "strong", label: extra.boldTab },
    { key: "em", label: extra.italicTab },
    { key: "a", label: extra.linkTab },
  ];

  return (
    <div className="style-controls-container" style={style}>
      {/* Controls Panel Header with actions */}
      <div className="style-controls-header">
        <span className="style-controls-title">
          <Sliders size={15} />
          <span>{extra.stylesTitle}</span>
        </span>
        <div className="style-controls-header-actions">
          {showReset && (
            <button
              type="button"
              onClick={onReset}
              className="reset-panel-btn"
              title={extra.resetTooltip}
            >
              <RotateCcw size={14} />
            </button>
          )}
        </div>
      </div>
      {/* 1. Collapsible Layout Selector */}
      <div className="control-section">
        <button
          type="button"
          onClick={() => setIsLayoutOpen(!isLayoutOpen)}
          className="section-header-toggle"
        >
          <span className="section-title">
            <Layout size={16} />
            {t.templateLabel}
          </span>
          {isLayoutOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        
        {isLayoutOpen && (
          <div className="collapsible-content">
            <select
              value={template}
              onChange={(e) => setTemplate(e.target.value as ResumeTemplate)}
              className="app-select template-dropdown"
              style={{ width: "100%", marginTop: "4px" }}
            >
              {templatesList.map((tpl) => (
                <option key={tpl} value={tpl}>
                  {getLayoutLabel(tpl, lang)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* 2. Collapsible Font Size Sliders Section */}
      <div className="control-section">
        <button
          type="button"
          onClick={() => setIsSizesOpen(!isSizesOpen)}
          className="section-header-toggle"
        >
          <span className="section-title">
            <Sliders size={16} />
            {t.fontSizeControls}
          </span>
          {isSizesOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {isSizesOpen && (
          <div className="collapsible-content sliders-stack">
            {/* Body Size */}
            <div className="slider-item">
              <div className="slider-header">
                <span>{t.bodyText}</span>
                <span className="slider-value">{styles.bodySize}px</span>
              </div>
              <input
                type="range"
                min="11"
                max="22"
                value={styles.bodySize}
                onChange={(e) => updateStyle("bodySize", parseInt(e.target.value))}
                className="app-slider"
              />
            </div>

            {/* H1 Size */}
            <div className="slider-item">
              <div className="slider-header">
                <span>{t.heading1}</span>
                <span className="slider-value">{styles.h1Size}px</span>
              </div>
              <input
                type="range"
                min="20"
                max="42"
                value={styles.h1Size}
                onChange={(e) => updateStyle("h1Size", parseInt(e.target.value))}
                className="app-slider"
              />
            </div>

            {/* H2 Size */}
            <div className="slider-item">
              <div className="slider-header">
                <span>{t.heading2}</span>
                <span className="slider-value">{styles.h2Size}px</span>
              </div>
              <input
                type="range"
                min="16"
                max="32"
                value={styles.h2Size}
                onChange={(e) => updateStyle("h2Size", parseInt(e.target.value))}
                className="app-slider"
              />
            </div>

            {/* H3 Size */}
            <div className="slider-item">
              <div className="slider-header">
                <span>{t.heading3}</span>
                <span className="slider-value">{styles.h3Size}px</span>
              </div>
              <input
                type="range"
                min="13"
                max="26"
                value={styles.h3Size}
                onChange={(e) => updateStyle("h3Size", parseInt(e.target.value))}
                className="app-slider"
              />
            </div>

            {/* H4 Size */}
            <div className="slider-item">
              <div className="slider-header">
                <span>{t.heading4}</span>
                <span className="slider-value">{styles.h4Size}px</span>
              </div>
              <input
                type="range"
                min="11"
                max="22"
                value={styles.h4Size}
                onChange={(e) => updateStyle("h4Size", parseInt(e.target.value))}
                className="app-slider"
              />
            </div>

            {/* H5 Size */}
            <div className="slider-item">
              <div className="slider-header">
                <span>{t.heading5}</span>
                <span className="slider-value">{styles.h5Size}px</span>
              </div>
              <input
                type="range"
                min="10"
                max="20"
                value={styles.h5Size}
                onChange={(e) => updateStyle("h5Size", parseInt(e.target.value))}
                className="app-slider"
              />
            </div>

            {/* H6 Size */}
            <div className="slider-item">
              <div className="slider-header">
                <span>{t.heading6}</span>
                <span className="slider-value">{styles.h6Size}px</span>
              </div>
              <input
                type="range"
                min="9"
                max="18"
                value={styles.h6Size}
                onChange={(e) => updateStyle("h6Size", parseInt(e.target.value))}
                className="app-slider"
              />
            </div>
          </div>
        )}
      </div>

      {/* 3. Collapsible Preset Color Themes Section */}
      <div className="control-section">
        <button
          type="button"
          onClick={() => setIsPresetsOpen(!isPresetsOpen)}
          className="section-header-toggle"
        >
          <span className="section-title">
            <Sparkles size={16} />
            {t.presetThemes}
          </span>
          {isPresetsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {isPresetsOpen && (
          <div className="collapsible-content presets-list">
            {colorPresets.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => applyPreset(preset)}
                className="preset-btn"
                title={getThemeLabel(preset.name, lang)}
              >
                <span className="preset-name">
                  {getThemeLabel(preset.name, lang)}
                </span>
                <span className="preset-dots">
                  <span style={{ backgroundColor: preset.colors.h1 }} className="preset-dot" />
                  <span style={{ backgroundColor: preset.colors.h2 }} className="preset-dot" />
                  <span style={{ backgroundColor: preset.colors.h3 }} className="preset-dot" />
                  <span style={{ backgroundColor: preset.colors.p }} className="preset-dot" />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 4. Collapsible Advanced Element Styles Section */}
      <div className="control-section">
        <button
          type="button"
          onClick={() => setIsOverridesOpen(!isOverridesOpen)}
          className="section-header-toggle"
        >
          <span className="section-title">
            <Type size={16} />
            {t.elementStyles}
          </span>
          {isOverridesOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {isOverridesOpen && (
          <div className="collapsible-content">
            {/* Tab Buttons */}
            <div className="element-tabs">
              {elementsList.map((el) => (
                <button
                  key={el.key}
                  type="button"
                  onClick={() => setActiveTab(el.key)}
                  className={`tab-btn ${activeTab === el.key ? "active" : ""}`}
                >
                  {el.label}
                </button>
              ))}
            </div>

            {/* Tab Panel */}
            <div className="tab-panel">
              {/* Color Picker */}
              <div className="override-row">
                <label className="override-label">
                  <Palette size={14} />
                  <span>{t.color}</span>
                </label>
                <div className="color-picker-wrapper">
                  <input
                    type="color"
                    value={
                      styles[activeTab].color === "inherit"
                        ? "#374151"
                        : styles[activeTab].color
                    }
                    disabled={styles[activeTab].color === "inherit"}
                    onChange={(e) => updateElementStyle(activeTab, "color", e.target.value)}
                    className="color-swatch"
                  />
                  <select
                    value={styles[activeTab].color === "inherit" ? "inherit" : "custom"}
                    onChange={(e) => {
                      if (e.target.value === "inherit") {
                        updateElementStyle(activeTab, "color", "inherit");
                      } else {
                        updateElementStyle(activeTab, "color", "#374151");
                      }
                    }}
                    className="app-select color-mode-select"
                  >
                    <option value="inherit">{t.inheritLabel}</option>
                    <option value="custom">{t.customLabel}</option>
                  </select>
                  {styles[activeTab].color !== "inherit" && (
                    <input
                      type="text"
                      value={styles[activeTab].color}
                      onChange={(e) => updateElementStyle(activeTab, "color", e.target.value)}
                      className="color-input"
                    />
                  )}
                </div>
              </div>

              {/* Font Family Dropdown */}
              <div className="override-row">
                <label className="override-label">
                  <Type size={14} />
                  <span>{t.fontFamily}</span>
                </label>
                <select
                  value={styles[activeTab].fontFamily}
                  onChange={(e) =>
                    updateElementStyle(activeTab, "fontFamily", e.target.value)
                  }
                  className="app-select font-family-select"
                >
                  <option value="inherit">{t.inheritLabel}</option>
                  <option value="playfair">Playfair Display (Serif)</option>
                  <option value="lora">Lora (Serif)</option>
                  <option value="merriweather">Merriweather (Serif)</option>
                  <option value="inter">Inter (Sans)</option>
                  <option value="outfit">Outfit (Sans)</option>
                  <option value="roboto">Roboto (Sans)</option>
                  <option value="open-sans">Open Sans (Sans)</option>
                  <option value="fira-code">Fira Code (Mono)</option>
                  <option value="jetbrains-mono">JetBrains Mono (Mono)</option>
                  <option value="source-code-pro">Source Code Pro (Mono)</option>
                </select>
              </div>

              {/* Bold Tri-state segmented selector */}
              <div className="override-row vertical-row">
                <span className="override-label-text">{t.boldConfig}</span>
                <div className="segmented-control">
                  <button
                    type="button"
                    onClick={() => updateElementStyle(activeTab, "bold", "inherit")}
                    className={`seg-btn ${styles[activeTab].bold === "inherit" ? "active" : ""}`}
                  >
                    {t.defaultLabel}
                  </button>
                  <button
                    type="button"
                    onClick={() => updateElementStyle(activeTab, "bold", true)}
                    className={`seg-btn ${styles[activeTab].bold === true ? "active" : ""}`}
                  >
                    {t.bold}
                  </button>
                  <button
                    type="button"
                    onClick={() => updateElementStyle(activeTab, "bold", false)}
                    className={`seg-btn ${styles[activeTab].bold === false ? "active" : ""}`}
                  >
                    {t.normalLabel}
                  </button>
                </div>
              </div>

              {/* Italic Tri-state segmented selector */}
              <div className="override-row vertical-row">
                <span className="override-label-text">{t.italicConfig}</span>
                <div className="segmented-control">
                  <button
                    type="button"
                    onClick={() => updateElementStyle(activeTab, "italic", "inherit")}
                    className={`seg-btn ${styles[activeTab].italic === "inherit" ? "active" : ""}`}
                  >
                    {t.defaultLabel}
                  </button>
                  <button
                    type="button"
                    onClick={() => updateElementStyle(activeTab, "italic", true)}
                    className={`seg-btn ${styles[activeTab].italic === true ? "active" : ""}`}
                  >
                    {t.italic}
                  </button>
                  <button
                    type="button"
                    onClick={() => updateElementStyle(activeTab, "italic", false)}
                    className={`seg-btn ${styles[activeTab].italic === false ? "active" : ""}`}
                  >
                    {t.normalLabel}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
