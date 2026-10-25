/** Candidate URLs: ASCII only, so Chinese text right after a link is never swallowed into it. */
const URL_RE = /https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/gi;
const TRAILING = /[.,;:!?'*]$/;
const MAX_LINKS = 50;

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

function count(s: string, ch: string): number {
  let n = 0;
  for (const c of s) if (c === ch) n++;
  return n;
}

/** Only http(s) links with a real host; returns the normalised href or null. */
function safeHref(url: string): string | null {
  try {
    const u = new URL(url);
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname ? u.href : null;
  } catch {
    return null;
  }
}

/** Unique http(s) links found in plain text, in order of appearance. No markdown is interpreted. */
export function extractLinks(text: string): string[] {
  const seen = new Set<string>();
  for (const match of text.matchAll(URL_RE)) {
    const href = safeHref(trim(match[0]));
    if (href) seen.add(href);
    if (seen.size >= MAX_LINKS) break;
  }
  return [...seen];
}
