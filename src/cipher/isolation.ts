/** True when this page was opened by, or embedded in, another browsing context. */
export function isEmbeddedOrOpened(w: Window = window): boolean {
  try {
    return w.opener !== null || w.parent !== w;
  } catch {
    // Cross-origin access throwing also means we are not alone.
    return true;
  }
}
