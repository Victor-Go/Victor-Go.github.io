/** Copy only on explicit user action. The clipboard is only ever written, never read. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Saves ciphertext text as a file. Callers must warn that the file persists on disk. */
export function downloadText(filename: string, text: string): void {
  downloadBlob(filename, new Blob([text], { type: "text/plain;charset=utf-8" }));
}

/** Saves a blob as a file. Callers must warn that the file persists on disk. */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
