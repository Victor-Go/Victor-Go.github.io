/**
 * Copy only on explicit user action. After 30 seconds, clear the clipboard only
 * if it still holds this exact text. Permission denial is expected on browsers
 * that disallow background clipboard reads, so failures are intentionally silent.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    window.setTimeout(() => {
      void (async () => {
        try {
          if (await navigator.clipboard.readText() === text) {
            await navigator.clipboard.writeText("");
          }
        } catch {
          // Best-effort only: never overwrite newer clipboard content blindly.
        }
      })();
    }, 30_000);
    return true;
  } catch {
    return false;
  }
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
