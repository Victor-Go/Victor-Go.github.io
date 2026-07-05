import { useState, useEffect } from "react";
import {
  FileDown,
  Download,
  Sparkles,
  Info,
  Database,
  ChevronLeft,
  ChevronRight,
  Monitor,
} from "lucide-react";
import { Editor } from "./components/Editor";
import { Preview } from "./components/Preview";
import { StyleControls } from "./components/StyleControls";
import { LanguageSelector } from "./components/LanguageSelector";
import { ResumeModal } from "./components/ResumeModal";
import type { ResumeTemplate } from "./utils/cookies";
import {
  loadStylesFromStorage,
  saveStylesToStorage,
  defaultStyles,
} from "./utils/storage";
import type { AppStyles } from "./utils/storage";
import { translations, extraTranslations } from "./utils/translations";
import { generateResumePDF } from "./utils/pdf";

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

const getFileNameLabel = (lang: string): string => {
  switch (lang) {
    case "zh": return "文件名";
    case "zh-tw": return "檔案名稱";
    case "fr": return "Nom du fichier";
    case "de": return "Dateiname";
    case "it": return "Nome del file";
    case "es": return "Nombre de archivo";
    case "pt": return "Nome do arquivo";
    case "ja": return "ファイル名";
    case "ko": return "파일명";
    case "ru": return "Имя файла";
    case "uk": return "Ім'я файлу";
    default: return "File Name";
  }
};

function App() {
  const [lang, setLang] = useState<SupportedLang>(() => {
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
    // Check URL parameters first for crawler / link sharing routing
    const urlParams = new URLSearchParams(window.location.search);
    const urlLang = urlParams.get("lang");
    if (urlLang && supported.includes(urlLang as SupportedLang)) {
      return urlLang as SupportedLang;
    }

    const saved = localStorage.getItem("markdown_resume_lang");
    if (saved && supported.includes(saved as SupportedLang)) return saved as SupportedLang;

    const sysLangFull = (navigator.language || "en").toLowerCase();
    if (sysLangFull.includes("zh-tw") || sysLangFull.includes("zh-hk") || sysLangFull.includes("zh-hant") || sysLangFull.includes("tw") || sysLangFull.includes("hk")) {
      return "zh-tw";
    }
    const sysLang = sysLangFull.split("-")[0];
    return supported.includes(sysLang as SupportedLang)
      ? (sysLang as SupportedLang)
      : "en";
  });

  const [template, setTemplate] = useState<ResumeTemplate>(() => {
    return (localStorage.getItem("markdown_resume_template") as ResumeTemplate) || "classic";
  });
  const [styles, setStyles] = useState<AppStyles>(() => loadStylesFromStorage());
  const [markdown, setMarkdown] = useState<string>(() => {
    return localStorage.getItem("markdown_resume_content") || "";
  });
  
  // Feedback Messages/Toast state & Modals
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [fileName, setFileName] = useState(() => {
    return localStorage.getItem("markdown_resume_file_name") || "resume";
  });
  const [showSidebar, setShowSidebar] = useState(() => {
    const saved = localStorage.getItem("markdown_resume_show_sidebar");
    return saved === null ? true : saved === "true";
  });
  const [leftWidth, setLeftWidth] = useState(() => {
    const saved = localStorage.getItem("markdown_resume_left_width");
    return saved ? parseInt(saved, 10) : 820;
  });
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem("markdown_resume_sidebar_width");
    return saved ? Math.max(280, parseInt(saved, 10)) : 340;
  });

  const [avoidPageBreak, setAvoidPageBreak] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("markdown_resume_avoid_page_break");
      return saved === null ? true : saved === "true";
    } catch (e) {
      console.error("Failed to load avoidPageBreak from localStorage", e);
      return true;
    }
  });

  // Track if it's the initial load to prevent default resume from overriding saved content
  const [isFirstLoad, setIsFirstLoad] = useState(true);

  // Initialize markdown with default translation once lang is resolved
  useEffect(() => {
    if (isFirstLoad) {
      setIsFirstLoad(false);
      // If there is no saved markdown, default to the language's preset CV
      const saved = localStorage.getItem("markdown_resume_content");
      if (saved) {
        setMarkdown(saved);
        return;
      }
    }
    
    if (!markdown) {
      setMarkdown(translations[lang].defaultResume);
    }
  }, [lang]);

  // Auto-save settings & state to localStorage on changes
  useEffect(() => {
    localStorage.setItem("markdown_resume_lang", lang);
  }, [lang]);

  useEffect(() => {
    localStorage.setItem("markdown_resume_template", template);
  }, [template]);

  useEffect(() => {
    saveStylesToStorage(styles);
  }, [styles]);

  useEffect(() => {
    if (markdown) {
      localStorage.setItem("markdown_resume_content", markdown);
    }
  }, [markdown]);

  useEffect(() => {
    localStorage.setItem("markdown_resume_show_sidebar", String(showSidebar));
  }, [showSidebar]);

  useEffect(() => {
    localStorage.setItem("markdown_resume_file_name", fileName);
  }, [fileName]);

  useEffect(() => {
    localStorage.setItem("markdown_resume_left_width", String(leftWidth));
  }, [leftWidth]);

  useEffect(() => {
    localStorage.setItem("markdown_resume_sidebar_width", String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    try {
      localStorage.setItem("markdown_resume_avoid_page_break", String(avoidPageBreak));
    } catch (e) {
      console.error("Failed to save avoidPageBreak to localStorage", e);
    }
  }, [avoidPageBreak]);

  // Keyboard Shortcuts (Ctrl+S / Ctrl+O) to backup/restore CVs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      if (isCtrlOrCmd) {
        if (e.key.toLowerCase() === "s" || e.key.toLowerCase() === "o") {
          e.preventDefault();
          setIsModalOpen(true);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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

  // Toast auto-clear
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type });
  };

  // 2. Language Switch handler
  const handleLangChange = (newLang: SupportedLang) => {
    // Overwrite the resume ONLY if they haven't modified the default template resume
    if (markdown === translations[lang].defaultResume) {
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

  // Styles configuration is now auto-saved on changes. Manual Save/Load buttons removed.
  const handleResetStyles = () => {
    const extra = extraTranslations[lang] || extraTranslations["en"];
    const isConfirmed = confirm(extra.resetConfirm);
    if (isConfirmed) {
      setStyles(defaultStyles);
      localStorage.removeItem("markdown_resume_style_config");
      showToast(extra.resetSuccess, "info");
    }
  };

  // 6. Export Markdown to local file
  const handleExportMarkdown = () => {
    const extra = extraTranslations[lang] || extraTranslations["en"];
    try {
      const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${fileName}.md`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast(extra.mdSuccess, "success");
    } catch (err) {
      console.error(err);
      showToast(extra.mdError, "error");
    }
  };

  // 7. Generate PDF
  const handleDownloadPdf = async () => {
    const extra = extraTranslations[lang] || extraTranslations["en"];
    setPdfGenerating(true);
    showToast(extra.pdfGeneratingToast, "info");
    
    try {
      const filename = `${fileName}.pdf`;
      await generateResumePDF("preview-container", filename);
      showToast(extra.pdfSuccess, "success");
    } catch (err: any) {
      console.error(err);
      showToast(extra.pdfError, "error");
    } finally {
      setPdfGenerating(false);
    }
  };

  // 8. Handler for loading from cookie slots modal
  const handleResumeLoad = (
    loadedMd: string,
    loadedStyles: AppStyles,
    loadedTemplate: ResumeTemplate,
    loadedFileName?: string
  ) => {
    setMarkdown(loadedMd);
    setStyles(loadedStyles);
    setTemplate(loadedTemplate);
    if (loadedFileName) {
      setFileName(loadedFileName);
    }
  };

  // 9. Resize dragging logic
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = leftWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      let newWidth = startWidth + delta;
      const minWidth = showSidebar ? 480 : 200;
      const maxWidth = window.innerWidth - 300;
      if (newWidth < minWidth) newWidth = minWidth;
      if (newWidth > maxWidth) newWidth = maxWidth;
      setLeftWidth(newWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // 10. Sidebar Resize dragging logic
  const handleSidebarMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      let newWidth = startWidth + delta;
      const minWidth = 280;
      const maxWidth = leftWidth - 200; // Leave at least 200px for the editor
      if (newWidth < minWidth) newWidth = minWidth;
      if (newWidth > maxWidth) newWidth = maxWidth;
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const t = translations[lang];
  const hasStyleChanges = JSON.stringify(styles) !== JSON.stringify(defaultStyles);
  const extra = extraTranslations[lang] || extraTranslations["en"];

  return (
    <>
      <div className="low-res-barrier">
        <div className="barrier-content">
          <Monitor size={48} className="barrier-icon" />
          <h2>{extra.barrierTitle}</h2>
          <p>{extra.barrierDescription}</p>
        </div>
      </div>
      <div className="app-workspace">
      {/* Top Navbar Actions */}
      <header className="app-header">
        <div className="header-logo">
          <Sparkles size={20} className="logo-icon" />
          <h1>{t.title}</h1>
        </div>

        <div className="header-actions">
          {/* 1. Manage Saved Resumes */}
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="action-btn accent-btn"
            title={t.manageResumes}
          >
            <Database size={16} />
            <span className="btn-text">{t.manageResumes}</span>
          </button>

          {/* 2. File name */}
          <div className="header-file-wrapper">
            <span className="file-label">{getFileNameLabel(lang)}:</span>
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              className="header-file-input"
              placeholder="resume"
            />
          </div>

          {/* 3. Download MD */}
          <button
            type="button"
            onClick={handleExportMarkdown}
            className="action-btn secondary-btn"
            title={t.exportMarkdown}
          >
            <FileDown size={16} />
            <span className="btn-text">{t.exportMarkdown}</span>
          </button>

          {/* 4. Download PDF */}
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={pdfGenerating}
            className="action-btn primary-btn download-btn"
            title={t.downloadPdf}
          >
            <Download size={16} className={pdfGenerating ? "animate-spin" : ""} />
            <span className="btn-text">{pdfGenerating ? "..." : t.downloadPdf}</span>
          </button>

          {/* 5. Language */}
          <LanguageSelector lang={lang} setLang={handleLangChange} />
        </div>
      </header>

      {/* Workspace Panel Split */}
      <main className="workspace-main">
        {/* Left Side: Sidebar controls & Editor */}
        <div className="workspace-left" style={{ width: showSidebar ? `${leftWidth}px` : `${leftWidth - sidebarWidth}px` }}>
          {/* Controls Config */}
          {showSidebar && (
            <>
              <StyleControls
                styles={styles}
                onChange={setStyles}
                lang={lang}
                template={template}
                setTemplate={setTemplate}
                style={{ width: `${sidebarWidth}px` }}
                onReset={handleResetStyles}
                showReset={hasStyleChanges}
                avoidPageBreak={avoidPageBreak}
                setAvoidPageBreak={setAvoidPageBreak}
              />
              {/* Sidebar Resizer Splitter Handle */}
              <div className="sidebar-resizer" onMouseDown={handleSidebarMouseDown} />
            </>
          )}

          {/* Raw Editor */}
          <Editor markdown={markdown} onChange={setMarkdown} lang={lang} />
        </div>

        {/* Resizer Splitter Handle */}
        <div className="workspace-resizer" onMouseDown={handleMouseDown} />

        {/* Right Side: Live preview */}
        <div className="workspace-right">
          <Preview
            markdown={markdown}
            styles={styles}
            lang={lang}
            template={template}
            avoidPageBreak={avoidPageBreak}
          />
        </div>

        {/* Floating Sidebar Toggle Handle in Vertical Center */}
        <button
          type="button"
          onClick={() => setShowSidebar(!showSidebar)}
          className={`sidebar-toggle-handle ${showSidebar ? "open" : "collapsed"}`}
          style={{
            position: "absolute",
            left: showSidebar ? `${sidebarWidth}px` : "0px",
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 100,
          }}
          title={showSidebar ? (extraTranslations[lang] || extraTranslations["en"]).hidePanel : (extraTranslations[lang] || extraTranslations["en"]).showPanel}
        >
          {showSidebar ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
        </button>
      </main>

      {/* Info notice for page breaks */}
      <div className="page-break-tip">
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <Info size={14} />
          <span>
            {(extraTranslations[lang] || extraTranslations["en"]).pageBreakTip}
          </span>
        </div>
        <a
          href="https://github.com/Victor-Go/Victor-Go.github.io"
          target="_blank"
          rel="noopener noreferrer"
          className="github-star-link"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            color: "var(--accent)",
            textDecoration: "none",
            fontWeight: 500,
          }}
        >
          <svg
            height="14"
            width="14"
            viewBox="0 0 16 16"
            fill="currentColor"
            style={{ verticalAlign: "middle" }}
          >
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          <span>
            {(extraTranslations[lang] || extraTranslations["en"]).githubStarText}
          </span>
        </a>
      </div>

      {/* Saved Resumes Cookie Modal */}
      <ResumeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        currentMarkdown={markdown}
        currentStyles={styles}
        currentTemplate={template}
        currentFileName={fileName}
        onLoad={handleResumeLoad}
        lang={lang}
        showToast={showToast}
      />

      {/* Toast Alert Notification */}
      {toast && (
        <div className={`app-toast toast-${toast.type}`}>
          <span>{toast.message}</span>
        </div>
      )}
    </div>
    </>
  );
}

export default App;
