import { getSavedResumesList, loadResumeSlot, computeResumeHash, getSyncDeviceId, rememberRemoteLogicalVersion, MAX_RESUME_PAYLOAD_BYTES } from "./cookies";
import type { ResumeMetadata } from "./cookies";
import { extraTranslations } from "./translations";

const CLIENT_ID = "1041273826872-lle6e1t5mveujtm900eeoldjtkhn1v04.apps.googleusercontent.com";
const LIST_STORAGE_KEY = "saved_resumes_master_list";
const SYNC_TIMEOUT_ERROR = "SYNC_TIMEOUT";
const ACCESS_TOKEN_STORAGE_KEY = "gdrive_access_token";
const ACCESS_TOKEN_EXPIRY_STORAGE_KEY = "gdrive_access_token_expires_at";
const LAST_SYNC_STORAGE_KEY = "gdrive_last_successful_sync_at";
const REAUTH_REQUIRED_STORAGE_KEY = "gdrive_reauth_required";
const TOKEN_EXPIRY_BUFFER_SECONDS = 5 * 60;
const TOKEN_SILENT_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const METADATA_RECHECK_AFTER_MS = 3 * 60 * 1000;
export const GOOGLE_DRIVE_SYNC_INTERVAL_MS = 30 * 60 * 1000;
const PAYLOAD_RETENTION_MS = 31 * 24 * 60 * 60 * 1000;

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
  /** Optional fields keep existing Drive backups readable during migration. */
  logicalVersion?: number;
  writerDeviceId?: string;
  payloadFile?: string;
}

interface RemoteFile {
  id: string;
  name: string;
  modifiedTime?: string;
  appProperties?: Record<string, string>;
}

interface RemoteMetadataDocument {
  records: RemoteResumeMetadata[];
  invalid: boolean;
}

// Global state/listeners for sync status
export type SyncStatusType = "completed" | "syncing" | "retrying" | "reauth_required" | "failed" | "disconnected";
const hasExpiredCachedToken = () => {
  const expiry = Number(localStorage.getItem(ACCESS_TOKEN_EXPIRY_STORAGE_KEY));
  return !Number.isFinite(expiry) || Date.now() >= expiry - TOKEN_EXPIRY_BUFFER_SECONDS * 1000;
};
let currentSyncStatus: SyncStatusType = localStorage.getItem("gdrive_sync_connected") !== "true"
  ? "disconnected"
  : localStorage.getItem(REAUTH_REQUIRED_STORAGE_KEY) === "true" || hasExpiredCachedToken()
    ? "reauth_required"
    : "completed";
const listeners: ((status: SyncStatusType) => void)[] = [];
let syncWatchdog: ReturnType<typeof setTimeout> | null = null;
let currentSyncError: string | null = null;
let syncAbortController: AbortController | null = null;
let activeSyncPromise: Promise<SyncResult> | null = null;
let syncQueuedAfterMutation = false;
let tokenRefreshTimer: ReturnType<typeof setInterval> | null = null;

export function getSyncStatus(): SyncStatusType {
  return currentSyncStatus;
}

export function getLastSuccessfulSyncAt(): number | null {
  const storedTimestamp = Number(localStorage.getItem(LAST_SYNC_STORAGE_KEY));
  return Number.isFinite(storedTimestamp) && storedTimestamp > 0 ? storedTimestamp : null;
}

export function shouldSyncGoogleDrive(now = Date.now()): boolean {
  const lastSyncAt = getLastSuccessfulSyncAt();
  return lastSyncAt === null || now - lastSyncAt >= GOOGLE_DRIVE_SYNC_INTERVAL_MS;
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
let activeTokenPrompt: "none" | "consent" | null = null;

function isSyncConnected(): boolean {
  return localStorage.getItem("gdrive_sync_connected") === "true";
}

function clearCachedAccessToken() {
  accessToken = null;
  accessTokenExpiresAt = 0;
  localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  localStorage.removeItem(ACCESS_TOKEN_EXPIRY_STORAGE_KEY);
}

function requireReauthorization() {
  clearCachedAccessToken();
  localStorage.setItem(REAUTH_REQUIRED_STORAGE_KEY, "true");
  if (tokenRefreshTimer) {
    clearInterval(tokenRefreshTimer);
    tokenRefreshTimer = null;
  }
  setSyncStatus("reauth_required");
}

function startTokenRefreshTimer() {
  if (tokenRefreshTimer) clearInterval(tokenRefreshTimer);
  tokenRefreshTimer = setInterval(() => {
    if (!isSyncConnected() || currentSyncStatus === "reauth_required") return;
    void refreshAccessTokenSilently().catch(() => requireReauthorization());
  }, TOKEN_SILENT_REFRESH_INTERVAL_MS);
}

function cacheAccessToken(token: string, expiresIn?: number) {
  accessToken = token;
  accessTokenExpiresAt = Date.now() + Math.max(0, expiresIn ?? 3600) * 1000;
  localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
  localStorage.setItem(ACCESS_TOKEN_EXPIRY_STORAGE_KEY, String(accessTokenExpiresAt));
  localStorage.setItem("gdrive_sync_connected", "true");
  localStorage.removeItem(REAUTH_REQUIRED_STORAGE_KEY);
  startTokenRefreshTimer();
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

async function requestToken(prompt: "none" | "consent"): Promise<string> {
  if (activeTokenRequest) {
    if (prompt === "consent" && activeTokenPrompt === "none") {
      try {
        await activeTokenRequest;
      } catch {
        // A user-initiated authorization replaces a failed silent request.
      }
      return requestToken("consent");
    }
    return activeTokenRequest;
  }

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

  activeTokenPrompt = prompt;
  activeTokenRequest = request.finally(() => {
    activeTokenRequest = null;
    activeTokenPrompt = null;
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

if (currentSyncStatus === "completed") startTokenRefreshTimer();

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

  if (isSyncConnected() && currentSyncStatus === "completed") {
    // Background sync only makes a non-interactive token request. A failure
    // switches the UI to explicit reauthorization rather than opening a dialog.
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
  localStorage.removeItem(REAUTH_REQUIRED_STORAGE_KEY);
  if (tokenRefreshTimer) {
    clearInterval(tokenRefreshTimer);
    tokenRefreshTimer = null;
  }
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

async function listAllRemoteFiles(): Promise<RemoteFile[]> {
  const files: RemoteFile[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      spaces: "appDataFolder",
      pageSize: "1000",
      fields: "nextPageToken,files(id,name,modifiedTime,appProperties)",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await apiFetch(`https://www.googleapis.com/drive/v3/files?${params}`);
    if (!res.ok) throw new Error("Failed to list files in appDataFolder");
    const page = await res.json() as { files?: RemoteFile[]; nextPageToken?: string };
    files.push(...(page.files || []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return files;
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

function versionOf(record: Pick<RemoteResumeMetadata, "timestamp" | "logicalVersion">): number {
  return record.logicalVersion ?? record.timestamp;
}

function payloadFileName(record: RemoteResumeMetadata): string {
  return record.payloadFile || `resume_${record.id}.json`;
}

function createPayloadFileName(id: string, version: number, deviceId: string, hash: string): string {
  return `resume_${id}_${version}_${deviceId}_${hash}.json`;
}

/** Returns positive when local is the deterministic winner. Legacy equal versions retain cloud priority. */
function compareLocalToRemote(local: ResumeMetadata, remote: RemoteResumeMetadata): number {
  const localVersion = versionOf(local);
  const remoteVersion = versionOf(remote);
  if (localVersion !== remoteVersion) return localVersion - remoteVersion;
  if (!local.writerDeviceId || !remote.writerDeviceId) return -1;
  return local.writerDeviceId.localeCompare(remote.writerDeviceId);
}

async function getFileContent(fileId: string): Promise<any> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const res = await apiFetch(url);
  if (!res.ok) throw new Error(`Failed to get file ${fileId}`);
  return res.json();
}

async function getMetadataDocument(fileId: string): Promise<RemoteMetadataDocument> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const res = await apiFetch(url);
  if (!res.ok) throw new Error(`Failed to get file ${fileId}`);
  const text = await res.text();
  try {
    const records = JSON.parse(text);
    if (isRemoteMetadataList(records)) {
      return { records, invalid: false };
    }
  } catch {
    // Invalid metadata is deliberately treated as an uncommitted empty Drive.
  }
  return { records: [], invalid: true };
}

async function createRemoteFile(name: string, content: any, appProperties?: Record<string, string>): Promise<string> {
  const boundary = `resume-sync-${crypto.randomUUID()}`;
  const metadata = JSON.stringify({
    name,
    parents: ["appDataFolder"],
    ...(appProperties ? { appProperties } : {}),
  });
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    metadata,
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(content),
    `--${boundary}--`,
    "",
  ].join("\r\n");
  const res = await apiFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    headers: {
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) throw new Error(`Failed to create remote file ${name}`);
  const file = await res.json();
  return file.id;
}

function assertPayloadSize(payload: unknown): void {
  if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > MAX_RESUME_PAYLOAD_BYTES) {
    throw new Error("PAYLOAD_TOO_LARGE");
  }
}

function payloadHash(payload: { markdown: string; styles: any; name: string; template: any }): string {
  return computeResumeHash(payload.markdown, payload.styles, payload.name, payload.template);
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

    // Background refresh may only use prompt="none". If it cannot obtain a
    // token, wait for the user to explicitly authorize and sync again.
    try {
      await refreshAccessTokenSilently();
    } catch (error) {
      requireReauthorization();
      terminalStatus = "reauth_required";
      throw error;
    }

    // 1. Fetch remote sync_metadata.json
    const metadataFiles = (await findRemoteFiles("sync_metadata.json"))
      .sort((a, b) => getModifiedTime(b) - getModifiedTime(a));
    let metadataFileId = metadataFiles[0]?.id ?? null;
    const duplicateFileIds = new Set(metadataFiles.slice(1).map((file) => file.id));
    const mergedMetadataMap = new Map<string, RemoteResumeMetadata>();
    let metadataNeedsCommit = metadataFileId === null || metadataFiles.length > 1;

    // Migrate legacy duplicate metadata files. The latest logical resume
    // timestamp wins; exact ties use the most recently modified metadata file.
    for (const metadataFile of metadataFiles) {
      const document = await getMetadataDocument(metadataFile.id);
      if (document.invalid) metadataNeedsCommit = true;
      document.records.forEach((item) => {
        const existing = mergedMetadataMap.get(item.id);
        if (!existing || versionOf(item) > versionOf(existing)) {
          mergedMetadataMap.set(item.id, item);
        }
      });
    }

    // 2. Read local list (including tombstoned deletes)
    const localList = getSavedResumesList();

    // Map files on remote to avoid querying file names/IDs in a loop
    const remoteFileList = await listAllRemoteFiles();
    const fileList = { files: remoteFileList };
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
    let firstPayloadUploadedAt: number | null = null;

    for (const id of allIds) {
      const localItem = localMetadataMap.get(id);
      const remoteItem = mergedMetadataMap.get(id);

      if (localItem && (!remoteItem || compareLocalToRemote(localItem, remoteItem) > 0)) {
        // A local winner writes an immutable payload before metadata references it.
        metadataNeedsCommit = true;
        if (localItem.deleted) {
          mergedMetadataMap.set(id, {
            id,
            hash: "",
            timestamp: versionOf(localItem),
            logicalVersion: versionOf(localItem),
            writerDeviceId: localItem.writerDeviceId || getSyncDeviceId(),
            name: localItem.name,
            deleted: true,
          });
        } else {
          const localData = loadResumeSlot(id);
          if (!localData) {
            throw new Error(`Local resume payload is missing for ${id}`);
          }
          const computedHash = localItem.hash || computeResumeHash(
            localData.markdown,
            localData.styles,
            localData.name,
            localData.template
          );
          assertPayloadSize(localData);
          const version = versionOf(localItem);
          const writerDeviceId = localItem.writerDeviceId || getSyncDeviceId();
          const fileName = createPayloadFileName(id, version, writerDeviceId, computedHash);
          const existingFileId = remoteFilesByName[fileName];
          if (existingFileId) {
            const existingPayload = await getFileContent(existingFileId);
            if (payloadHash(existingPayload) !== computedHash) {
              await updateRemoteFileContent(existingFileId, localData);
              firstPayloadUploadedAt ??= Date.now();
            }
          } else {
            await createRemoteFile(fileName, localData, {
              resumeId: id,
              contentHash: computedHash,
              logicalVersion: String(version),
              writerDeviceId,
            });
            firstPayloadUploadedAt ??= Date.now();
          }
          mergedMetadataMap.set(id, {
            id,
            hash: computedHash,
            timestamp: version,
            logicalVersion: version,
            writerDeviceId,
            name: localItem.name,
            payloadFile: fileName,
            deleted: false,
          });
        }
      } else if (remoteItem) {
        // Remote is newer, remote-only, or the deterministic winner of a tie.
        if (remoteItem.deleted) {
          // Do not overwrite a save/delete that arrived after this sync snapshot.
          const latest = getSavedResumesList().find((item) => item.id === id);
          if (localItem && latest && versionOf(latest) !== versionOf(localItem)) {
            syncQueuedAfterMutation = true;
            continue;
          }
          localStorage.removeItem(`saved_resume_slot_${id}`);
          if (!localItem || !localItem.deleted) {
            const list = getSavedResumesList();
            const updated = list.filter((x) => x.id !== id);
            updated.push({
              id,
              name: remoteItem.name,
              template: "classic",
              timestamp: versionOf(remoteItem),
              deleted: true,
              logicalVersion: versionOf(remoteItem),
              writerDeviceId: remoteItem.writerDeviceId,
            });
            localStorage.setItem(LIST_STORAGE_KEY, JSON.stringify(updated));
            rememberRemoteLogicalVersion(id, versionOf(remoteItem));
            localMasterListUpdated = true;
          }
        } else {
          // Skip payload transfer when the local copy already has the same hash.
          if (localItem && !localItem.deleted && localItem.hash === remoteItem.hash && loadResumeSlot(id)) {
            assertPayloadSize(loadResumeSlot(id));
            if (versionOf(localItem) !== versionOf(remoteItem) || localItem.writerDeviceId !== remoteItem.writerDeviceId) {
              const list = getSavedResumesList();
              const updated = list.filter((item) => item.id !== id);
              updated.push({
                ...localItem,
                name: remoteItem.name,
                timestamp: versionOf(remoteItem),
                logicalVersion: versionOf(remoteItem),
                writerDeviceId: remoteItem.writerDeviceId,
                hash: remoteItem.hash,
                deleted: false,
              });
              localStorage.setItem(LIST_STORAGE_KEY, JSON.stringify(updated));
              localMasterListUpdated = true;
            }
            rememberRemoteLogicalVersion(id, versionOf(remoteItem));
            continue;
          }
          const fileName = payloadFileName(remoteItem);
          const rFileId = remoteFilesByName[fileName];
          if (!rFileId) {
            throw new Error(`Remote resume payload is missing for ${id}`);
          }
          const remotePayload = await getFileContent(rFileId);
          assertPayloadSize(remotePayload);
          const latest = getSavedResumesList().find((item) => item.id === id);
          if (localItem && latest && versionOf(latest) !== versionOf(localItem)) {
            syncQueuedAfterMutation = true;
            continue;
          }
          // Save slot to local
          localStorage.setItem(`saved_resume_slot_${id}`, JSON.stringify(remotePayload));

          // Update local master list
          const list = getSavedResumesList();
          const updated = list.filter((x) => x.id !== id);
          updated.push({
            id,
            name: remoteItem.name,
            template: remotePayload.template || "classic",
            timestamp: versionOf(remoteItem),
            hash: remoteItem.hash,
            deleted: false,
            logicalVersion: versionOf(remoteItem),
            writerDeviceId: remoteItem.writerDeviceId,
          });
          localStorage.setItem(LIST_STORAGE_KEY, JSON.stringify(updated));
          rememberRemoteLogicalVersion(id, versionOf(remoteItem));
          localMasterListUpdated = true;
        }
      }
    }

    // Do not commit an older snapshot over a local mutation that happened while
    // its payload request was in flight. The queued pass will start fresh.
    const latestLocalMap = new Map(getSavedResumesList().map((item) => [item.id, item]));
    for (const [id, original] of localMetadataMap) {
      const latest = latestLocalMap.get(id);
      if (latest && versionOf(latest) !== versionOf(original)) {
        syncQueuedAfterMutation = true;
        result = { success: true };
        terminalStatus = "completed";
        return result;
      }
    }

    // A long payload transfer may have allowed another device to update the
    // shared metadata. Re-read and merge before writing in that case.
    if (firstPayloadUploadedAt && Date.now() - firstPayloadUploadedAt >= METADATA_RECHECK_AFTER_MS) {
      const freshMetadataFiles = (await findRemoteFiles("sync_metadata.json"))
        .sort((a, b) => getModifiedTime(b) - getModifiedTime(a));
      metadataFileId = freshMetadataFiles[0]?.id ?? metadataFileId;
      freshMetadataFiles.slice(1).forEach((file) => duplicateFileIds.add(file.id));
      for (const metadataFile of freshMetadataFiles) {
        const document = await getMetadataDocument(metadataFile.id);
        if (document.invalid) continue;
        document.records.forEach((item) => {
          const existing = mergedMetadataMap.get(item.id);
          if (!existing || versionOf(item) > versionOf(existing)) {
            mergedMetadataMap.set(item.id, item);
          }
        });
      }
    }

    // 3. Commit the resolved metadata without relying on Drive v2 ETags.
    const resolvedRemoteMetadata = Array.from(mergedMetadataMap.values());
    if (metadataFileId && metadataNeedsCommit) {
      await updateRemoteFileContent(metadataFileId, resolvedRemoteMetadata);
    } else if (!metadataFileId) {
      metadataFileId = await createRemoteFile("sync_metadata.json", resolvedRemoteMetadata);
    }

    // Only remove duplicates after the merged metadata has been persisted.
    // The canonical file is deliberately excluded even if the list response
    // ordered duplicate names differently from the metadata search response.
    duplicateFileIds.delete(metadataFileId);
    for (const duplicateFileId of duplicateFileIds) {
      await deleteRemoteFile(duplicateFileId);
    }

    // Retain orphaned immutable payloads for 31 days. Legacy payload names are
    // intentionally not collected so old backups remain readable.
    const referencedPayloads = new Set(resolvedRemoteMetadata.map(payloadFileName));
    const cleanupBefore = Date.now() - PAYLOAD_RETENTION_MS;
    for (const file of (fileList.files || []) as RemoteFile[]) {
      if (!file.name.startsWith("resume_") || referencedPayloads.has(file.name)) continue;
      if (!/^resume_.+_\d+_.+_[a-f0-9-]+_[a-f0-9]+\.json$/i.test(file.name)) continue;
      if (getModifiedTime(file) > 0 && getModifiedTime(file) < cleanupBefore) {
        await deleteRemoteFile(file.id);
      }
    }

    // Update local list if we fetched remote changes
    if (localMasterListUpdated) {
      // Dispatches state update in the UI if needed
      window.dispatchEvent(new Event("local_resumes_synced"));
    }

    result = { success: true };
    localStorage.setItem(LAST_SYNC_STORAGE_KEY, String(Date.now()));
    terminalStatus = "completed";
  } catch (err: any) {
    console.error("Google Drive sync failed:", err);
    const isInteractionRequired = err?.error === "interaction_required" || err?.error === "consent_required";
    const isUnauthorized = err?.message === "Unauthorized: Google Drive access token expired";
    if (isInteractionRequired || isUnauthorized) {
      requireReauthorization();
      terminalStatus = "reauth_required";
    }
    const error = err?.error || err?.message || "Sync failed";
    currentSyncError ??= error;
    result = { success: false, error: currentSyncError || error };
  } finally {
    if (syncAbortController === abortController) syncAbortController = null;
    if (currentSyncStatus !== "retrying") {
      setSyncStatus(result.success ? "completed" : terminalStatus);
    }
  }

  return result;
}
