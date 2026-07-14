import type { AppStyles } from "./storage";

export type ResumeTemplate =
  | "classic"
  | "creative"
  | "minimalist"
  | "developer"
  | "academic"
  | "compact"
  | "editorial"
  | "modernist"
  | "executive"
  | "tech"
  | "vintage"
  | "grid"
  | "clean"
  | "bold"
  | "stylish"
  | "hybrid";

export interface ResumeMetadata {
  id: string;
  name: string;
  template: ResumeTemplate;
  timestamp: number;
}

export interface ResumeData {
  id: string;
  name: string;
  markdown: string;
  styles: AppStyles;
  template: ResumeTemplate;
  timestamp: number;
  fileName?: string;
}

// Master Index LocalStorage Key
const LIST_STORAGE_KEY = "saved_resumes_master_list";

/**
 * Returns the index list of saved resumes (metadata only).
 */
export function getSavedResumesList(): ResumeMetadata[] {
  try {
    const dataStr = localStorage.getItem(LIST_STORAGE_KEY);
    if (!dataStr) return [];
    return JSON.parse(dataStr) as ResumeMetadata[];
  } catch (err) {
    console.error("Failed to parse saved resume list:", err);
    return [];
  }
}

/**
 * Saves a full resume slot (markdown content + styles + template selection)
 * into localStorage, and registers it in the master list index.
 */
export function saveResumeSlot(
  name: string,
  markdown: string,
  styles: AppStyles,
  template: ResumeTemplate,
  existingId?: string,
  fileName?: string
): { success: boolean; id?: string; error?: string } {
  try {
    const list = getSavedResumesList();
    const id = existingId || Math.random().toString(36).substring(2, 11);
    const timestamp = Date.now();

    const resumeData: ResumeData = {
      id,
      name,
      markdown,
      styles,
      template,
      timestamp,
      fileName,
    };

    // Serialize slot data
    const serializedData = JSON.stringify(resumeData);
    
    // Save individual slot data in localStorage (5MB quota)
    localStorage.setItem(`saved_resume_slot_${id}`, serializedData);

    // Update master list
    const updatedList = list.filter((item) => item.id !== id);
    updatedList.push({
      id,
      name,
      template,
      timestamp,
    });

    localStorage.setItem(LIST_STORAGE_KEY, JSON.stringify(updatedList));
    return { success: true, id };
  } catch (err: any) {
    console.error("Failed to save resume slot to localStorage:", err);
    return {
      success: false,
      error: err?.message || "Storage access failed or quota exceeded.",
    };
  }
}

/**
 * Loads a full resume data payload by slot ID from localStorage.
 */
export function loadResumeSlot(id: string): ResumeData | null {
  try {
    const dataStr = localStorage.getItem(`saved_resume_slot_${id}`);
    if (!dataStr) return null;
    return JSON.parse(dataStr) as ResumeData;
  } catch (err) {
    console.error(`Failed to load resume slot ${id} from localStorage:`, err);
    return null;
  }
}

/**
 * Deletes the resume slot data from localStorage and removes its index metadata.
 */
export function deleteResumeSlot(id: string): void {
  try {
    // Delete slot data
    localStorage.removeItem(`saved_resume_slot_${id}`);

    // Update master list
    const list = getSavedResumesList();
    const updatedList = list.filter((item) => item.id !== id);
    localStorage.setItem(LIST_STORAGE_KEY, JSON.stringify(updatedList));
  } catch (err) {
    console.error(`Failed to delete resume slot ${id} from localStorage:`, err);
  }
}
