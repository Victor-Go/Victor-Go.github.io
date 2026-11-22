import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Conversation } from "../components/Conversation";
import { ContactInfo } from "../components/ContactInfo";
import { GroupInfo } from "../components/GroupInfo";
import { setLang } from "../lang";
import { initialState, useChat, type Group } from "../store";

const muteGroup = vi.hoisted(() => vi.fn(async (_gid: string, _muted: boolean, _userId?: string) => {}));
const takeOverGroup = vi.hoisted(() => vi.fn(async (_gid: string) => {}));
const inviteToGroup = vi.hoisted(() => vi.fn());
const kickMember = vi.hoisted(() => vi.fn(async (_gid: string, _userId: string) => {}));
vi.mock("../client", async (orig) => ({ ...(await orig<typeof import("../client")>()), muteGroup, takeOverGroup, inviteToGroup, kickMember }));

const GID = "g1";
const group = (over: Partial<Group> = {}): Group => ({
  id: GID,
  name: "Test",
  ownerId: "owner",
  gen: 1,
  max: 10,
  needsRekey: false,
  pendingOwner: null,
  members: [
    { userId: "owner", handle: "olga", role: "admin" },
    { userId: "adm", handle: "victor", role: "admin" },
    { userId: "kay", handle: "kay", role: "user" },
    { userId: "lee", handle: "lee", role: "user" },
  ],
  keys: new Map([[1, new Uint8Array(32)]]),
  ...over,
});
const as = (userId: string, role: "admin" | "user", permissions: string[], g: Group = group()) =>
  useChat.setState({ ...initialState, phase: "ready", me: { userId, handle: userId, role, publicKey: "" }, permissions, groups: [g], activeConv: GID, messages: { [GID]: [] } });

beforeEach(() => {
  setLang("zh");
  muteGroup.mockClear();
  takeOverGroup.mockClear();
  inviteToGroup.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("muting from the group panel", () => {
  it("the owner mutes one member and the whole group; the owner and administrators have no mute button", async () => {
    as("owner", "admin", []);
    render(<GroupInfo group={group()} onClose={() => {}} />);
    expect(screen.getAllByText("禁言")).toHaveLength(2); // kay and lee only
    fireEvent.click(screen.getAllByText("禁言")[0]);
    expect(muteGroup).toHaveBeenCalledWith(GID, true, "kay");
    await waitFor(() => expect((screen.getByText("全员禁言") as HTMLButtonElement).disabled).toBe(false)); // the first call is still running
    fireEvent.click(screen.getByText("全员禁言"));
    expect(muteGroup).toHaveBeenCalledWith(GID, true);
  });

  it("a muted member shows a badge and the button unmutes; a muted group offers 'unmute everyone'", async () => {
    as("owner", "admin", []);
    render(<GroupInfo group={group({ muted: true, mutedUsers: ["kay"] })} onClose={() => {}} />);
    expect(screen.getByText("已禁言")).toBeTruthy();
    fireEvent.click(screen.getByText("解除禁言"));
    expect(muteGroup).toHaveBeenCalledWith(GID, false, "kay");
    await waitFor(() => expect((screen.getByText("解除全员禁言") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByText("解除全员禁言"));
    expect(muteGroup).toHaveBeenCalledWith(GID, false);
  });

  it("an administrator with the permission mutes in somebody else's group; an ordinary member sees no controls", () => {
    as("adm", "admin", ["groups.mute_any"]);
    const { unmount } = render(<GroupInfo group={group()} onClose={() => {}} />);
    expect(screen.getByText("全员禁言")).toBeTruthy();
    unmount();
    as("kay", "user", []);
    render(<GroupInfo group={group()} onClose={() => {}} />);
    expect(screen.queryByText("全员禁言")).toBeNull();
    expect(screen.queryByText("禁言")).toBeNull();
  });

  it("a muted member's box stays but is empty and disabled, with the reason as its placeholder; the whole-group mute is named first", () => {
    useChat.setState({ drafts: { [GID]: "half typed" } });
    as("kay", "user", [], group({ mutedUsers: ["kay"] }));
    useChat.setState({ drafts: { [GID]: "half typed" } });
    const first = render(<Conversation />);
    const box = screen.getByPlaceholderText("你已被禁言,暂时不能发言") as HTMLTextAreaElement;
    expect(box.disabled).toBe(true);
    expect(box.value).toBe("");
    expect(useChat.getState().drafts[GID]).toBeUndefined();
    first.unmount();
    as("kay", "user", [], group({ muted: true, mutedUsers: ["kay"] }));
    const second = render(<Conversation />);
    expect((screen.getByPlaceholderText("全员禁言中,只有群主和管理员可以发言") as HTMLTextAreaElement).disabled).toBe(true);
    second.unmount();
    as("adm", "admin", [], group({ muted: true }));
    render(<Conversation />);
    expect(screen.queryByPlaceholderText(/禁言/)).toBeNull();
  });
});

describe("badges in the member list", () => {
  it("the owner who is also an administrator shows both badges", () => {
    as("owner", "admin", []);
    useChat.setState({ admins: { owner: "admin" } });
    render(<GroupInfo group={group()} onClose={() => {}} />);
    const row = screen.getByText(/@olga/).closest("li")!;
    expect(row.textContent).toContain("群主");
    expect(row.querySelector('[data-badge="admin"]')).toBeTruthy();
  });
});

describe("taking a group over", () => {
  it("an administrator member with the permission sees the button; confirming calls the server", async () => {
    as("adm", "admin", ["groups.take_over"]);
    render(<GroupInfo group={group()} onClose={() => {}} />);
    fireEvent.click(screen.getByText("接管群主"));
    expect(takeOverGroup).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByText("接管群主").at(-1)!);
    await waitFor(() => expect(takeOverGroup).toHaveBeenCalledWith(GID));
  });

  it("nobody else sees it, and the owner does not", () => {
    as("kay", "user", []);
    const { unmount } = render(<GroupInfo group={group()} onClose={() => {}} />);
    expect(screen.queryByText("接管群主")).toBeNull();
    unmount();
    as("owner", "admin", ["groups.take_over"]);
    render(<GroupInfo group={group()} onClose={() => {}} />);
    expect(screen.queryByText("接管群主")).toBeNull();
  });
});

describe("inviting shows that the key is being made", () => {
  it("the button says so and is busy until the invitation is done", async () => {
    let done: () => void = () => {};
    inviteToGroup.mockReturnValue(new Promise<void>((resolve) => (done = resolve)));
    as("owner", "admin", []);
    render(<GroupInfo group={group()} onClose={() => {}} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "newbie" } });
    fireEvent.click(screen.getByText("邀请"));
    await waitFor(() => expect(screen.getByText("正在创建群密钥…")).toBeTruthy());
    expect(screen.getByText("正在创建群密钥…").closest("button")!.getAttribute("aria-busy")).toBe("true");
    done();
    await waitFor(() => expect(screen.queryByText("正在创建群密钥…")).toBeNull());
  });
});

describe("the contact panel", () => {
  it("shows the name once (the title) and a large picture", () => {
    as("me", "user", []);
    const contact = { userId: "peer", handle: "mike2026", role: "user", convId: "c1", key: new Uint8Array(32), nick: "Mike李斌" };
    render(<ContactInfo contact={contact} onClose={() => {}} />);
    expect(screen.getAllByText("@mike2026 (Mike李斌)")).toHaveLength(1);
    expect(document.querySelector(".ch-contact-head img")!.getAttribute("width")).toBe("120");
  });
});

describe("nicknames and the avatar shortcut", () => {
  it("the group member list shows the nickname I gave a contact", () => {
    as("owner", "admin", []);
    useChat.setState({ contacts: [{ userId: "kay", handle: "kay", role: "user", convId: "c1", key: new Uint8Array(32), nick: "凯" }] });
    render(<GroupInfo group={group()} onClose={() => {}} />);
    expect(screen.getByText(/@kay \(凯\)/)).toBeTruthy();
  });

  it("tapping the peer's picture in the chat header opens the contact panel", () => {
    useChat.setState({
      ...initialState,
      phase: "ready",
      me: { userId: "me", handle: "me", role: "user", publicKey: "" },
      contacts: [{ userId: "peer", handle: "peer", role: "user", convId: "c1", key: new Uint8Array(32) }],
      activeConv: "c1",
      messages: { c1: [] },
    });
    render(<Conversation />);
    fireEvent.click(document.querySelector(".ch-conv-head .ch-avatar-btn")!);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});

describe("removing a member from the group", () => {
  it("asks in our own dialog first, and only the confirmation removes", async () => {
    const native = vi.spyOn(window, "confirm");
    as("owner", "admin", []);
    render(<GroupInfo group={group()} onClose={() => {}} />);
    fireEvent.click(screen.getAllByText("移出")[0]);
    expect(screen.getByText("确定把 @victor 移出群吗?")).toBeTruthy();
    expect(kickMember).not.toHaveBeenCalled();
    expect(native).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("取消"));
    expect(screen.queryByText("确定把 @victor 移出群吗?")).toBeNull();
    fireEvent.click(screen.getAllByText("移出")[0]);
    fireEvent.click(screen.getAllByText("移出").at(-1)!);
    await waitFor(() => expect(kickMember).toHaveBeenCalledWith(GID, "adm"));
  });
});
