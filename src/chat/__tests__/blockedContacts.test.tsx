import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ContactsPane } from "../components/ContactsPane";
import { setLang } from "../lang";
import { initialState, useChat, type RequestItem } from "../store";

const requestContact = vi.hoisted(() => vi.fn(async (_handle: string, _progress: unknown) => {}));
const acceptRequest = vi.hoisted(() => vi.fn(async (_id: string) => {}));
vi.mock("../client", async (orig) => ({ ...(await orig<typeof import("../client")>()), requestContact, acceptRequest }));

const blocked = { contactsBlocked: false, globalContactsBlocked: true, canAddContacts: false };
const incoming = (id: string, handle: string, role: string, over: Partial<RequestItem> = {}): RequestItem => ({ id, direction: "in", status: "pending", user: { userId: id, handle, role }, createdAt: 1, ...over });

beforeEach(() => {
  setLang("zh");
  requestContact.mockReset();
  acceptRequest.mockReset();
  useChat.setState({
    ...initialState,
    phase: "ready",
    me: { userId: "me", handle: "me", role: "user", publicKey: "" },
    admins: { a1: "owner", a2: "admin", me2: "admin" },
    adminList: [
      { userId: "a1", handle: "boss" },
      { userId: "a2", handle: "second" },
      { userId: "a3", handle: "third" },
    ],
  });
});

describe("contacts blocked: only administrators can be added", () => {
  beforeEach(() => useChat.setState({ account: blocked, contacts: [{ userId: "a3", handle: "third", role: "admin", convId: "c3", key: null }] }));

  it("keeps the entry, opens the administrators list without a handle field, and says so in the hint", () => {
    render(<ContactsPane />);
    expect(screen.getByText(/目前不能添加联系人。 你仍然可以添加管理员。/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText("添加管理员"));
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("@boss")).toBeTruthy();
    expect(screen.getByText("@second")).toBeTruthy();
    // already a contact: not offered
    expect(within(screen.getByRole("dialog")).queryByText("@third")).toBeNull();
  });

  it("does not list the person themself or somebody with a pending request", () => {
    useChat.setState({ adminList: [{ userId: "me", handle: "me" }, { userId: "a1", handle: "boss" }, { userId: "a2", handle: "second" }], requests: [incoming("a2", "second", "admin")] });
    render(<ContactsPane />);
    fireEvent.click(screen.getByLabelText("添加管理员"));
    expect(screen.getByText("@boss")).toBeTruthy();
    expect(screen.queryByText("@me")).toBeNull();
    expect(screen.getAllByText("@second")).toHaveLength(1); // only the request row, not the dialog
  });

  it("a tap sends the request through the usual flow", async () => {
    render(<ContactsPane />);
    fireEvent.click(screen.getByLabelText("添加管理员"));
    fireEvent.click(screen.getByText("@boss"));
    await waitFor(() => expect(requestContact).toHaveBeenCalledWith("boss", expect.any(Function)));
    await screen.findByText("申请已发送,等待对方同意。");
  });

  it("no administrator to list: the hint only, no extra line", () => {
    useChat.setState({ adminList: [], contacts: [] });
    render(<ContactsPane />);
    expect(screen.queryByText(/你仍然可以添加管理员/)).toBeNull();
    fireEvent.click(screen.getByLabelText("添加管理员"));
    expect(screen.getByText("现在没有可以添加的管理员。")).toBeTruthy();
  });

  it("can accept a request from an administrator but not from an ordinary user", () => {
    useChat.setState({ requests: [incoming("a1", "boss", "admin"), incoming("u9", "pal", "user"), incoming("u8", "carded", "user", { viaCard: true })] });
    render(<ContactsPane />);
    expect(screen.getAllByText("同意")).toHaveLength(2); // the administrator and the card
    expect(screen.getAllByText("拒绝")).toHaveLength(3);
  });
});

describe("contacts not blocked: unchanged", () => {
  it("the add entry opens the handle form, and an ordinary user's request can be accepted", () => {
    useChat.setState({ requests: [incoming("u9", "pal", "user")] });
    render(<ContactsPane />);
    expect(screen.queryByText(/你仍然可以添加管理员/)).toBeNull();
    expect(screen.getAllByText("同意")).toHaveLength(1);
    fireEvent.click(screen.getByLabelText("添加联系人"));
    expect(screen.getByRole("textbox")).toBeTruthy();
  });
});

describe("the badge on the request rows", () => {
  it("shows 负责人 (gold), 管理员 and the role fallback on incoming and outgoing requests, and none for an ordinary user", () => {
    useChat.setState({
      requests: [
        incoming("a1", "boss", "admin"),
        incoming("a2", "second", "admin", { direction: "out" }),
        incoming("zz", "unlisted", "admin"),
        incoming("u9", "pal", "user"),
      ],
    });
    const { container } = render(<ContactsPane />);
    const rows = [...container.querySelectorAll(".ch-row")].filter((r) => r.querySelector(".ch-hint"));
    const badgeOf = (handle: string) => rows.find((r) => r.textContent?.includes(`@${handle}`))?.querySelector(".ch-admin");
    expect(badgeOf("boss")?.textContent).toBe("负责人");
    expect(badgeOf("boss")?.classList.contains("ch-owner")).toBe(true);
    expect(badgeOf("second")?.textContent).toBe("管理员");
    expect(badgeOf("unlisted")?.textContent).toBe("管理员");
    expect(badgeOf("pal")).toBeNull();
  });
});
