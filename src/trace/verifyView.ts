import { DEFAULT_NOISE_LIMIT } from "./aggregate";
import { DEFAULT_DAYS, MAX_NOISE, dateInput, lastDays, publicAddress, splitWatch } from "./view";

/** What defines a verification. Like the single-address view it lives only in the URL's # fragment (`m=v` marks this mode). */
export interface VerifyView {
  first: string;
  second: string;
  candidates: string[];
  from: string;
  to: string;
  noise: number;
  /** Rounds of "search for a path" already run; opening the link runs them again (0 = just the plain check). */
  search: number;
}

export const MAX_CANDIDATES = 10;
/** The most rounds a link may ask for. */
export const MAX_SEARCH = 6;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const emptyVerify = (): VerifyView => ({ first: "", second: "", candidates: [], from: "", to: "", noise: DEFAULT_NOISE_LIMIT, search: 0 });

export const isVerifyHash = (hash: string): boolean => new URLSearchParams(hash.replace(/^#/, "")).get("m") === "v";

export function toVerifyHash(v: VerifyView): string {
  const p = new URLSearchParams({ m: "v" });
  if (v.first) p.set("t1", v.first);
  if (v.second) p.set("t2", v.second);
  if (v.candidates.length) p.set("c", v.candidates.join(","));
  if (v.from) p.set("from", v.from);
  if (v.to) p.set("to", v.to);
  if (v.first && !v.from && !v.to) p.set("all", "1");
  if (v.noise !== DEFAULT_NOISE_LIMIT) p.set("n", String(v.noise));
  if (v.search > 0) p.set("s", String(v.search));
  return `#${p.toString()}`;
}

export function fromVerifyHash(hash: string): VerifyView {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const v = emptyVerify();
  v.first = publicAddress(p.get("t1") ?? "") ?? "";
  v.second = publicAddress(p.get("t2") ?? "") ?? "";
  v.candidates = splitWatch(p.get("c") ?? "")
    .map((a) => publicAddress(a))
    .filter((a): a is string => !!a)
    .slice(0, MAX_CANDIDATES);
  const today = dateInput(new Date());
  const from = p.get("from") ?? "";
  const to = p.get("to") ?? "";
  v.from = DATE.test(from) ? (from > today ? today : from) : "";
  v.to = DATE.test(to) ? (to > today ? today : to) : "";
  // A link that says nothing about the window gets the default: the last month.
  if (!p.has("from") && !p.has("to") && !p.has("all")) Object.assign(v, lastDays(DEFAULT_DAYS));
  const n = Number(p.get("n"));
  if (Number.isInteger(n) && n >= 2 && n <= MAX_NOISE) v.noise = n;
  const s = Number(p.get("s"));
  if (Number.isInteger(s) && s >= 1 && s <= MAX_SEARCH) v.search = s;
  return v;
}
