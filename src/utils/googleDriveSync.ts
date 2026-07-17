import { getSavedResumesList, loadResumeSlot, computeResumeHash } from "./cookies";
import type { ResumeMetadata } from "./cookies";
import { extraTranslations } from "./translations";

const CLIENT_ID = "1041273826872-lle6e1t5mveujtm900eeoldjtkhn1v04.apps.googleusercontent.com";
const LIST_STORAGE_KEY = "saved_resumes_master_list";
const SYNC_TIMEOUT_ERROR = "SYNC_TIMEOUT";
const ACCESS_TOKEN_STORAGE_KEY = "gdrive_access_token";
const ACCESS_TOKEN_EXPIRY_STORAGE_KEY = "gdrive_access_token_expires_at";
const TOKEN_EXPIRY_BUFFER_SECONDS = 5 * 60;

export interface SyncResult {
  success: boolean;
  error?: string;
}

export interface RemoteResumeMetadata {
  id: string;
  hash: string;
  timestamp: number;
  name: string;
  deleted?: boolean;
}

interface RemoteFile {
  id: string;
  name: string;
  modifiedTime?: string;
}

// Global state/listeners for sync status
export type SyncStatusType = "completed" | "syncing" | "failed" | "disconnected";
let currentSyncStatus: SyncStatusType = localStorage.getItem("gdrive_sync_connected") === "true" ? "completed" : "disconnected";
const listeners: ((status: SyncStatusType) => void)[] = [];
let syncWatchdog: ReturnType<typeof setTimeout> | null = null;
let currentSyncError: string | null = null;
let syncAbortController: AbortController | null = null;
let activeSyncPromise: Promise<SyncResult> | null = null;
let syncQueuedAfterMutation = false;

export function getSyncStatus(): SyncStatusType {
  return currentSyncStatus;
}

export function getSyncErrorMessage(
  lang?: keyof typeof extraTranslations
): string | null {
  if (currentSyncError === SYNC_TIMEOUT_ERROR && lang) {
    return extraTranslations[lang].syncErrorTimeout;
  }
  return currentSyncError;
}

export function subscribeSyncStatus(listener: (status: SyncStatusType) => void) {
  listeners.push(listener);
  return () => {
    const idx = listeners.indexOf(listener);
    if (idx !== -1) listeners.splice(idx, 1);
  };
}

function setSyncStatus(status: SyncStatusType) {
  if (status !== "syncing" && syncWatchdog) {
    clearTimeout(syncWatchdog);
    syncWatchdog = null;
  }
  if (currentSyncStatus === status) return;
  currentSyncStatus = status;
  [...listeners].forEach((listener) => listener(status));
}

function startSyncWatchdog() {
  if (syncWatchdog) clearTimeout(syncWatchdog);
  syncWatchdog = setTimeout(() => {
    syncWatchdog = null;
    if (currentSyncStatus === "syncing") {
      currentSyncError = SYNC_TIMEOUT_ERROR;
      syncAbortController?.abort();
      rejectTokenPromise?.(new Error(SYNC_TIMEOUT_ERROR));
      setSyncStatus("failed");
    }
  }, 15_000);
}

// In-Memory Token management
let accessToken: string | null = null;
let accessTokenExpiresAt = 0;
let tokenClient: any = null;
let resolveTokenPromise: ((token: string | null) => void) | null = null;
let rejectTokenPromise: ((err: any) => void) | null = null;
let activeTokenRequest: Promise<string> | null = null;

function isSyncConnected(): boolean {
  return localStorage.getItem("gdrive_sync_connected") === "true";
}

function clearCachedAccessToken() {
  accessToken = null;
  accessTokenExpiresAt = 0;
  localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  localStorage.removeItem(ACCESS_TOKEN_EXPIRY_STORAGE_KEY);
}

function cacheAccessToken(token: string, expiresIn?: number) {
  accessToken = token;
  accessTokenExpiresAt = Date.now() + Math.max(0, expiresIn ?? 3600) * 1000;
  localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
  localStorage.setItem(ACCESS_TOKEN_EXPIRY_STORAGE_KEY, String(accessTokenExpiresAt));
  localStorage.setItem("gdrive_sync_connected", "true");
}

function initTokenClientIfNeeded() {
  if (tokenClient) return tokenClient;
  if (!isGoogleDriveSdkInitialized()) {
    return null;
  }
  tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: "https://www.googleapis.com/auth/drive.appdata",
    error_callback: (error: { type?: string; message?: string }) => {
      rejectTokenPromise?.(
        new Error(error.message || error.type || "Google authorization could not be started")
      );
    },
    callback: (tokenResponse: any) => {
      if (tokenResponse.error !== undefined) {
        if (rejectTokenPromise) {
          rejectTokenPromise(tokenResponse);
        }
      } else {
        cacheAccessToken(tokenResponse.access_token, tokenResponse.expires_in);
        if (resolveTokenPromise) {
          resolveTokenPromise(tokenResponse.access_token);
        }
      }
    },
  });
  return tokenClient;
}

function requestToken(prompt: "none" | "consent"): Promise<string> {
  if (activeTokenRequest) return activeTokenRequest;

  const request = new Promise<string>((resolve, reject) => {
    const client = initTokenClientIfNeeded();
    if (!client) {
      reject(new Error("Google Identity Services script not loaded."));
      return;
    }
    resolveTokenPromise = (token) => {
      if (token) resolve(token);
      else reject(new Error("No token returned"));
    };
    rejectTokenPromise = reject;
    try {
      client.requestAccessToken({ prompt });
    } catch (error) {
      reject(error);
    }
  });

  activeTokenRequest = request.finally(() => {
    activeTokenRequest = null;
    resolveTokenPromise = null;
    rejectTokenPromise = null;
  });
  return activeTokenRequest;
}

export function getAccessToken(): string | null {
  const isUsable = (expiresAt: number) =>
    Date.now() < expiresAt - TOKEN_EXPIRY_BUFFER_SECONDS * 1000;

  if (accessToken && isUsable(accessTokenExpiresAt)) return accessToken;

  const cachedToken = localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
  const cachedExpiry = Number(localStorage.getItem(ACCESS_TOKEN_EXPIRY_STORAGE_KEY));
  if (cachedToken && Number.isFinite(cachedExpiry) && isUsable(cachedExpiry)) {
    accessToken = cachedToken;
    accessTokenExpiresAt = cachedExpiry;
    return accessToken;
  }

  clearCachedAccessToken();
  return null;
}

async function refreshAccessTokenSilently(): Promise<string> {
  const validToken = getAccessToken();
  if (validToken) return validToken;

  return requestToken("none");
}

export function isGoogleDriveSdkInitialized(): boolean {
  if (typeof window === "undefined") return false;

  const google = (window as any).google;
  return Boolean(CLIENT_ID && google?.accounts?.oauth2?.initTokenClient);
}

function syncAfterLocalResumeMutation() {
  if (!isGoogleDriveSdkInitialized()) {
    return;
  }

  if (currentSyncStatus === "syncing") {
    syncQueuedAfterMutation = true;
    return;
  }

  if (isSyncConnected()) {
    // Background sync can only make a non-interactive token request. On
    // failure, it disconnects rather than opening an authorization dialog.
    void syncWithGoogleDrive();
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("local_resume_saved", syncAfterLocalResumeMutation);
  window.addEventListener("local_resume_deleted", syncAfterLocalResumeMutation);
}

export function handleOAuthCallback() {
  // Silent refresh / GIS manages callbacks internally via popups, redirect parameters are unused
  return false;
}

export async function loginToGDrive() {
  currentSyncError = null;
  setSyncStatus("syncing");
  startSyncWatchdog();
  try {
    const token = await requestToken("consent");
    if (token) {
      await syncWithGoogleDrive();
    }
  } catch (err) {
    console.error("Manual login failed:", err);
    currentSyncError ??= err instanceof Error ? err.message : "Google Drive login failed";
    setSyncStatus("failed");
  } finally {
    if (currentSyncStatus === "syncing") setSyncStatus("failed");
  }
}

export function logoutFromGDrive() {
  clearCachedAccessToken();
  localStorage.removeItem("gdrive_sync_connected");
  setSyncStatus("disconnected");
}

// Native Fetch helpers for Google Drive API
async function apiFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getAccessToken();
  if (!token) throw new Error("No Google Drive access token found");

  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(url, {
    ...options,
    headers,
    signal: options.signal ?? syncAbortController?.signal,
  });
  if (response.status === 401) {
    clearCachedAccessToken();
    throw new Error("Unauthorized: Google Drive access token expired");
  }
  return response;
}

async function findRemoteFiles(name: string): Promise<RemoteFile[]> {
  const q = `name='${name}'`;
  const url = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${encodeURIComponent(
    q
  )}&fields=files(id,name,modifiedTime)`;
  const res = await apiFetch(url);
  if (!res.ok) throw new Error(`Failed to find remote file ${name}`);
  const data = await res.json();
  return data.files || [];
}

function isRemoteMetadataList(value: unknown): value is RemoteResumeMetadata[] {
  return Array.isArray(value) && value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const metadata = item as RemoteResumeMetadata;
    return typeof metadata.id === "string"
      && typeof metadata.hash === "string"
      && typeof metadata.timestamp === "number"
      && typeof metadata.name === "string";
  });
}

function getModifiedTime(file: RemoteFile): number {
  const time = file.modifiedTime ? Date.parse(file.modifiedTime) : 0;
  return Number.isFinite(time) ? time : 0;
}

async function getFileContent(fileId: string): Promise<any> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const res = await apiFetch(url);
  if (!res.ok) throw new Error(`Failed to get file ${fileId}`);
  return res.json();
}

async function createRemoteFile(name: string, content: any): Promise<string> {
  // 1. Create file metadata
  const metadataUrl = "https://www.googleapis.com/drive/v3/files";
  const metaRes = await apiFetch(metadataUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      parents: ["appDataFolder"],
    }),
  });
  if (!metaRes.ok) throw new Error(`Failed to create remote file metadata for ${name}`);
  const meta = await metaRes.json();
  const fileId = meta.id;

  // 2. Upload file content
  await updateRemoteFileContent(fileId, content);
  return fileId;
}

async function updateRemoteFileContent(fileId: string, content: any): Promise<void> {
  const uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
  const res = await apiFetch(uploadUrl, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(content),
  });
  if (!res.ok) throw new Error(`Failed to update remote file content for ${fileId}`);
}

async function deleteRemoteFile(fileId: string): Promise<void> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}`;
  const res = await apiFetch(url, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete remote file ${fileId}`);
  }
}

// A single shared sync prevents lifecycle, network, and local-change events
// from racing to create or overwrite the same Drive files.
export function syncWithGoogleDrive(): Promise<SyncResult> {
  if (activeSyncPromise) return activeSyncPromise;

  const syncPromise = performGoogleDriveSync();
  activeSyncPromise = syncPromise;
  void syncPromise.finally(() => {
    if (activeSyncPromise === syncPromise) activeSyncPromise = null;
    if (syncQueuedAfterMutation && isSyncConnected() && isGoogleDriveSdkInitialized()) {
      syncQueuedAfterMutation = false;
      void syncWithGoogleDrive();
    }
  });
  return syncPromise;
}

// Main sync engine function
async function performGoogleDriveSync(): Promise<SyncResult> {
  let result: SyncResult = { success: false, error: "Sync failed" };
  let terminalStatus: SyncStatusType = "failed";
  const abortController = new AbortController();

  try {
    if (!isSyncConnected()) {
      terminalStatus = "disconnected";
      throw new Error("Not logged in");
    }

    currentSyncError = null;
    syncAbortController = abortController;
    setSyncStatus("syncing");
    startSyncWatchdog();

    // Background refresh may only use prompt="none", which never displays an
    // OAuth screen. If it cannot obtain a token, disconnect instead of falling
    // back to an interactive flow.
    try {
      await refreshAccessTokenSilently();
    } catch (error) {
      clearCachedAccessToken();
      localStorage.removeItem("gdrive_sync_connected");
      terminalStatus = "disconnected";
      throw error;
    }

    // 1. Fetch remote sync_metadata.json
    const metadataFiles = (await findRemoteFiles("sync_metadata.json"))
      .sort((a, b) => getModifiedTime(b) - getModifiedTime(a));
    let metadataFileId = metadataFiles[0]?.id ?? null;
    const duplicateFileIds = new Set(metadataFiles.slice(1).map((file) => file.id));
    const mergedMetadataMap = new Map<string, RemoteResumeMetadata>();

    // Migrate legacy duplicate metadata files. The latest logical resume
    // timestamp wins; exact ties use the most recently modified metadata file.
    for (const metadataFile of metadataFiles) {
      const remoteMetadata = await getFileContent(metadataFile.id);
      if (!isRemoteMetadataList(remoteMetadata)) {
        throw new Error("Remote sync metadata is invalid; sync was stopped to protect backup data");
      }
      remoteMetadata.forEach((item) => {
        const existing = mergedMetadataMap.get(item.id);
        if (!existing || item.timestamp > existing.timestamp) {
          mergedMetadataMap.set(item.id, item);
        }
      });
    }

    // 2. Read local list (including tombstoned deletes)
    const localList = getSavedResumesList();

    // Map files on remote to avoid querying file names/IDs in a loop
    const remoteFileListUrl = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&pageSize=1000&fields=files(id,name,modifiedTime)`;
    const fileListRes = await apiFetch(remoteFileListUrl);
    if (!fileListRes.ok) throw new Error("Failed to list files in appDataFolder");
    const fileList = await fileListRes.json();
    const remoteFilesByName: Record<string, string> = {};
    if (fileList.files) {
      const filesByName = new Map<string, RemoteFile>();
      (fileList.files as RemoteFile[]).forEach((file) => {
        const existing = filesByName.get(file.name);
        if (!existing || getModifiedTime(file) > getModifiedTime(existing)) {
          if (existing) duplicateFileIds.add(existing.id);
          filesByName.set(file.name, file);
        } else {
          duplicateFileIds.add(file.id);
        }
      });
      filesByName.forEach((file, name) => {
        remoteFilesByName[name] = file.id;
      });
    }

    const localMetadataMap = new Map<string, ResumeMetadata>();
    localList.forEach((item) => {
      localMetadataMap.set(item.id, item);
    });

    // We will build a unified set of IDs to resolve
    const allIds = new Set([...mergedMetadataMap.keys(), ...localMetadataMap.keys()]);

    let localMasterListUpdated = false;

    for (const id of allIds) {
      const localItem = localMetadataMap.get(id);
      const remoteItem = mergedMetadataMap.get(id);

      if (localItem && (!remoteItem || localItem.timestamp > remoteItem.timestamp)) {
        // Local is newer or Local only
        if (localItem.deleted) {
          // Local deleted: delete remote file if exists, update remote metadata
          const fileName = `resume_${id}.json`;
          const rFileId = remoteFilesByName[fileName];
          if (rFileId) {
            await deleteRemoteFile(rFileId);
          }
          mergedMetadataMap.set(id, {
            id,
            hash: "",
            timestamp: localItem.timestamp,
            name: localItem.name,
            deleted: true,
          });
        } else {
          // Local is active: upload to remote
          const localData = loadResumeSlot(id);
          if (!localData) {
            throw new Error(`Local resume payload is missing for ${id}`);
          }
          const fileName = `resume_${id}.json`;
          const rFileId = remoteFilesByName[fileName];
          if (rFileId) {
            await updateRemoteFileContent(rFileId, localData);
          } else {
            await createRemoteFile(fileName, localData);
          }
          // Add or update in remote metadata
          const computedHash = localItem.hash || computeResumeHash(
            localData.markdown,
            localData.styles,
            localData.name,
            localData.template
          );
          mergedMetadataMap.set(id, {
            id,
            hash: computedHash,
            timestamp: localItem.timestamp,
            name: localItem.name,
            deleted: false,
          });
        }
      } else if (remoteItem && (!localItem || remoteItem.timestamp >= localItem.timestamp)) {
        // Remote is newer, remote-only, or the deterministic winner of a tie.
        if (remoteItem.deleted) {
          // Remote deleted: delete local
          // Delete slot payload
          localStorage.removeItem(`saved_resume_slot_${id}`);
          // Put tombstone in local metadata list if not already tombstoned
          if (!localItem || !localItem.deleted) {
            const list = getSavedResumesList();
            const updated = list.filter((x) => x.id !== id);
            updated.push({
              id,
              name: remoteItem.name,
              template: "classic",
              timestamp: remoteItem.timestamp,
              deleted: true,
            });
            localStorage.setItem(LIST_STORAGE_KEY, JSON.stringify(updated));
            localMasterListUpdated = true;
          }
        } else {
          // Remote is active: download payload to local
          const fileName = `resume_${id}.json`;
          const rFileId = remoteFilesByName[fileName];
          if (!rFileId) {
            throw new Error(`Remote resume payload is missing for ${id}`);
          }
          const remotePayload = await getFileContent(rFileId);
          // Save slot to local
          localStorage.setItem(`saved_resume_slot_${id}`, JSON.stringify(remotePayload));

          // Update local master list
          const list = getSavedResumesList();
          const updated = list.filter((x) => x.id !== id);
          updated.push({
            id,
            name: remoteItem.name,
            template: remotePayload.template || "classic",
            timestamp: remoteItem.timestamp,
            hash: remoteItem.hash,
            deleted: false,
          });
          localStorage.setItem(LIST_STORAGE_KEY, JSON.stringify(updated));
          localMasterListUpdated = true;
        }
      }
    }

    // 3. Upload resolved sync_metadata.json back to Google Drive
    const resolvedRemoteMetadata = Array.from(mergedMetadataMap.values());
    if (metadataFileId) {
      await updateRemoteFileContent(metadataFileId, resolvedRemoteMetadata);
    } else {
      metadataFileId = await createRemoteFile("sync_metadata.json", resolvedRemoteMetadata);
    }

    // Only remove duplicates after the merged metadata has been persisted.
    // The canonical file is deliberately excluded even if the list response
    // ordered duplicate names differently from the metadata search response.
    duplicateFileIds.delete(metadataFileId);
    for (const duplicateFileId of duplicateFileIds) {
      await deleteRemoteFile(duplicateFileId);
    }

    // Update local list if we fetched remote changes
    if (localMasterListUpdated) {
      // Dispatches state update in the UI if needed
      window.dispatchEvent(new Event("local_resumes_synced"));
    }

    result = { success: true };
    terminalStatus = "completed";
  } catch (err: any) {
    console.error("Google Drive sync failed:", err);
    const isInteractionRequired = err?.error === "interaction_required" || err?.error === "consent_required";
    const isUnauthorized = err?.message === "Unauthorized: Google Drive access token expired";
    if (isInteractionRequired || isUnauthorized) {
      clearCachedAccessToken();
      localStorage.removeItem("gdrive_sync_connected");
      terminalStatus = "disconnected";
    }
    const error = err?.error || err?.message || "Sync failed";
    currentSyncError ??= error;
    result = { success: false, error: currentSyncError || error };
  } finally {
    if (syncAbortController === abortController) syncAbortController = null;
    setSyncStatus(result.success ? "completed" : terminalStatus);
  }

  return result;
}
