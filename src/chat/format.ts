import type { Lang } from "./i18n";

const locale = (lang: Lang): string => (lang === "zh" ? "zh-CN" : "en");

/** Times arrive as UTC milliseconds and are shown in the device's own time zone (Intl uses it by default). */
export const formatClock = (ms: number, lang: Lang): string =>
  new Intl.DateTimeFormat(locale(lang), { hour: "2-digit", minute: "2-digit" }).format(ms);

/** A size in bytes as B, KB, MB or GB (steps of 1000, the same MB as the monthly file limit), one decimal from KB up. */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  return i === 0 ? `${Math.round(v)} B` : `${v.toFixed(1)} ${units[i]}`;
}

/** Same local calendar day gives the same key, whatever the time zone. */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function formatDay(ms: number, now: number, lang: Lang, labels: { today: string; yesterday: string }): string {
  if (dayKey(ms) === dayKey(now)) return labels.today;
  const prev = new Date(now);
  prev.setDate(prev.getDate() - 1);
  if (dayKey(ms) === dayKey(prev.getTime())) return labels.yesterday;
  // Anything older than yesterday gets the full date, with the year and the weekday.
  return new Intl.DateTimeFormat(locale(lang), { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(ms);
}

/** Messages older than the retention period are hidden even if the server has not removed them yet. */
export const isExpired = (time: number, now: number, retentionDays: number): boolean => now - time > retentionDays * 86_400_000;
