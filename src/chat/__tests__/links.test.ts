import { describe, expect, it } from "vitest";
import { splitLinks } from "../links";

describe("splitLinks", () => {
  it("finds http(s) links and leaves the rest as text", () => {
    expect(splitLinks("see https://example.com/a?b=1, ok")).toEqual([
      { text: "see ", href: null },
      { text: "https://example.com/a?b=1", href: "https://example.com/a?b=1" },
      { text: ", ok", href: null },
    ]);
  });
  it("never links other schemes", () => {
    expect(splitLinks("javascript:alert(1) ftp://x.org").every((p) => p.href === null)).toBe(true);
  });
  it("keeps the text intact", () => {
    const text = "a http://x.org/p). b https://y.org";
    expect(splitLinks(text).map((p) => p.text).join("")).toBe(text);
  });
  it("does not swallow Chinese text after a link", () => {
    expect(splitLinks("看https://example.com吧").map((p) => p.href)).toEqual([null, "https://example.com/", null]);
  });

  it("links bare sites with a well-known ending, as https", () => {
    expect(splitLinks("go to google.com/abc, then www.example.org.")).toEqual([
      { text: "go to ", href: null },
      { text: "google.com/abc", href: "https://google.com/abc" },
      { text: ", then ", href: null },
      { text: "www.example.org", href: "https://www.example.org/" },
      { text: ".", href: null },
    ]);
    expect(splitLinks("看google.com吧").map((p) => p.href)).toEqual([null, "https://google.com/", null]);
    expect(splitLinks("a.io:8080/x")[0].href).toBe("https://a.io:8080/x");
  });

  it("leaves file names, e-mail addresses and plain words alone", () => {
    for (const text of ["open notes.txt and app.js", "mail bob@example.com now", "e.g. this", "version 1.2.3", "@google.com ", "google.community", "a.com.txt"]) {
      expect(splitLinks(text).every((p) => p.href === null), text).toBe(true);
    }
  });
});
