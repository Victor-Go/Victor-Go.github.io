/** Candidate URLs: ASCII only, so Chinese text right after a link is never swallowed into it. */
const CHARS = String.raw`[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]`;
/** Well-known endings only, so "file.txt" or "Node.js" are never taken for a site. */
const TLDS = "com|net|org|io|dev|app|co|cn|me|info|xyz|ai|edu|gov|uk|de|jp|fr|ru|us|tv|cc|top|site|online|tech|cloud|ly|gl|biz|club|shop|wiki";
const URL_RE = new RegExp(
  // with a scheme, or a bare site name such as google.com/abc (not after a letter, "@", "." or "/": no e-mail addresses, no middle of a word)
  String.raw`https?://${CHARS}+|(?<![A-Za-z0-9_@.\-/:%])(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+(?:${TLDS})(?![A-Za-z0-9-])(?!\.[A-Za-z0-9])(?::\d{1,5})?(?:[/?#]${CHARS}*)?`,
  "gi",
);
const TRAILING = /[.,;:!?'*]$/;

export interface LinkPiece {
  text: string;
  /** The normalised http(s) address when this piece is a link, else null. */
  href: string | null;
}

const count = (s: string, ch: string): number => [...s].filter((c) => c === ch).length;

/** Drops sentence punctuation and unbalanced closing brackets from the end of a match. */
function trim(url: string): string {
  let u = url;
  for (;;) {
    if (TRAILING.test(u)) u = u.slice(0, -1);
    else if (u.endsWith(")") && count(u, "(") < count(u, ")")) u = u.slice(0, -1);
    else if (u.endsWith("]") && count(u, "[") < count(u, "]")) u = u.slice(0, -1);
    else return u;
  }
}

/** Only http(s) links with a real host. */
function safeHref(url: string): string | null {
  try {
    const u = new URL(url);
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname ? u.href : null;
  } catch {
    return null;
  }
}

/** Splits plain text into text and http(s) links (never markup), so a message can show its links as links. */
export function splitLinks(text: string): LinkPiece[] {
  const out: LinkPiece[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const shown = trim(m[0]);
    const href = safeHref(/^https?:\/\//i.test(shown) ? shown : `https://${shown}`);
    if (!href) continue;
    const start = m.index ?? 0;
    if (start > last) out.push({ text: text.slice(last, start), href: null });
    out.push({ text: shown, href });
    last = start + shown.length;
  }
  if (last < text.length) out.push({ text: text.slice(last), href: null });
  return out;
}
