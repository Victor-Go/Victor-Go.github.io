import { describe, it, expect } from "vitest";
import { applyMention, mentionQuery, mentionsHandle, splitMentions, suggest } from "../mentions";

describe("mentionsHandle", () => {
  it("needs @name followed by one space", () => {
    expect(mentionsHandle("hi @alice how are you", "alice")).toBe(true);
    expect(mentionsHandle("@alice hello", "alice")).toBe(true);
    expect(mentionsHandle("hi @ALICE hello", "alice")).toBe(true);
    expect(mentionsHandle("hi @alice", "alice")).toBe(true);
    expect(mentionsHandle("@alice", "alice")).toBe(true);
    expect(mentionsHandle("hi @alice, hello", "alice")).toBe(false);
    expect(mentionsHandle("mail me at x@alice hello", "alice")).toBe(false);
    expect(mentionsHandle("hi @alice2 hello", "alice")).toBe(false);
  });

  it("rejects handles that would be unsafe in a pattern", () => {
    expect(mentionsHandle("@a.* hello", "a.*")).toBe(false);
  });
});

describe("splitMentions", () => {
  it("marks mentions of known users and leaves the rest alone", () => {
    expect(splitMentions("hey @alice and @bob_1 see this @nobody x", ["alice", "bob_1"])).toEqual([
      { text: "hey ", mention: null },
      { text: "@alice", mention: "alice" },
      { text: " and ", mention: null },
      { text: "@bob_1", mention: "bob_1" },
      { text: " see this @nobody x", mention: null },
    ]);
  });

  it("keeps the original text when nothing matches", () => {
    expect(splitMentions("no mentions here", ["alice"])).toEqual([{ text: "no mentions here", mention: null }]);
    expect(splitMentions("", ["alice"])).toEqual([]);
  });

  it("reassembles to the original text", () => {
    const text = "@alice hi @bob_1 bye";
    expect(splitMentions(text, ["alice", "bob_1"]).map((s) => s.text).join("")).toBe(text);
  });
});

describe("mentionQuery and suggestions", () => {
  it("finds the @prefix before the caret", () => {
    expect(mentionQuery("hello @al", 9)).toEqual({ start: 6, query: "al" });
    expect(mentionQuery("@", 1)).toEqual({ start: 0, query: "" });
    expect(mentionQuery("hello @alice there", 12)).toEqual({ start: 6, query: "alice" });
  });

  it("does not trigger inside words or after the mention is finished", () => {
    expect(mentionQuery("mail x@al", 9)).toBeNull();
    expect(mentionQuery("hello @alice ", 13)).toBeNull();
    expect(mentionQuery("hello", 5)).toBeNull();
  });

  it("suggests by prefix, shortest first, up to the limit", () => {
    const names = ["alice", "alan", "bob", "Albert", "al"];
    expect(suggest(names, "al")).toEqual(["al", "alan", "alice", "Albert"]);
    expect(suggest(names, "")).toHaveLength(5);
    expect(suggest(names, "al", 2)).toEqual(["al", "alan"]);
    expect(suggest(names, "zz")).toEqual([]);
  });

  it("inserts @name and one space, and moves the caret after it", () => {
    expect(applyMention("hi @al", 6, 3, "alice")).toEqual({ text: "hi @alice ", caret: 10 });
    expect(applyMention("hi @al there", 6, 3, "alice")).toEqual({ text: "hi @alice there", caret: 10 });
  });
});
