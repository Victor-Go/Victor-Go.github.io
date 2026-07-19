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
  hash?: string;
  deleted?: boolean;
  /** Monotonically increasing sync version. `timestamp` remains for legacy UI/data. */
  logicalVersion?: number;
  /** Stable random ID of the browser installation that wrote this version. */
  writerDeviceId?: string;
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
const DEVICE_ID_STORAGE_KEY = "gdrive_sync_device_id";
const KNOWN_REMOTE_VERSIONS_STORAGE_KEY = "gdrive_known_remote_versions";
export const MAX_RESUME_PAYLOAD_BYTES = 1024 * 1024;

function serializedPayloadSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function getSyncDeviceId(): string {
  let deviceId = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
  }
  return deviceId;
}

function getKnownRemoteVersion(id: string): number {
  try {
    const values = JSON.parse(localStorage.getItem(KNOWN_REMOTE_VERSIONS_STORAGE_KEY) || "{}") as Record<string, number>;
    return Number.isFinite(values[id]) ? values[id] : 0;
  } catch {
    return 0;
  }
}

/** Records a remote version so a later local mutation can never move backwards. */
export function rememberRemoteLogicalVersion(id: string, version: number): void {
  try {
    const values = JSON.parse(localStorage.getItem(KNOWN_REMOTE_VERSIONS_STORAGE_KEY) || "{}") as Record<string, number>;
    values[id] = Math.max(values[id] || 0, version);
    localStorage.setItem(KNOWN_REMOTE_VERSIONS_STORAGE_KEY, JSON.stringify(values));
  } catch {
    // Sync correctness still has metadata conflict resolution if this small cache cannot be written.
  }
}

function nextLogicalVersion(id: string, localVersion = 0): number {
  return Math.max(Date.now(), localVersion + 1, getKnownRemoteVersion(id) + 1);
}

/**
 * Computes a fast synchronous 64-bit hash of the resume data content.
 */
export function computeResumeHash(
  markdown: string,
  styles: AppStyles,
  name: string,
  template: ResumeTemplate
): string {
  const content = markdown + JSON.stringify(styles) + name + template;
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < content.length; i++) {
    const ch = content.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334903);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}

/**
 * Returns the index list of saved resumes (metadata only).
 */
export function getSavedResumesList(): ResumeMetadata[] {
  try {
    const dataStr = localStorage.getItem(LIST_STORAGE_KEY);
    if (!dataStr) return [];
    const list = JSON.parse(dataStr) as ResumeMetadata[];
    
    let listChanged = false;
    const validatedList = list.map((item) => {
      // Generatively assign a constant id for any legacy local saves lacking one
      if (!item.id) {
        item.id = Math.random().toString(36).substring(2, 11);
        listChanged = true;
      }
      return item;
    });

    if (listChanged) {
      localStorage.setItem(LIST_STORAGE_KEY, JSON.stringify(validatedList));
    }

    return validatedList;
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
    
    const existingSlot = list.find((item) => item.id === id);
    const old_timestamp = existingSlot ? existingSlot.timestamp : 0;
    
    // Local Save Time-Skew Protection LWW
    const logicalVersion = nextLogicalVersion(id, existingSlot?.logicalVersion ?? old_timestamp);
    const timestamp = logicalVersion;
    const hash = computeResumeHash(markdown, styles, name, template);

    const resumeData: ResumeData = {
      id,
      name,
      markdown,
      styles,
      template,
      timestamp,
      fileName,
    };

    if (serializedPayloadSize(resumeData) > MAX_RESUME_PAYLOAD_BYTES) {
      return { success: false, error: "Resume data exceeds the 1 MiB sync limit." };
    }

    // Serialize slot data
    const serializedData = JSON.stringify(resumeData);
    
    // Save individual slot data in localStorage
    localStorage.setItem(`saved_resume_slot_${id}`, serializedData);

    // Update master list
    const updatedList = list.filter((item) => item.id !== id);
    updatedList.push({
      id,
      name,
      template,
      timestamp,
      hash,
      deleted: false,
      logicalVersion,
      writerDeviceId: getSyncDeviceId(),
    });

    localStorage.setItem(LIST_STORAGE_KEY, JSON.stringify(updatedList));
    window.dispatchEvent(new CustomEvent("local_resume_saved", { detail: { id } }));
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
    const data = JSON.parse(dataStr) as ResumeData;
    
    // Generatively assign a constant id for any legacy local saves lacking one during load
    if (!data.id) {
      data.id = id;
      try {
        localStorage.setItem(`saved_resume_slot_${id}`, JSON.stringify(data));
      } catch (e) {
        console.error("Failed to write back fixed legacy ID to slot:", e);
      }
    }
    return data;
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
    // Delete slot data payload
    localStorage.removeItem(`saved_resume_slot_${id}`);

    // Update master list with a tombstone to propagate deletion to remote
    const list = getSavedResumesList();
    const existing = list.find((item) => item.id === id);
    const old_timestamp = existing ? existing.timestamp : 0;
    const logicalVersion = nextLogicalVersion(id, existing?.logicalVersion ?? old_timestamp);
    const timestamp = logicalVersion;

    const updatedList = list.filter((item) => item.id !== id);
    updatedList.push({
      id,
      name: existing?.name || "",
      template: existing?.template || "classic",
      timestamp,
      deleted: true,
      logicalVersion,
      writerDeviceId: getSyncDeviceId(),
    });
    
    localStorage.setItem(LIST_STORAGE_KEY, JSON.stringify(updatedList));
    window.dispatchEvent(new CustomEvent("local_resume_deleted", { detail: { id } }));
  } catch (err) {
    console.error(`Failed to delete resume slot ${id} from localStorage:`, err);
  }
}
