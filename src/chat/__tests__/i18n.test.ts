import { describe, it, expect } from "vitest";
import { detectLang, messages } from "../i18n";

describe("detectLang", () => {
  it("follows the browser's first language", () => {
    expect(detectLang(["zh-CN", "en"])).toBe("zh");
    expect(detectLang(["zh-Hant-TW"])).toBe("zh");
    expect(detectLang(["en-US", "zh-CN"])).toBe("en");
    expect(detectLang(["ja"])).toBe("en");
  });

  it("falls back to English", () => {
    expect(detectLang(undefined)).toBe("en");
    expect(detectLang([])).toBe("en");
  });
});

describe("messages", () => {
  it("has the same keys in both languages", () => {
    const keys = (o: object, p = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) => (typeof v === "object" && v !== null ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
    expect(keys(messages.en).sort()).toEqual(keys(messages.zh).sort());
  });

  it("states the retention period", () => {
    expect(messages.zh.retention(30)).toContain("30");
    expect(messages.en.retention(30)).toContain("30");
  });
});
