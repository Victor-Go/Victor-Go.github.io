import { describe, expect, it, vi } from "vitest";
import { PATH, go, sectionOf } from "../route";

const here = () => window.location.pathname;

describe("chat routes", () => {
  it("pushes screens, goes back through the history for the parent, and swaps between chats", () => {
    go(PATH.home, undefined, { replace: true });
    go(PATH.settings);
    go(PATH.settingsDetail("language"));
    expect(here()).toBe("/chat/settings/language/");
    expect(window.history.length).toBeGreaterThanOrEqual(3);
    const back = vi.spyOn(window.history, "back");
    go(PATH.settings); // the parent is the entry just before: a real "back", so the gesture and the button agree
    expect(back).toHaveBeenCalledOnce();
    back.mockRestore();

    go(PATH.home, undefined, { replace: true });
    const before = window.history.length;
    go(PATH.conversation, "a");
    go(PATH.group, "b"); // a second chat replaces the first, the history does not fill up
    expect(window.history.length).toBe(before + 1);
    expect(here()).toBe("/chat/group/");
  });

  it("keeps only an opaque key and a depth in the history entry", () => {
    go(PATH.conversation, "secret-conversation-id");
    expect(JSON.stringify(window.history.state)).not.toContain("secret");
  });

  it("maps addresses to the three parts of the app", () => {
    expect(sectionOf(PATH.home)).toBe("contacts");
    expect(sectionOf(PATH.conversation)).toBe("contacts");
    expect(sectionOf(PATH.favourites)).toBe("me");
    expect(sectionOf(PATH.settingsDetail("idle"))).toBe("me");
    expect(sectionOf(PATH.managementPage("users"))).toBe("manage");
  });
});
