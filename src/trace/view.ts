import { classify } from "../scan/query";
import { DEFAULT_NOISE_LIMIT } from "./aggregate";

/** Everything that defines a view. It is kept in the URL's # fragment: a fragment is never sent to a server or in a Referer. */
export interface View {
  address: string;
  watch: string[];
  /** Local calendar dates, YYYY-MM-DD; empty means unbounded. */
  from: string;
  to: string;
  noise: number;
}

export const MAX_WATCH = 10;
/** The most a user may allow per transaction before it counts as noise. */
export const MAX_NOISE = 100;
/** The window a fresh page starts with. */
export const DEFAULT_DAYS = 30;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const emptyView = (): View => ({ address: "", watch: [], from: "", to: "", noise: DEFAULT_NOISE_LIMIT });

/** A public mainnet address in canonical form, or undefined. Keys, seeds, transactions etc. are refused: only addresses go in a URL. */
export function publicAddress(text: string): string | undefined {
  const q = classify(text.trim());
  return q.kind === "address" ? q.address : undefined;
}

/** Splits free text into watch entries (whitespace, commas, semicolons). */
export const splitWatch = (text: string): string[] => text.split(/[\s,;]+/).filter(Boolean);

export function toHash(v: View): string {
  const p = new URLSearchParams();
  if (v.address) p.set("a", v.address);
  if (v.watch.length) p.set("w", v.watch.join(","));
  if (v.from) p.set("from", v.from);
  if (v.to) p.set("to", v.to);
  if (v.address && !v.from && !v.to) p.set("all", "1"); // an unbounded window is a choice, not "no window given"
  if (v.noise !== DEFAULT_NOISE_LIMIT) p.set("n", String(v.noise));
  const s = p.toString();
  return s ? `#${s}` : "";
}

/** Reads a view from a fragment; anything that is not a public address or a plain date is dropped. */
export function fromHash(hash: string): View {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const v = emptyView();
  v.address = publicAddress(p.get("a") ?? "") ?? "";
  v.watch = splitWatch(p.get("w") ?? "")
    .map((a) => publicAddress(a))
    .filter((a): a is string => !!a)
    .slice(0, MAX_WATCH);
  const from = p.get("from") ?? "";
  const to = p.get("to") ?? "";
  const today = dateInput(new Date());
  // No future: a date after today is pulled back to today.
  v.from = DATE.test(from) ? (from > today ? today : from) : "";
  v.to = DATE.test(to) ? (to > today ? today : to) : "";
  // A link that says nothing about the window gets the default: the last month.
  if (!p.has("from") && !p.has("to") && !p.has("all")) Object.assign(v, lastDays(DEFAULT_DAYS));
  const n = Number(p.get("n"));
  if (Number.isInteger(n) && n >= 2 && n <= MAX_NOISE) v.noise = n;
  return v;
}

/** Local midnight at the start of the date, as Unix seconds. */
const startOf = (d: string): number => {
  const [y, m, day] = d.split("-").map(Number);
  return Math.floor(new Date(y, m - 1, day).getTime() / 1000);
};

/** The window of a view: from the start of `from` to the very end of `to`. */
export function windowOf(v: Pick<View, "from" | "to">): { from: number; to: number } {
  return {
    from: v.from ? startOf(v.from) : 0,
    to: v.to ? startOf(v.to) + 86_399 : Number.MAX_SAFE_INTEGER,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");
export const dateInput = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** "Last n days" ending today. */
export function lastDays(n: number, now = new Date()): { from: string; to: string } {
  const from = new Date(now);
  from.setDate(from.getDate() - n);
  return { from: dateInput(from), to: dateInput(now) };
}

/** Local date and time to the minute: "2026-11-18 14:07". */
export const dateTime = (t: number): string => {
  const d = new Date(t * 1000);
  return `${dateInput(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
