/**
 * @mentions. The rule is "@username followed by one space". The composer inserts exactly that when a suggestion is picked, so a mention
 * is always @name plus a space. A sent message is trimmed, so a trailing "@name " ends the text as "@name": the end counts like the space.
 */
const NAME = "[A-Za-z0-9_-]{3,32}";

/** True when `text` mentions `handle` (case-insensitive): @handle with a space (or the end of the text) right after it, at the start or after whitespace. */
export function mentionsHandle(text: string, handle: string): boolean {
  if (!/^[A-Za-z0-9_-]{3,32}$/.test(handle)) return false;
  return new RegExp(`(?:^|\\s)@${handle}(?: |$)`, "i").test(text);
}

export interface Segment {
  text: string;
  /** The mentioned username when this piece is a mention of one of `handles`. */
  mention: string | null;
}

/** Splits a message into plain pieces and mentions of the given usernames, for highlighting. Never produces markup. */
export function splitMentions(text: string, handles: readonly string[]): Segment[] {
  const known = new Map(handles.map((h) => [h.toLowerCase(), h]));
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(new RegExp(`(^|\\s)@(${NAME})(?= |$)`, "g"))) {
    const name = known.get(m[2].toLowerCase());
    if (!name) continue;
    const start = (m.index ?? 0) + m[1].length;
    if (start > last) out.push({ text: text.slice(last, start), mention: null });
    out.push({ text: `@${m[2]}`, mention: name });
    last = start + 1 + m[2].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), mention: null });
  return out;
}

/** The "@prefix" being typed right before the caret, if any. `start` is the index of the @. */
export function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const m = /(^|\s)@([A-Za-z0-9_-]{0,32})$/.exec(text.slice(0, caret));
  return m ? { start: caret - m[2].length - 1, query: m[2] } : null;
}

/** Usernames that start with `query` (case-insensitive), shortest first, at most `limit`. */
export function suggest(handles: readonly string[], query: string, limit = 6): string[] {
  const q = query.toLowerCase();
  return handles
    .filter((h) => h.toLowerCase().startsWith(q))
    .sort((a, b) => a.length - b.length || a.localeCompare(b))
    .slice(0, limit);
}

/** Replaces the @prefix at `start` (up to the caret) with "@handle " and returns the new text and caret. */
export function applyMention(text: string, caret: number, start: number, handle: string): { text: string; caret: number } {
  const insert = `@${handle} `;
  const rest = text.slice(caret);
  // Do not double the space when one already follows the caret.
  const tail = rest.startsWith(" ") ? rest.slice(1) : rest;
  return { text: text.slice(0, start) + insert + tail, caret: start + insert.length };
}
