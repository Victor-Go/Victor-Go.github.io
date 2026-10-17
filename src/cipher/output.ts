const CLIPBOARD_CLEAR_MS = 30_000;

let clearTimer: ReturnType<typeof setTimeout> | undefined;

/** Manual copy only. Afterwards, best-effort clipboard clearing; failures are silent. */
export async function copyWithAutoClear(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    return false;
  }
  clearTimeout(clearTimer);
  clearTimer = setTimeout(() => {
    navigator.clipboard.writeText("").catch(() => {});
  }, CLIPBOARD_CLEAR_MS);
  return true;
}

/** Saves ciphertext text as a file. Callers must warn that the file persists on disk. */
export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
