import { useEffect, useState } from "react";
import type { Messages } from "../i18n";

const MAX_CHARS = 2_000_000;

/** Decrypted text as inert text (never markup), shown from memory; the box grows with the text up to 600px. */
export function TextPreview({ blob, m }: { blob: Blob; m: Messages }) {
  const [text, setText] = useState("");
  useEffect(() => {
    let live = true;
    blob.text().then((t) => live && setText(t.length > MAX_CHARS ? `${t.slice(0, MAX_CHARS)}\n…` : t));
    return () => {
      live = false;
      setText("");
    };
  }, [blob]);
  return (
    <pre className="c-text" tabIndex={0} aria-label={m.textTitle}>
      {text}
    </pre>
  );
}
