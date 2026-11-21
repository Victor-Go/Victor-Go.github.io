/**
 * The two display rules of a message (nothing else is ever interpreted, and nothing here produces markup):
 *   "> text"  at the start of a line: those lines are drawn in a grey box. It is decoration, not a real quote of another message.
 *             Consecutive "> " lines share one box; any other line (an empty one too) ends it.
 *   "**word**" bold, only when everything between the stars is one run of characters without any space, tab or line break
 *             (so it never crosses a line, and "2 ** 3 ** 4" or "a**b" stay as typed; "2**3**4" without spaces does turn bold). The stars inside are not allowed either.
 * What was typed is what is stored and sent; the symbols are only hidden when a message is shown.
 */

export interface Block {
  /** True for a run of "> " lines (the prefix removed, the lines joined with "\n"). */
  quote: boolean;
  text: string;
}

export interface BoldPiece {
  text: string;
  bold: boolean;
}

/** "> " followed by at least one visible character. ">" alone, ">>" or "a > b" are ordinary text. */
const QUOTE_LINE = /^> (?=[^\s])/;

/** Splits a message into runs of plain lines and runs of quoted lines. The line break between two blocks is dropped (the box itself separates them). */
export function splitBlocks(text: string): Block[] {
  const out: Block[] = [];
  for (const line of text.split("\n")) {
    const quote = QUOTE_LINE.test(line);
    const body = quote ? line.slice(2) : line;
    const last = out[out.length - 1];
    if (last && last.quote === quote) last.text += "\n" + body;
    else out.push({ quote, text: body });
  }
  return out;
}

/** Not preceded or followed by another star, so "***x***" and "2**3**4" are left alone. */
const BOLD = /(?<!\*)\*\*([^\s*]+)\*\*(?!\*)/g;

/** Splits a line (or a few lines) into plain and bold pieces; the stars are dropped from the bold ones. */
export function splitBold(text: string): BoldPiece[] {
  const out: BoldPiece[] = [];
  let last = 0;
  for (const m of text.matchAll(BOLD)) {
    const start = m.index ?? 0;
    if (start > last) out.push({ text: text.slice(last, start), bold: false });
    out.push({ text: m[1], bold: true });
    last = start + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), bold: false });
  return out;
}

/**
 * Puts a quote of `message` at the end of the draft, on lines of its own, and leaves an empty line after it for the reply. Quoting several messages
 * gives several boxes (an empty line keeps two quotes from running into one box). Lines of the message that are themselves quote lines are left
 * out, so only what that person wrote is quoted (a message made only of quote lines is quoted as it is); empty lines are skipped.
 * Returns null when there is nothing to quote.
 */
export function quoteInto(draft: string, message: string): string | null {
  const lines = message.split("\n").filter((l) => l.trim() !== "");
  const own = lines.filter((l) => !QUOTE_LINE.test(l));
  const used = own.length > 0 ? own : lines;
  if (used.length === 0) return null;
  let base = draft;
  if (base !== "" && !base.endsWith("\n")) base += "\n";
  if (base !== "") {
    const before = base.slice(0, -1);
    if (QUOTE_LINE.test(before.slice(before.lastIndexOf("\n") + 1))) base += "\n";
  }
  return base + used.map((l) => "> " + l).join("\n") + "\n";
}
