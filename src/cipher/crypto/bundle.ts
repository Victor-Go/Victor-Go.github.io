import { CipherError } from "./encoding";
import { BUNDLE_TYPE, previewKind, safeFileName } from "./file";
import { MAX_ZIP_ENTRIES, makeZip, readZip } from "./zip";

/*
 * Several files are packed into one stored ZIP, and that ZIP is what gets encrypted as a single
 * .efile. The encrypted metadata marks it with BUNDLE_TYPE so a decrypted zip the user encrypted
 * on purpose is not unpacked. Older versions that don't know the marker hand back a plain .zip.
 */
export { BUNDLE_TYPE };
export const BUNDLE_NAME = "files.zip";
export const MAX_BUNDLE_FILES = 1000;

export interface BundleEntry {
  name: string;
  blob: Blob;
  size: number;
}

/** Previews are chosen by extension, because a zip carries no MIME type; only the safe set maps. */
const EXTENSION_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  webm: "video/webm",
  mp4: "video/mp4",
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
};

export function typeFromName(name: string): string {
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  return name.includes(".") ? (EXTENSION_TYPES[ext] ?? "application/octet-stream") : "application/octet-stream";
}

/** Names inside one archive must be unique, or two files would overwrite each other on unzip. */
export function uniqueNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((raw) => {
    const base = safeFileName(raw);
    const dot = base.lastIndexOf(".");
    const stem = dot > 0 ? base.slice(0, dot) : base;
    const ext = dot > 0 ? base.slice(dot) : "";
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${stem} (${n})${ext}`;
    used.add(name.toLowerCase());
    return name;
  });
}

/** Packs the files into the File that encryptFile then encrypts. */
export async function packBundle(files: File[]): Promise<File> {
  if (files.length === 0 || files.length > MAX_BUNDLE_FILES) throw new CipherError("format");
  const names = uniqueNames(files.map((f) => f.name));
  const zip = await makeZip(files.map((f, i) => ({ name: names[i], data: f })));
  return new File([zip], BUNDLE_NAME, { type: BUNDLE_TYPE });
}

export function isBundle(type: string): boolean {
  return type === BUNDLE_TYPE;
}

export async function unpackBundle(blob: Blob): Promise<BundleEntry[]> {
  const items = await readZip(blob);
  if (items.length === 0 || items.length > Math.min(MAX_BUNDLE_FILES, MAX_ZIP_ENTRIES)) throw new CipherError("decrypt");
  // Entries are named from the last path segment only, so nothing can climb out of a folder.
  const names = uniqueNames(items.map((it) => it.name.split(/[\\/]/).pop() ?? ""));
  return items.map((it, i) => {
    const type = typeFromName(names[i]);
    return { name: names[i], size: it.data.size, blob: it.data.slice(0, it.data.size, previewKind(type) ? type : "application/octet-stream") };
  });
}
