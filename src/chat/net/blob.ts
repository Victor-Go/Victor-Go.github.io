import { ApiError } from "./api";

/** What `POST /files` hands out for the upload (protocol 2). */
export interface UploadTarget {
  url: string;
  method: string;
  headers: Record<string, string>;
}

const BLOB_TIMEOUT_MS = 60_000;
/** The browser sets these itself (from the body) and refuses to be told; the value it computes is the one the server signed. */
const SET_BY_BROWSER = new Set(["content-length", "host"]);

async function transfer(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BLOB_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", signal: controller.signal });
  } catch {
    throw new ApiError(0, controller.signal.aborted ? "timeout" : "network");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sends the raw ciphertext bytes to the storage with exactly the method and headers the server signed. No session token goes along: the address
 * itself is the permission. A refusal from the storage is never reported as the API's "forbidden" (that code means voice is switched off).
 */
export async function uploadBytes(target: UploadTarget, bytes: Uint8Array): Promise<void> {
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(target.headers)) if (!SET_BY_BROWSER.has(k.toLowerCase())) headers[k] = v;
  const res = await transfer(target.url, { method: target.method, headers, body: bytes as BodyInit });
  if (!res.ok) throw new ApiError(res.status, res.status === 404 ? "not_found" : "internal");
}

/** Fetches raw bytes from a short-lived download address. 404 (never uploaded, or gone) is `not_found`. */
export async function downloadBytes(url: string): Promise<Uint8Array> {
  const res = await transfer(url, { method: "GET" });
  if (!res.ok) throw new ApiError(res.status, res.status === 404 ? "not_found" : "internal");
  return new Uint8Array(await res.arrayBuffer());
}
