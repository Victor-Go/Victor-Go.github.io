import React, { useState, useEffect } from "react";
import { X, Trash2, FolderOpen, Save, FileText } from "lucide-react";
import {
  getSavedResumesList,
  saveResumeSlot,
  loadResumeSlot,
  deleteResumeSlot,
} from "../utils/cookies";
import type { ResumeMetadata, ResumeTemplate } from "../utils/cookies";
import type { AppStyles } from "../utils/storage";
import { translations, extraTranslations } from "../utils/translations";

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
  const [resumes, setResumes] = useState<ResumeMetadata[]>([]);
  const [newResumeName, setNewResumeName] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Refresh saved resume slots from localStorage
  const refreshList = () => {
    const list = getSavedResumesList();
    // Sort by timestamp descending (most recent first)
    list.sort((a, b) => b.timestamp - a.timestamp);
    setResumes(list);
  };

  useEffect(() => {
    if (!isOpen) return;

    refreshList();
    setNewResumeName("");
    setErrorMsg(null);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

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
      showToast(extra.deletedToast, "info");
      refreshList();
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

          {/* Section: Saved Resumes List */}
          <div className="modal-section">
            <h3 className="modal-section-title">
              <FolderOpen size={14} />
              <span>{t.loadResume}</span>
            </h3>

            {resumes.length === 0 ? (
              <div className="empty-state">{t.noResumesSaved.replace(/Cookie/gi, "Storage")}</div>
            ) : (
              <div className="resumes-list">
                {resumes.map((resume) => (
                  <div
                    key={resume.id}
                    onClick={() => handleLoad(resume.id)}
                    className="resume-slot-item"
                    title={(extraTranslations[lang] || extraTranslations["en"]).clickToLoad}
                  >
                    <div className="slot-info">
                      <span className="slot-name">{resume.name}</span>
                      <span className="slot-meta">
                        Template: {resume.template.toUpperCase()} •{" "}
                        {formatDate(resume.timestamp)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => handleDelete(e, resume.id)}
                      className="delete-slot-btn"
                      title={t.deleteButton}
                    >
                      <Trash2 size={15} />
                    </button>
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
