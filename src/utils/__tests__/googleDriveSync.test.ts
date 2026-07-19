import { beforeEach, describe, expect, it, vi } from "vitest";

const validExpiry = () => String(Date.now() + 60 * 60 * 1000);

async function loadSyncModule() {
  vi.resetModules();
  (window as any).google = {
    accounts: {
      oauth2: {
        initTokenClient: vi.fn(),
      },
    },
  };
  return import("../googleDriveSync");
}

function connectWithValidToken() {
  localStorage.setItem("gdrive_sync_connected", "true");
  localStorage.setItem("gdrive_access_token", "token");
  localStorage.setItem("gdrive_access_token_expires_at", validExpiry());
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Google Drive synchronization", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("only requests an automatic sync when the last successful sync is stale", async () => {
    const { GOOGLE_DRIVE_SYNC_INTERVAL_MS, getLastSuccessfulSyncAt, shouldSyncGoogleDrive } =
      await loadSyncModule();
    const now = Date.now();

    expect(getLastSuccessfulSyncAt()).toBeNull();
    expect(shouldSyncGoogleDrive(now)).toBe(true);

    localStorage.setItem("gdrive_last_successful_sync_at", String(now));
    expect(getLastSuccessfulSyncAt()).toBe(now);
    expect(shouldSyncGoogleDrive(now + GOOGLE_DRIVE_SYNC_INTERVAL_MS - 1)).toBe(false);
    expect(shouldSyncGoogleDrive(now + GOOGLE_DRIVE_SYNC_INTERVAL_MS)).toBe(true);
  });

  it("shares one in-progress sync across concurrent callers", async () => {
    connectWithValidToken();
    let releaseFirstRequest!: () => void;
    const firstRequest = new Promise<Response>((resolve) => {
      releaseFirstRequest = () => resolve(jsonResponse({ files: [] }));
    });
    const fetchMock = vi.fn()
      .mockReturnValueOnce(firstRequest)
      .mockResolvedValueOnce(jsonResponse({ files: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: "resume-file" }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ id: "metadata-file" }))
      .mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    const { syncWithGoogleDrive } = await loadSyncModule();
    const firstSync = syncWithGoogleDrive();
    const secondSync = syncWithGoogleDrive();

    expect(secondSync).toBe(firstSync);
    releaseFirstRequest();
    await expect(firstSync).resolves.toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("fails without writing metadata when a remote resume payload cannot be read", async () => {
    connectWithValidToken();
    const remoteResume = {
      id: "remote-resume",
      hash: "hash",
      timestamp: Date.now(),
      name: "Remote resume",
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: "metadata-file", name: "sync_metadata.json" }] }))
      .mockResolvedValueOnce(jsonResponse([remoteResume]))
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: "resume-file", name: "resume_remote-resume.json" }] }))
      .mockResolvedValueOnce(jsonResponse({ error: "unavailable" }, 503));
    vi.stubGlobal("fetch", fetchMock);

    const { syncWithGoogleDrive } = await loadSyncModule();
    const result = await syncWithGoogleDrive();

    expect(result.success).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(localStorage.getItem("saved_resumes_master_list")).toBeNull();
  });

  it("uses the remote copy when versions have the same timestamp", async () => {
    connectWithValidToken();
    localStorage.setItem("saved_resumes_master_list", JSON.stringify([{
      id: "conflict",
      name: "Local resume",
      template: "classic",
      hash: "local-hash",
      timestamp: 20,
      deleted: false,
    }]));
    const remoteResume = {
      id: "conflict",
      hash: "remote-hash",
      timestamp: 20,
      name: "Remote resume",
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: "metadata-file", name: "sync_metadata.json" }] }))
      .mockResolvedValueOnce(jsonResponse([remoteResume]))
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: "resume-file", name: "resume_conflict.json" }] }))
      .mockResolvedValueOnce(jsonResponse({
        id: "conflict",
        name: "Remote resume",
        markdown: "# Remote",
        styles: {},
        template: "classic",
        timestamp: 20,
      }))
      .mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    const { syncWithGoogleDrive } = await loadSyncModule();
    const result = await syncWithGoogleDrive();

    expect(result).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(localStorage.getItem("saved_resume_slot_conflict")).toContain("# Remote");
  });

  it("merges duplicate metadata files before deleting the stale copy", async () => {
    connectWithValidToken();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ files: [
        { id: "metadata-old", name: "sync_metadata.json", modifiedTime: "2026-07-01T00:00:00Z" },
        { id: "metadata-new", name: "sync_metadata.json", modifiedTime: "2026-07-02T00:00:00Z" },
      ] }))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ files: [
        { id: "metadata-old", name: "sync_metadata.json", modifiedTime: "2026-07-01T00:00:00Z" },
        { id: "metadata-new", name: "sync_metadata.json", modifiedTime: "2026-07-02T00:00:00Z" },
      ] }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    const { syncWithGoogleDrive } = await loadSyncModule();
    await expect(syncWithGoogleDrive()).resolves.toEqual({ success: true });

    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(fetchMock.mock.calls[4][0]).toContain("metadata-new");
    expect(fetchMock.mock.calls[5][0]).toContain("metadata-old");
    expect(fetchMock.mock.calls[5][1]).toMatchObject({ method: "DELETE" });
  });
});
