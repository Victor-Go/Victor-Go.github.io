import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Shell } from "../components/Shell";
import { avatarUri } from "../avatar";
import { setLang } from "../lang";
import { PATH, go } from "../route";
import { initialState, useChat } from "../store";

vi.mock("../client", async (orig) => ({ ...(await orig<typeof import("../client")>()), openConversation: vi.fn(async () => {}), resumeView: vi.fn() }));

const tab = () => screen.getAllByText("我的")[0].closest("button")!;
const as = (over: Record<string, unknown> = {}) => useChat.setState({ ...initialState, phase: "ready", me: { userId: "me1", handle: "me", role: "user", publicKey: "" }, ...over });

beforeEach(() => {
  setLang("zh");
  go(PATH.home);
});

describe("the 我的 tab icon", () => {
  it("is the signed-in person's own picture, with the label still under it", () => {
    as();
    render(<Shell />);
    const img = tab().querySelector("img.ch-nav-avatar") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe(avatarUri("me1"));
    expect(img.classList.contains("ch-active")).toBe(false);
    expect(img.classList.contains("ch-gold")).toBe(false);
    expect(tab().querySelector(".ch-nav-label")?.textContent).toBe("我的");
  });
  it("falls back to the person icon until there is a person", () => {
    as({ me: null });
    render(<Shell />);
    expect(tab().querySelector("img.ch-nav-avatar")).toBeNull();
    expect(tab().querySelector("svg")).not.toBeNull();
  });
  it("shows the active state on the 我的 page only", () => {
    as();
    go(PATH.me);
    render(<Shell />);
    expect(tab().querySelector("img.ch-nav-avatar")?.classList.contains("ch-active")).toBe(true);
    expect(tab().getAttribute("aria-current")).toBe("page");
  });
  it("an owner gets the static gold ring: no animated wrapper in the navigation", () => {
    as({ admins: { me1: "owner" } });
    const { container } = render(<Shell />);
    expect(tab().querySelector("img.ch-nav-avatar")?.classList.contains("ch-gold")).toBe(true);
    expect(container.querySelector(".ch-nav .ch-avatar-owner")).toBeNull();
  });
});
