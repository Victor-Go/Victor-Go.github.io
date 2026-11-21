import { describe, it, expect } from "vitest";
import { quoteInto, splitBlocks, splitBold } from "../richText";

describe("splitBlocks", () => {
  it("makes one box of consecutive quote lines", () => {
    expect(splitBlocks("> a\n> b")).toEqual([{ quote: true, text: "a\nb" }]);
  });
  it("one line is one box; text before and after stays outside", () => {
    expect(splitBlocks("hi\n> a\nbye")).toEqual([
      { quote: false, text: "hi" },
      { quote: true, text: "a" },
      { quote: false, text: "bye" },
    ]);
  });
  it("an empty line ends the box, so two groups are two boxes", () => {
    expect(splitBlocks("> a\n\n> b")).toEqual([
      { quote: true, text: "a" },
      { quote: false, text: "" },
      { quote: true, text: "b" },
    ]);
  });
  it("needs '> ' at the very start of the line and something after it", () => {
    for (const t of ["a > b", "5>3", ">x", ">> x", " > x", ">", "> ", ">   ", "-> x"]) {
      expect(splitBlocks(t)).toEqual([{ quote: false, text: t }]);
    }
  });
  it("a second '>' inside is kept as typed (no nesting)", () => {
    expect(splitBlocks("> > a")).toEqual([{ quote: true, text: "> a" }]);
  });
  it("plain text is untouched", () => {
    expect(splitBlocks("a\nb")).toEqual([{ quote: false, text: "a\nb" }]);
    expect(splitBlocks("")).toEqual([{ quote: false, text: "" }]);
  });
});

describe("splitBold", () => {
  it("bolds a run without spaces", () => {
    expect(splitBold("a **b** c")).toEqual([
      { text: "a ", bold: false },
      { text: "b", bold: true },
      { text: " c", bold: false },
    ]);
    expect(splitBold("**加粗**")).toEqual([{ text: "加粗", bold: true }]);
    expect(splitBold("这是**重点**啊")).toEqual([
      { text: "这是", bold: false },
      { text: "重点", bold: true },
      { text: "啊", bold: false },
    ]);
  });
  it("two in one line", () => {
    expect(splitBold("**a** **b**").filter((p) => p.bold).map((p) => p.text)).toEqual(["a", "b"]);
  });
  it("any space, empty content or line break leaves it as typed", () => {
    for (const t of ["** a **", "**a b**", "****", "** **", "**a\nb**", "**a　b**", "**a", "a**", "**a*", "***a***"]) {
      expect(splitBold(t)).toEqual([{ text: t, bold: false }]);
    }
  });
  it("keeps punctuation and links inside", () => {
    expect(splitBold("**a.com/x_y**")).toEqual([{ text: "a.com/x_y", bold: true }]);
  });
});

describe("quoteInto", () => {
  it("quotes into an empty draft and leaves a new line", () => {
    expect(quoteInto("", "我打给你")).toBe("> 我打给你\n");
    expect(quoteInto("", "a\nb")).toBe("> a\n> b\n");
  });
  it("starts a new line after text that is already in the draft", () => {
    expect(quoteInto("好的", "x")).toBe("好的\n> x\n");
    expect(quoteInto("好的\n", "x")).toBe("好的\n> x\n");
  });
  it("a second quote becomes a second box", () => {
    const first = quoteInto("", "a")!;
    expect(quoteInto(first, "b")).toBe("> a\n\n> b\n");
    expect(splitBlocks(quoteInto(first, "b")!).filter((b) => b.quote)).toHaveLength(2);
    expect(quoteInto("> a", "b")).toBe("> a\n\n> b\n");
  });
  it("skips empty lines and the message's own quote lines", () => {
    expect(quoteInto("", "> old\nnew\n\nmore")).toBe("> new\n> more\n");
    expect(quoteInto("", "> only")).toBe("> > only\n");
  });
  it("nothing to quote", () => {
    expect(quoteInto("x", "  \n ")).toBeNull();
  });
});
