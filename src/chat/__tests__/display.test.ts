import { describe, it, expect } from "vitest";
import { avatarUri } from "../avatar";
import { dayKey, formatBytes, formatDay, isExpired } from "../format";

describe("avatarUri", () => {
  it("is deterministic and different per user", () => {
    expect(avatarUri("user-1")).toBe(avatarUri("user-1"));
    expect(avatarUri("user-1")).not.toBe(avatarUri("user-2"));
  });

  it("is an inert SVG image", () => {
    const uri = avatarUri("user-3");
    expect(uri.startsWith("data:image/svg+xml")).toBe(true);
    const svg = decodeURIComponent(uri.split(",")[1]);
    expect(svg).toContain("<svg");
    expect(svg).not.toMatch(/<script|onload|javascript:/i);
  });
});

describe("day grouping uses the local calendar", () => {
  const labels = { today: "Today", yesterday: "Yesterday" };
  // Built from local components, so the assertions hold in any time zone.
  const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min).getTime();

  it("keeps one local day together and splits at local midnight", () => {
    expect(dayKey(at(2026, 5, 1, 0, 1))).toBe(dayKey(at(2026, 5, 1, 23, 59)));
    expect(dayKey(at(2026, 5, 1, 23, 59))).not.toBe(dayKey(at(2026, 5, 2, 0, 1)));
  });

  it("labels today, yesterday and older days", () => {
    const now = at(2026, 5, 10, 12);
    expect(formatDay(at(2026, 5, 10, 1), now, "en", labels)).toBe("Today");
    expect(formatDay(at(2026, 5, 9, 23), now, "en", labels)).toBe("Yesterday");
    const older = formatDay(at(2026, 5, 1, 12), now, "en", labels);
    expect(older).not.toMatch(/Today|Yesterday/);
    expect(older).toContain("2026");
    expect(older).toContain("May");
    expect(older).toContain("1");
    expect(formatDay(at(2025, 12, 31, 12), now, "en", labels)).toContain("2025");
    expect(formatDay(at(2026, 5, 1, 12), now, "zh", labels)).toMatch(/2026年5月1日/);
  });
});

describe("isExpired", () => {
  it("hides messages older than the retention period", () => {
    const now = 100 * 86_400_000;
    expect(isExpired(now - 29 * 86_400_000, now, 30)).toBe(false);
    expect(isExpired(now - 31 * 86_400_000, now, 30)).toBe(true);
    expect(isExpired(now - 2 * 86_400_000, now, 1)).toBe(true);
  });
});

describe("formatBytes", () => {
  it("steps through B, KB, MB, GB", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(999)).toBe("999 B");
    expect(formatBytes(1500)).toBe("1.5 KB");
    expect(formatBytes(5_000_000)).toBe("5.0 MB");
    expect(formatBytes(3_000_000_000)).toBe("3.0 GB");
    expect(formatBytes(-1)).toBe("0 B");
  });
});
