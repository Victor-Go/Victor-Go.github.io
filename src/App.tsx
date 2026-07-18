import React, { useState, useEffect } from "react";
import {
  FileDown,
  Download,
  Sparkles,
  Info,
  Database,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Editor } from "./components/Editor";
import { Preview } from "./components/Preview";
import { StyleControls } from "./components/StyleControls";
import { LanguageSelector } from "./components/LanguageSelector";
import { ResumeModal } from "./components/ResumeModal";
import type { ResumeTemplate } from "./utils/cookies";
import { defaultStyles } from "./utils/storage";
import type { AppStyles } from "./utils/storage";
import { translations, extraTranslations } from "./utils/translations";
import { useResumeStore } from "./stores/useResumeStore";
import { useLayoutStore } from "./stores/useLayoutStore";
import { useUIStore } from "./stores/useUIStore";
import { useLanguage } from "./hooks/useLanguage";
import { useResumePersistence } from "./hooks/useResumePersistence";
import { usePrint } from "./hooks/usePrint";
import { trackPageView } from "./utils/analytics";
import {
  getAccessToken,
  handleOAuthCallback,
  isGoogleDriveSdkInitialized,
  syncWithGoogleDrive,
} from "./utils/googleDriveSync";

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

const getTabLabels = (lang: string) => {
  switch (lang) {
    case "zh":
      return { styles: "样式", editor: "编辑", preview: "预览" };
    case "zh-tw":
      return { styles: "樣式", editor: "編輯", preview: "預覽" };
    case "fr":
      return { styles: "Styles", editor: "Éditeur", preview: "Aperçu" };
    case "de":
      return { styles: "Stile", editor: "Editor", preview: "Vorschau" };
    case "it":
      return { styles: "Stili", editor: "Editor", preview: "Anteprima" };
    case "es":
      return { styles: "Estilos", editor: "Editor", preview: "Vista previa" };
    case "pt":
      return { styles: "Estilos", editor: "Editor", preview: "Visualização" };
    case "ja":
      return { styles: "スタイル", editor: "編集", preview: "プレビュー" };
    case "ko":
      return { styles: "스타일", editor: "편집기", preview: "미리보기" };
    case "ru":
      return { styles: "Стили", editor: "Редактор", preview: "Предпросмотр" };
    case "uk":
      return { styles: "Стилі", editor: "Редактор", preview: "Перегляд" };
    default:
      return { styles: "Styles", editor: "Editor", preview: "Preview" };
  }
};

function App() {
  // Custom hooks
  const { lang, handleLangChange } = useLanguage();
  useResumePersistence();
  const { pdfGenerating, handleExportMarkdown, handleDownloadPdf } = usePrint();

  // Zustand Store - Resume
  const template = useResumeStore((state) => state.template);
  const styles = useResumeStore((state) => state.styles);
  const markdown = useResumeStore((state) => state.markdown);
  const fileName = useResumeStore((state) => state.fileName);
  const avoidPageBreak = useResumeStore((state) => state.avoidPageBreak);
  const avoidPageBreakLevels = useResumeStore((state) => state.avoidPageBreakLevels);
  const setTemplate = useResumeStore((state) => state.setTemplate);
  const setStyles = useResumeStore((state) => state.setStyles);
  const setMarkdown = useResumeStore((state) => state.setMarkdown);
  const setFileName = useResumeStore((state) => state.setFileName);
  const setAvoidPageBreak = useResumeStore((state) => state.setAvoidPageBreak);
  const setAvoidPageBreakLevels = useResumeStore((state) => state.setAvoidPageBreakLevels);
  const loadResume = useResumeStore((state) => state.loadResume);

  // Zustand Store - Layout
  const showSidebar = useLayoutStore((state) => state.showSidebar);
  const leftWidth = useLayoutStore((state) => state.leftWidth);
  const sidebarWidth = useLayoutStore((state) => state.sidebarWidth);
  const setShowSidebar = useLayoutStore((state) => state.setShowSidebar);
  const setLeftWidth = useLayoutStore((state) => state.setLeftWidth);
  const setSidebarWidth = useLayoutStore((state) => state.setSidebarWidth);

  // Zustand Store - UI
  const toast = useUIStore((state) => state.toast);
  const isModalOpen = useUIStore((state) => state.isModalOpen);
  const activeTab = useUIStore((state) => state.activeTab);
  const showToast = useUIStore((state) => state.showToast);
  const clearToast = useUIStore((state) => state.clearToast);
  const setIsModalOpen = useUIStore((state) => state.setIsModalOpen);
  const setActiveTab = useUIStore((state) => state.setActiveTab);

  // Responsive Layout detection
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1200
  );

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    trackPageView();
  }, [lang]);

  useEffect(() => {
    let handledOAuthCallback = false;

    try {
      handledOAuthCallback = handleOAuthCallback();
    } catch (error) {
      console.error("Failed to handle Google Drive OAuth callback:", error);
    }

    if (handledOAuthCallback) {
      showToast(
        (extraTranslations[lang] || extraTranslations["en"]).syncConnectedSuccess,
        "success"
      );

      if (getAccessToken() && isGoogleDriveSdkInitialized()) {
        void syncWithGoogleDrive();
      }

      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [lang, showToast]);

  const isMobile = windowWidth < 1125;

  // Keyboard Shortcuts (Ctrl+S / Ctrl+O)
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
  }, [setIsModalOpen]);

  // Toast Auto-clear
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => clearToast(), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast, clearToast]);

  const handleResetStyles = () => {
    const extra = extraTranslations[lang] || extraTranslations["en"];
    const isConfirmed = confirm(extra.resetConfirm);
    if (isConfirmed) {
      setStyles(defaultStyles);
      localStorage.removeItem("markdown_resume_style_config");
      showToast(extra.resetSuccess, "info");
    }
  };

  const handleTemplateChange = (nextTemplate: ResumeTemplate) => {
    if (!markdown.trim()) {
      setMarkdown(translations[lang].defaultResume);
    }
    setTemplate(nextTemplate);
  };

  const handleResumeLoad = (
    loadedMd: string,
    loadedStyles: AppStyles,
    loadedTemplate: ResumeTemplate,
    loadedFileName?: string
  ) => {
    const mergedStyles: AppStyles = {
      ...defaultStyles,
      ...loadedStyles,
      global: { ...defaultStyles.global, ...loadedStyles?.global },
      h1: { ...defaultStyles.h1, ...loadedStyles?.h1 },
      h2: { ...defaultStyles.h2, ...loadedStyles?.h2 },
      h3: { ...defaultStyles.h3, ...loadedStyles?.h3 },
      p: { ...defaultStyles.p, ...loadedStyles?.p },
      strong: { ...defaultStyles.strong, ...loadedStyles?.strong },
      em: { ...defaultStyles.em, ...loadedStyles?.em },
      a: { ...defaultStyles.a, ...loadedStyles?.a },
    };

    loadResume(loadedMd, mergedStyles, loadedTemplate, loadedFileName);
  };

  // Drag resizers
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

  const handleSidebarMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      let newWidth = startWidth + delta;
      const minWidth = 280;
      const maxWidth = leftWidth - 200;
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
  const tabLabels = getTabLabels(lang);

  return (
    <>
      <div className="app-workspace">
        {/* Top Navbar Actions */}
        <header className="app-header">
          <div className="header-logo">
            <Sparkles size={20} className="logo-icon" />
            <h1>{t.title}</h1>
          </div>

          <div className="header-actions">
            {/* Manage Saved Resumes */}
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="action-btn accent-btn"
              title={t.manageResumes}
            >
              <Database size={16} />
              <span className="btn-text">{t.manageResumes}</span>
            </button>

            {/* File name */}
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

            {/* Download MD */}
            <button
              type="button"
              onClick={handleExportMarkdown}
              className="action-btn secondary-btn"
              title={t.exportMarkdown}
            >
              <FileDown size={16} />
              <span className="btn-text">{t.exportMarkdown}</span>
            </button>

            {/* Download PDF */}
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

            {/* Language Selection */}
            <LanguageSelector lang={lang} setLang={handleLangChange} />
          </div>
        </header>

        {/* Mobile Tabs Switcher */}
        {isMobile && (
          <div className="mobile-tabs-nav">
            <button
              type="button"
              className={`mobile-tab-btn ${activeTab === "styles" ? "active" : ""}`}
              onClick={() => setActiveTab("styles")}
            >
              {tabLabels.styles}
            </button>
            <button
              type="button"
              className={`mobile-tab-btn ${activeTab === "editor" ? "active" : ""}`}
              onClick={() => setActiveTab("editor")}
            >
              {tabLabels.editor}
            </button>
            <button
              type="button"
              className={`mobile-tab-btn ${activeTab === "preview" ? "active" : ""}`}
              onClick={() => setActiveTab("preview")}
            >
              {tabLabels.preview}
            </button>
          </div>
        )}

        {/* Workspace Panel Split */}
        <main className={`workspace-main ${isMobile ? "workspace-mobile" : ""}`}>
          {!isMobile ? (
            <>
              {/* Desktop Workspace: Multi-pane side-by-side splits */}
              <div
                className="workspace-left"
                style={{
                  width: showSidebar ? `${leftWidth}px` : `${leftWidth - sidebarWidth}px`,
                }}
              >
                {showSidebar && (
                  <>
                    <StyleControls
                      styles={styles}
                      onChange={setStyles}
                      lang={lang}
                      template={template}
                      setTemplate={handleTemplateChange}
                      style={{ width: `${sidebarWidth}px` }}
                      onReset={handleResetStyles}
                      showReset={hasStyleChanges}
                      avoidPageBreak={avoidPageBreak}
                      setAvoidPageBreak={setAvoidPageBreak}
                      avoidPageBreakLevels={avoidPageBreakLevels}
                      setAvoidPageBreakLevels={setAvoidPageBreakLevels}
                    />
                    <div className="sidebar-resizer" onMouseDown={handleSidebarMouseDown} />
                  </>
                )}

                <Editor markdown={markdown} onChange={setMarkdown} lang={lang} />
              </div>

              <div className="workspace-resizer" onMouseDown={handleMouseDown} />

              <div className="workspace-right">
                <Preview
                  markdown={markdown}
                  styles={styles}
                  lang={lang}
                  template={template}
                  avoidPageBreak={avoidPageBreak}
                  avoidPageBreakLevels={avoidPageBreakLevels}
                />
              </div>

              {/* Floating Sidebar Toggle Handle */}
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
                title={showSidebar ? extra.hidePanel : extra.showPanel}
              >
                {showSidebar ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
              </button>
            </>
          ) : (
            /* Mobile Workspace: Conditionally render based on active mobile tab */
            <div className="mobile-active-pane">
              {activeTab === "styles" && (
                <StyleControls
                  styles={styles}
                  onChange={setStyles}
                  lang={lang}
                  template={template}
                  setTemplate={handleTemplateChange}
                  onReset={handleResetStyles}
                  showReset={hasStyleChanges}
                  avoidPageBreak={avoidPageBreak}
                  setAvoidPageBreak={setAvoidPageBreak}
                  avoidPageBreakLevels={avoidPageBreakLevels}
                  setAvoidPageBreakLevels={setAvoidPageBreakLevels}
                />
              )}
              {activeTab === "editor" && (
                <Editor markdown={markdown} onChange={setMarkdown} lang={lang} />
              )}
              {activeTab === "preview" && (
                <Preview
                  markdown={markdown}
                  styles={styles}
                  lang={lang}
                  template={template}
                  avoidPageBreak={avoidPageBreak}
                  avoidPageBreakLevels={avoidPageBreakLevels}
                />
              )}
            </div>
          )}
        </main>

        {/* Info notice for page breaks */}
        <div className="page-break-tip">
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Info size={14} />
            <span>{extra.pageBreakTip}</span>
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
            <span>{extra.githubStarText}</span>
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
