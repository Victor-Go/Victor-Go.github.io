import { describe, expect, it } from "vitest";
import { ApiError } from "../net/api";
import { appMessages, errorOf } from "../i18nApp";

const zh = appMessages.zh;
const en = appMessages.en;

describe("the text of a failure", () => {
  it("uses the reason the server gave", () => {
    expect(errorOf(zh, new ApiError(404, "not_found", { reason: "self" }))).toBe("不能添加自己为联系人。");
    expect(errorOf(en, new ApiError(403, "forbidden", { reason: "not_sender" }))).toBe("You can only delete messages you sent.");
  });

  it("falls back to the text of the code when there is no reason, or the reason is not known", () => {
    expect(errorOf(zh, new ApiError(409, "conflict"))).toBe(zh.errors.conflict);
    expect(errorOf(zh, new ApiError(409, "conflict", { reason: "from_a_newer_server" }))).toBe(zh.errors.conflict);
    expect(errorOf(en, new ApiError(0, "network"))).toBe(en.errors.network);
  });

  it("is the general text for anything that is not an ApiError", () => {
    expect(errorOf(zh, new Error("boom"))).toBe(zh.errors.internal);
  });

  it("has a text in both languages for every reason, and none of the general ones names a cause it cannot know", () => {
    expect(Object.keys(zh.errorReasons).sort()).toEqual(Object.keys(en.errorReasons).sort());
    for (const m of [zh, en]) {
      expect(m.errors.not_found).not.toMatch(/账户|account/i);
      expect(m.errors.conflict).not.toMatch(/已满|full|已经存在|exist/i);
    }
  });
});
