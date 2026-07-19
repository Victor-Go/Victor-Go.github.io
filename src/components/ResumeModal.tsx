import React, { useState, useEffect } from "react";
import { X, Trash2, FolderOpen, Save, FileText, Cloud, RefreshCw, CheckCircle, AlertCircle } from "lucide-react";
import {
  getSavedResumesList,
  saveResumeSlot,
  loadResumeSlot,
  deleteResumeSlot,
} from "../utils/cookies";
import type { ResumeTemplate, ResumeData } from "../utils/cookies";
import type { AppStyles } from "../utils/storage";
import { translations, extraTranslations } from "../utils/translations";
import {
  getSyncStatus,
  subscribeSyncStatus,
  loginToGDrive,
  logoutFromGDrive,
  syncWithGoogleDrive,
  getAccessToken,
  getSyncErrorMessage,
  getLastSuccessfulSyncAt,
  isGoogleDriveSdkInitialized,
  shouldSyncGoogleDrive,
} from "../utils/googleDriveSync";
import type { SyncStatusType } from "../utils/googleDriveSync";

interface ResumeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentMarkdown: string;
  currentStyles: AppStyles;
  currentTemplate: ResumeTemplate;
  currentFileName: string;
  onLoad: (
    markdown: string,
    styles: AppStyles,
    template: ResumeTemplate,
    fileName?: string
  ) => void;
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
  showToast: (message: string, type?: "success" | "error" | "info") => void;
}

export const ResumeModal: React.FC<ResumeModalProps> = ({
  isOpen,
  onClose,
  currentMarkdown,
  currentStyles,
  currentTemplate,
  currentFileName,
  onLoad,
  lang,
  showToast,
}) => {
  const t = translations[lang];
  const [resumes, setResumes] = useState<ResumeData[]>([]);
  const [newResumeName, setNewResumeName] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [lastLoadedId, setLastLoadedId] = useState<string | null>(null);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  const [syncStatus, setSyncStatusState] = useState<SyncStatusType>(getSyncStatus());
  const [syncError, setSyncError] = useState<string | null>(getSyncErrorMessage(lang));
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(getLastSuccessfulSyncAt());

  const searchPlaceholderMap: Record<string, string> = {
    en: "Search...",
    zh: "搜索...",
    "zh-tw": "搜尋...",
    fr: "Rechercher...",
    de: "Suchen...",
    it: "Cerca...",
    es: "Buscar...",
    pt: "Buscar...",
    ja: "検索...",
    ko: "검색...",
    ru: "Поиск...",
    uk: "Пошук...",
  };
  const searchPlaceholder = searchPlaceholderMap[lang] || searchPlaceholderMap["en"];

  // Refresh saved resume slots from localStorage
  const refreshList = () => {
    const savedResumes = getSavedResumesList();
    const visibleResumes = savedResumes.filter((item) => !item.deleted);
    // Load full details for each
    const fullList = visibleResumes
      .map((item) => loadResumeSlot(item.id))
      .filter((item): item is ResumeData => item !== null);
    // Sort by timestamp descending (most recent first)
    fullList.sort((a, b) => b.timestamp - a.timestamp);
    setResumes(fullList);
    setLastLoadedId(localStorage.getItem("last_loaded_resume_id"));
    setLastSavedId(localStorage.getItem("last_saved_resume_id"));
  };

  useEffect(() => {
    setSyncStatusState(getSyncStatus());
    setSyncError(getSyncErrorMessage(lang));
    const unsubscribe = subscribeSyncStatus((status) => {
      setSyncStatusState(status);
      const error = getSyncErrorMessage(lang);
      setSyncError(error);
      if (status === "completed") {
        setLastSyncAt(getLastSuccessfulSyncAt());
        refreshList();
      }
      if (status === "failed" && isOpen) {
        showToast(`${t.syncStatus.failed}: ${error || "Sync failed"}`, "error");
      }
    });
    return () => unsubscribe();
  }, [isOpen, showToast, t.syncStatus.failed]);

  useEffect(() => {
    if (!isOpen) return;

    refreshList();
    setNewResumeName("");
    setErrorMsg(null);
    setSearchQuery("");

    setLastSyncAt(getLastSuccessfulSyncAt());
    if (
      getSyncStatus() !== "disconnected" &&
      isGoogleDriveSdkInitialized() &&
      shouldSyncGoogleDrive()
    ) {
      void syncWithGoogleDrive();
    }

    const handleOnline = () => {
      if (getSyncStatus() !== "disconnected" && isGoogleDriveSdkInitialized()) {
        void syncWithGoogleDrive();
      }
    };

    window.addEventListener("online", handleOnline);

    const handleLocalSyncEvent = () => {
      refreshList();
    };
    window.addEventListener("local_resumes_synced", handleLocalSyncEvent);

    const handleLocalResumeChange = () => {
      if (
        getSyncStatus() !== "syncing" &&
        getSyncStatus() !== "disconnected" &&
        isGoogleDriveSdkInitialized()
      ) {
        void syncWithGoogleDrive();
      }
    };
    window.addEventListener("local_resume_saved", handleLocalResumeChange);
    window.addEventListener("local_resume_deleted", handleLocalResumeChange);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("local_resumes_synced", handleLocalSyncEvent);
      window.removeEventListener("local_resume_saved", handleLocalResumeChange);
      window.removeEventListener("local_resume_deleted", handleLocalResumeChange);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const formattedLastSync = lastSyncAt
    ? new Intl.DateTimeFormat(lang, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(lastSyncAt)
    : null;

  const handleSave = () => {
    const trimmedName = newResumeName.trim();
    if (!trimmedName) {
      setErrorMsg((extraTranslations[lang] || extraTranslations["en"]).nameRequired);
      return;
    }

    // Check if a saved resume with the same name already exists
    const existing = resumes.find(
      (r) => r.name.toLowerCase() === trimmedName.toLowerCase()
    );

    let existingId: string | undefined = undefined;
    if (existing) {
      const extra = extraTranslations[lang] || extraTranslations["en"];
      const wantOverwrite = confirm(extra.overwriteConfirm);
      if (!wantOverwrite) {
        return; // User cancelled overwrite
      }
      existingId = existing.id; // Overwrite this slot ID
    }

    const result = saveResumeSlot(
      trimmedName,
      currentMarkdown,
      currentStyles,
      currentTemplate,
      existingId,
      currentFileName
    );

    if (result.success) {
      if (result.id) {
        localStorage.setItem("last_saved_resume_id", result.id);
      }
      showToast(t.successSave, "success");
      setNewResumeName("");
      setErrorMsg(null);
      refreshList();
    } else {
      setErrorMsg(result.error || t.storageError);
    }
  };

  const handleLoad = (id: string) => {
    const data = loadResumeSlot(id);
    if (data) {
      localStorage.setItem("last_loaded_resume_id", id);
      onLoad(data.markdown, data.styles, data.template, data.fileName);
      showToast((extraTranslations[lang] || extraTranslations["en"]).loadSuccess, "success");
      onClose();
    } else {
      showToast(t.storageError, "error");
    }
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // Prevent loading click trigger
    const extra = extraTranslations[lang] || extraTranslations["en"];
    if (confirm(extra.deleteConfirm)) {
      deleteResumeSlot(id);
      if (localStorage.getItem("last_loaded_resume_id") === id) {
        localStorage.removeItem("last_loaded_resume_id");
      }
      if (localStorage.getItem("last_saved_resume_id") === id) {
        localStorage.removeItem("last_saved_resume_id");
      }
      showToast(extra.deletedToast, "info");
      refreshList();
    }
  };

  const handleOverwrite = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation(); // Prevent loading click trigger
    const extra = extraTranslations[lang] || extraTranslations["en"];
    const wantOverwrite = confirm(extra.overwriteConfirm);
    if (!wantOverwrite) {
      return;
    }
    const result = saveResumeSlot(
      name,
      currentMarkdown,
      currentStyles,
      currentTemplate,
      id,
      currentFileName
    );
    if (result.success) {
      if (result.id) {
        localStorage.setItem("last_saved_resume_id", result.id);
      }
      showToast(t.successSave, "success");
      refreshList();
    } else {
      showToast(result.error || t.storageError, "error");
    }
  };

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };
  const renderSnippet = (text: string, query: string) => {
    if (!query.trim()) return null;
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase().trim();
    const index = lowerText.indexOf(lowerQuery);
    if (index === -1) return null;

    const start = Math.max(0, index - 50);
    const end = Math.min(text.length, index + query.length + 50);
    const snippet = text.slice(start, end);
    
    const keywordStart = index - start;
    const keywordEnd = keywordStart + query.length;

    const before = snippet.slice(0, keywordStart);
    const keyword = snippet.slice(keywordStart, keywordEnd);
    const after = snippet.slice(keywordEnd);

    const hasPrefix = start > 0;
    const hasSuffix = end < text.length;

    return (
      <div className="slot-snippet">
        {hasPrefix && "..."}
        {before}
        <mark className="search-keyword-highlight">{keyword}</mark>
        {after}
        {hasSuffix && "..."}
      </div>
    );
  };
  const highlightText = (text: string, query: string): React.ReactNode => {
    if (!query.trim()) return text;
    const lowerQuery = query.toLowerCase().trim();
    const regex = new RegExp(`(${lowerQuery.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')})`, 'gi');
    const matches = [...text.matchAll(regex)];
    if (matches.length === 0) return text;

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    matches.forEach((match, idx) => {
      const matchIndex = match.index!;
      if (matchIndex > lastIndex) {
        parts.push(text.slice(lastIndex, matchIndex));
      }
      parts.push(
        <mark key={idx} className="search-keyword-highlight">
          {text.slice(matchIndex, matchIndex + match[0].length)}
        </mark>
      );
      lastIndex = matchIndex + match[0].length;
    });

    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return <>{parts}</>;
  };

  const filteredResumes = resumes.filter((resume) => {
    if (!searchQuery.trim()) return true;
    const queryLower = searchQuery.toLowerCase().trim();

    const name = resume.name || "";
    const template = resume.template || "";
    const markdown = resume.markdown || "";
    const formattedDate = formatDate(resume.timestamp);

    return (
      name.toLowerCase().includes(queryLower) ||
      template.toLowerCase().includes(queryLower) ||
      markdown.toLowerCase().includes(queryLower) ||
      formattedDate.toLowerCase().includes(queryLower)
    );
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-title-wrapper">
            <FileText className="title-icon" size={18} />
            <h2>{t.manageResumes}</h2>
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Modal Content */}
        <div className="modal-body">
          {/* Section: Save Current Resume */}
          <div className="modal-section">
            <h3 className="modal-section-title">
              <Save size={14} />
              <span>
                {(extraTranslations[lang] || extraTranslations["en"]).backupSectionTitle}
              </span>
            </h3>
            <div className="save-form">
              <input
                type="text"
                value={newResumeName}
                onChange={(e) => {
                  setNewResumeName(e.target.value);
                  setErrorMsg(null);
                }}
                placeholder={t.slotNamePlaceholder}
                className="modal-input"
              />
              <button type="button" onClick={handleSave} className="action-btn primary-btn">
                {t.saveButton.replace(/Cookie/gi, "Storage")}
              </button>
            </div>
            {errorMsg && <div className="modal-error">{errorMsg}</div>}
          </div>

          {/* Section: Google Drive Sync */}
          <div className="modal-section google-drive-sync-section" style={{ borderBottom: "1px solid var(--border)", paddingBottom: "16px", marginBottom: "16px" }}>
            <h3 className="modal-section-title">
              <Cloud size={14} />
              <span>{t.syncStatus.title}</span>
            </h3>
            {syncStatus === "disconnected" ? (
              <div style={{ display: "flex", alignItems: "center", gap: "12px", width: "100%" }}>
                <button
                  type="button"
                  onClick={loginToGDrive}
                  className="action-btn primary-btn"
                  style={{ display: "flex", alignItems: "center", gap: "6px" }}
                >
                  <Cloud size={16} />
                  {t.syncStatus.login}
                </button>
                <a
                  href="privacy.html"
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: "12px", color: '#aaa' }}
                >
                  {t.syncStatus.privacyPolicy}
                </a>
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  gap: "12px",
                  padding: "12px 14px",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--bg-input)",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "4px" }}>
                  {(syncStatus === "syncing" || syncStatus === "retrying") && (
                    <span
                      style={{
                        color: "#60a5fa",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "13px",
                        fontWeight: 500,
                      }}
                    >
                      <RefreshCw size={14} className="animate-spin" />
                      {syncStatus === "retrying" ? `${t.syncStatus.syncing}…` : t.syncStatus.syncing}
                    </span>
                  )}
                  {syncStatus === "completed" && (
                    <span
                      style={{
                        color: "var(--success)",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "13px",
                        fontWeight: 500,
                      }}
                    >
                      <CheckCircle size={14} />
                      {t.syncStatus.completed}
                    </span>
                  )}
                  {syncStatus === "failed" && (
                    <span
                      style={{
                        color: "#f59e0b",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "13px",
                        fontWeight: 500,
                      }}
                    >
                      <AlertCircle size={14} />
                      {t.syncStatus.failed}
                    </span>
                  )}
                  {formattedLastSync && (
                    <span style={{ color: "var(--text-muted)", fontSize: "11px" }}>
                      {t.syncStatus.lastSynced}: {formattedLastSync}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <button
                    type="button"
                    disabled={syncStatus === "syncing" || syncStatus === "retrying"}
                    onClick={() => {
                      if (getAccessToken() && isGoogleDriveSdkInitialized()) {
                        void syncWithGoogleDrive();
                      } else {
                        void loginToGDrive();
                      }
                    }}
                    className="action-btn secondary-btn"
                    style={{
                      height: "28px",
                      padding: "0 10px",
                      fontSize: "12px",
                      gap: "4px",
                    }}
                  >
                    <RefreshCw size={11} />
                    {t.syncStatus.syncNow}
                  </button>
                  <button
                    type="button"
                    onClick={logoutFromGDrive}
                    className="delete-slot-btn"
                    style={{
                      padding: "4px 8px",
                      fontSize: "12px",
                      fontWeight: 500,
                      borderRadius: "4px",
                      height: "28px",
                      display: "inline-flex",
                      alignItems: "center",
                    }}
                  >
                    {t.syncStatus.disconnect}
                  </button>
                </div>
              </div>
            )}
            {syncStatus === "failed" && syncError && (
              <div className="modal-error" role="alert" style={{ marginTop: "10px" }}>
                {syncError}
              </div>
            )}
          </div>

          {/* Section: Saved Resumes List */}
          <div className="modal-section">
            <h3 className="modal-section-title" style={{ justifyContent: "space-between", width: "100%" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <FolderOpen size={14} />
                <span>{t.savedResume}</span>
              </div>
              {resumes.length > 0 && (
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="modal-search-input"
                  onClick={(e) => e.stopPropagation()}
                />
              )}
            </h3>

            {resumes.length === 0 ? (
              <div className="empty-state">{t.noResumesSaved.replace(/Cookie/gi, "Storage")}</div>
            ) : filteredResumes.length === 0 ? (
              <div className="empty-state">
                {lang === "zh" ? "没有找到匹配的简历" : "No matching resumes found"}
              </div>
            ) : (
              <div className="resumes-list">
                {filteredResumes.map((resume) => (
                  <div
                    key={resume.id}
                    onClick={() => handleLoad(resume.id)}
                    className="resume-slot-item"
                    title={(extraTranslations[lang] || extraTranslations["en"]).clickToLoad}
                  >
                    <div className="slot-left-content" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <div className="slot-info">
                        <span className="slot-name">{highlightText(resume.name, searchQuery)}</span>
                        {renderSnippet(resume.markdown, searchQuery)}
                        <span className="slot-meta">
                          Template: {highlightText(resume.template.toUpperCase(), searchQuery)} •{" "}
                          {highlightText(formatDate(resume.timestamp), searchQuery)}
                        </span>
                      </div>
                      {(resume.id === lastLoadedId || resume.id === lastSavedId) && (
                        <div className="slot-status-tags" style={{ display: "flex", gap: "6px" }}>
                          {resume.id === lastLoadedId && (
                            <span className="status-tag status-tag-loaded" style={{
                              display: "inline-flex",
                              alignItems: "center",
                              padding: "2px 8px",
                              fontSize: "10px",
                              fontWeight: 600,
                              borderRadius: "12px",
                              backgroundColor: "rgba(16, 185, 129, 0.1)",
                              color: "#10b981",
                              border: "1px solid rgba(16, 185, 129, 0.2)"
                            }}>
                              {(extraTranslations[lang] || extraTranslations["en"]).lastLoaded}
                            </span>
                          )}
                          {resume.id === lastSavedId && (
                            <span className="status-tag status-tag-saved" style={{
                              display: "inline-flex",
                              alignItems: "center",
                              padding: "2px 8px",
                              fontSize: "10px",
                              fontWeight: 600,
                              borderRadius: "12px",
                              backgroundColor: "rgba(99, 102, 241, 0.1)",
                              color: "#6366f1",
                              border: "1px solid rgba(99, 102, 241, 0.2)"
                            }}>
                              {(extraTranslations[lang] || extraTranslations["en"]).lastSaved}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="slot-actions">
                      <button
                        type="button"
                        onClick={(e) => handleOverwrite(e, resume.id, resume.name)}
                        className="save-slot-btn"
                        title={t.saveButton.replace(/Cookie/gi, "Storage")}
                      >
                        <Save size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDelete(e, resume.id)}
                        className="delete-slot-btn"
                        title={t.deleteButton}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
