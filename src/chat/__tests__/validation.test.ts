import { describe, it, expect } from "vitest";
import {
  canonicalHandle,
  checkHandle,
  checkPassword,
  normalizePassword,
  sanitizeHandleInput,
  sanitizeInvite,
  strengthOf,
} from "../validation";

describe("sanitizeHandleInput", () => {
  it("drops the leading @ and anything but ASCII letters, digits, _ and -", () => {
    expect(sanitizeHandleInput("@victor_go-1")).toBe("victor_go-1");
    expect(sanitizeHandleInput("vic tor")).toBe("victor");
    expect(sanitizeHandleInput("维克多abc")).toBe("abc");
    expect(sanitizeHandleInput("ＡＢＣ")).toBe("");
    expect(sanitizeHandleInput("a.b+c@d")).toBe("abcd");
    expect(sanitizeHandleInput("é")).toBe("");
  });

  it("caps the length at 32", () => {
    expect(sanitizeHandleInput("a".repeat(50))).toHaveLength(32);
  });
});

describe("checkHandle", () => {
  it("accepts valid handles", () => {
    for (const h of ["abc", "A_b-c", "user_123", "a".repeat(32), "x-y"]) expect(checkHandle(h)).toBeNull();
  });

  it("reports the first problem", () => {
    expect(checkHandle("")).toBe("empty");
    expect(checkHandle("ab")).toBe("short");
    expect(checkHandle("a".repeat(33))).toBe("long");
    expect(checkHandle("-abc")).toBe("startDash");
    expect(checkHandle("ab c")).toBe("chars");
    expect(checkHandle("abc\n")).toBe("chars");
    expect(checkHandle("维克多")).toBe("chars");
  });

  it("rejects reserved names in any case", () => {
    expect(checkHandle("Admin")).toBe("reserved");
    expect(checkHandle("ROOT")).toBe("reserved");
  });

  it("compares handles case-insensitively", () => {
    expect(canonicalHandle("Victor_Go")).toBe("victor_go");
  });
});

describe("checkPassword", () => {
  it("accepts 12+ characters with upper, lower and a digit", () => {
    expect(checkPassword("Abcdefghij1k")).toEqual([]);
    expect(checkPassword("correct Horse battery 7 staple")).toEqual([]);
  });

  it("lists every broken rule", () => {
    expect(checkPassword("short")).toEqual(["length", "upper", "digit"]);
    expect(checkPassword("abcdefghijklmnop")).toEqual(["upper", "digit"]);
    expect(checkPassword("ABCDEFGHIJKLMNOP1")).toEqual(["lower"]);
    expect(checkPassword("Abcdefghijklmnop")).toEqual(["digit"]);
  });

  it("counts characters, not UTF-16 units", () => {
    expect(checkPassword("Ab1" + "😀".repeat(8))).toContain("length");
    expect(checkPassword("Ab1" + "😀".repeat(9))).toEqual([]);
  });

  it("rejects control characters and absurd lengths", () => {
    expect(checkPassword("Abcdefghij1\u0000k")).toContain("control");
    expect(checkPassword("Aa1" + "x".repeat(300))).toContain("tooLong");
  });

  it("normalises with NFKC so every keyboard gives the same text", () => {
    expect(normalizePassword("Ａbc１")).toBe("Abc1");
    expect(checkPassword("Ａbcdefghij１k")).toEqual([]);
  });
});

describe("strengthOf and sanitizeInvite", () => {
  it("grades by bits", () => {
    expect(strengthOf(20)).toBe("weak");
    expect(strengthOf(45)).toBe("fair");
    expect(strengthOf(60)).toBe("strong");
  });

  it("keeps invite codes URL-safe", () => {
    expect(sanitizeInvite(" ab-C_1 !@")).toBe("ab-C_1");
  });
});
