import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ContactsPane } from "../components/ContactsPane";
import { Conversation } from "../components/Conversation";
import { GroupInfo } from "../components/GroupInfo";
import { ApiError } from "../net/api";
import { setLang } from "../lang";
import { appMessages, errorOf } from "../i18nApp";
import { initialState, useChat, type Group, type Msg } from "../store";

const requestViaCard = vi.hoisted(() => vi.fn(async (_m: unknown, _progress: unknown) => {}));
vi.mock("../client", async (orig) => ({ ...(await orig<typeof import("../client")>()), requestViaCard }));

const OFFICIAL = "official:me";
const cardData = (over: Record<string, unknown> = {}) => ({ cardId: "k1", subjectId: "u2", subjectHandle: "bob", expiresAt: Date.now() + 86_400_000, state: "active", ...over });
const official = (seq: number, kind: string, data: Record<string, unknown>): Msg => ({
  id: `official:${seq}`,
  seq,
  senderId: "official",
  role: "system",
  time: Date.now(),
  mine: false,
  payload: null,
  kind,
  data,
  status: "sent",
});

beforeEach(() => {
  setLang("en");
  requestViaCard.mockReset();
  useChat.setState({ ...initialState, phase: "ready", me: { userId: "me", handle: "me", role: "user", publicKey: "" } });
});

describe("the official conversation in the list", () => {
  it("is pinned above everything else, and not there before the first official message", () => {
    useChat.setState({ contacts: [{ userId: "p", handle: "peer", role: "user", convId: "c1", key: null }] });
    const { container, rerender } = render(<ContactsPane />);
    expect(screen.queryByText("Official")).toBeNull();
    useChat.setState({ official: OFFICIAL, unread: { [OFFICIAL]: 2 } });
    rerender(<ContactsPane />);
    const rows = [...container.querySelectorAll(".ch-row-title")].map((n) => n.textContent);
    expect(rows[0]).toBe("Official");
    expect(rows).toContain("@peer");
    expect(container.querySelector(".ch-pinned .ch-badge")?.textContent).toBe("2");
  });
});

describe("the official conversation on screen", () => {
  beforeEach(() => {
    useChat.setState({
      official: OFFICIAL,
      activeConv: OFFICIAL,
      messages: {
        [OFFICIAL]: [official(1, "contact_removed", { userId: "u3", handle: "cy", reason: "removed" }), official(2, "contact_removed", { userId: "u4", handle: "di", reason: "self_deleted" }), official(3, "contact_removed", { userId: "u5", handle: "ed", reason: "admin_deleted" })],
      },
    });
  });

  it("has no input box, no voice, no send button, and no info button", () => {
    render(<Conversation />);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Record a voice message" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Contact info" })).toBeNull();
    expect(screen.getByText("These are system messages. You cannot reply.")).toBeTruthy();
  });

  it("says what happened for each reason a contact was removed", () => {
    render(<Conversation />);
    expect(screen.getByText("@cy removed you from their contacts. The chat and its favourites are destroyed")).toBeTruthy();
    expect(screen.getByText("@di deleted their account. The chat with them can no longer be read")).toBeTruthy();
    expect(screen.getByText("@ed's account was deleted by the administrator. The chat with them can no longer be read")).toBeTruthy();
  });

  it("never shows one as an undecryptable message", () => {
    render(<Conversation />);
    expect(screen.queryByText("Message key destroyed")).toBeNull();
    expect(screen.queryByText("This message cannot be verified")).toBeNull();
  });
});

describe("a card message", () => {
  const show = (data: Record<string, unknown>, skew = 0) => {
    useChat.setState({ official: OFFICIAL, activeConv: OFFICIAL, clockSkew: skew, messages: { [OFFICIAL]: [official(1, "card", data)] } });
    return render(<Conversation />);
  };

  it("shows who it is for and when it expires, with a button while it is active", () => {
    show(cardData());
    expect(screen.getByText("@bob")).toBeTruthy();
    expect(screen.getByText(/^Valid until /)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add as contact" })).toBeTruthy();
  });

  it("uses the card when tapped, and says so once the request is sent", async () => {
    show(cardData());
    fireEvent.click(screen.getByRole("button", { name: "Add as contact" }));
    await waitFor(() => expect(requestViaCard).toHaveBeenCalledTimes(1));
    expect(requestViaCard.mock.calls[0][0]).toMatchObject({ kind: "card", seq: 1 });
    await screen.findByText("Request sent. Waiting for them to accept.");
    expect((screen.getByRole("button", { name: "Request sent. Waiting for them to accept." }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the server's reason when the card is refused", async () => {
    requestViaCard.mockRejectedValue(new ApiError(410, "gone", { reason: "expired" }));
    show(cardData());
    fireEvent.click(screen.getByRole("button", { name: "Add as contact" }));
    await screen.findByText("This card has expired.");
    expect(screen.getByRole("button", { name: "Add as contact" })).toBeTruthy(); // it can be tried again
  });

  it.each([
    ["used", undefined, "Used"],
    ["revoked", "revoked_by_admin", "Revoked by the administrator"],
    ["revoked", "already_contacts", "You are already contacts, so this card is cancelled"],
    ["revoked", "account_deleted", "That account was deleted, so this card is cancelled"],
  ])("a %s card (%s) has no button and says why", (state, reason, text) => {
    show(cardData({ state, reason }));
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add as contact" })).toBeNull();
  });

  it("when the two are already contacts, tapping shows a clear prompt, the card turns to revoked and the button is gone", async () => {
    requestViaCard.mockImplementation(async () => {
      useChat.setState((st) => ({ messages: { ...st.messages, [OFFICIAL]: st.messages[OFFICIAL].map((x) => ({ ...x, data: { ...x.data, state: "revoked", reason: "already_contacts" } })) } }));
      throw new ApiError(409, "conflict", { reason: "already_contacts" });
    });
    show(cardData());
    fireEvent.click(screen.getByRole("button", { name: "Add as contact" }));
    await screen.findByText("You are already contacts, so this card has been cancelled.");
    expect(screen.queryByRole("button", { name: "Add as contact" })).toBeNull();
    expect(document.querySelector(".ch-bad")).toBeNull(); // not the red conflict text
  });

  it("is expired once the server's clock passes expiresAt, whatever the device's clock says", () => {
    // The device clock is an hour behind the server's: the card's last minute is already over.
    show(cardData({ expiresAt: Date.now() + 30 * 60_000 }), 3_600_000);
    expect(screen.getByText("Expired")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add as contact" })).toBeNull();
  });

  it("an unreadable card or an unknown kind is a plain note, never a crash", () => {
    useChat.setState({ official: OFFICIAL, activeConv: OFFICIAL, messages: { [OFFICIAL]: [official(1, "card", { nope: 1 }), official(2, "something_new", {})] } });
    render(<Conversation />);
    expect(screen.getAllByText("This version cannot show this system message.")).toHaveLength(2);
  });
});

describe("who may add contacts, in the list", () => {
  const request = (viaCard: boolean) => ({ id: "r1", direction: "in" as const, status: "pending", user: { userId: "u2", handle: "bob" }, createdAt: 1, viaCard });

  it("offers adding a contact while allowed, and hides it when not", () => {
    const { rerender } = render(<ContactsPane />);
    expect(screen.getByRole("button", { name: "Add contact" })).toBeTruthy();
    useChat.setState({ account: { contactsBlocked: true, globalContactsBlocked: false, canAddContacts: false } });
    rerender(<ContactsPane />);
    expect(screen.queryByRole("button", { name: "Add contact" })).toBeNull();
    expect(screen.getByText("Your account cannot add contacts or be added for now.")).toBeTruthy();
    useChat.setState({ account: { contactsBlocked: false, globalContactsBlocked: true, canAddContacts: false } });
    rerender(<ContactsPane />);
    expect(screen.getByText("Adding contacts is turned off for now.")).toBeTruthy();
  });

  it("cannot accept an ordinary request while blocked (it can still be declined), but can accept one made with a card", () => {
    useChat.setState({ account: { contactsBlocked: true, globalContactsBlocked: false, canAddContacts: false }, requests: [request(false)] });
    const { rerender } = render(<ContactsPane />);
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
    expect(screen.getByRole("button", { name: "Decline" })).toBeTruthy();
    useChat.setState({ requests: [request(true)] });
    rerender(<ContactsPane />);
    expect(screen.getByRole("button", { name: "Accept" })).toBeTruthy();
    expect(screen.getByText("Asks to add you, using a contact card")).toBeTruthy();
  });
});

describe("a group is never offered more than 32 members", () => {
  const group = (max: number, n: number): Group => ({
    id: "g1",
    name: "team",
    ownerId: "me",
    gen: 1,
    max,
    needsRekey: false,
    pendingOwner: null,
    members: Array.from({ length: n }, (_, i) => ({ userId: i === 0 ? "me" : `u${i}`, handle: i === 0 ? "me" : `m${i}`, role: "user" })),
    keys: new Map(),
  });

  it("shows the count against 32 even if a server said more, and closes the invite at 32", () => {
    render(<GroupInfo group={group(128, 32)} onClose={() => {}} />);
    expect(screen.getByText("Members 32/32")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Invite" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("the texts of the new refusals", () => {
  const en = appMessages.en;
  const zh = appMessages.zh;
  it.each([
    ["forbidden", 403, "contacts_disabled"],
    ["forbidden", 403, "self_blocked"],
    ["forbidden", 403, "peer_blocked"],
    ["forbidden", 403, "official_readonly"],
    ["forbidden", 403, "not_recipient"],
    ["forbidden", 403, "revoked_by_admin"],
    ["conflict", 409, "used"],
    ["gone", 410, "expired"],
    ["not_found", 404, "card"],
    ["conflict", 409, "card_exists"],
    ["conflict", 409, "request_pending"],
  ] as const)("%s %i %s has its own text in both languages", (code, status, reason) => {
    for (const m of [en, zh]) {
      expect(errorOf(m, new ApiError(status, code, { reason }))).not.toBe(m.errors[code]);
    }
  });

  it("the two languages carry the same texts", () => {
    const keys = (o: object, p = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) => (typeof v === "object" && v !== null ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
    expect(keys(en).sort()).toEqual(keys(zh).sort());
  });
});

describe("a contact_declined message", () => {
  const declined = (data: Record<string, unknown>) =>
    useChat.setState({ official: OFFICIAL, activeConv: OFFICIAL, messages: { [OFFICIAL]: [official(1, "contact_declined", data)] } });

  it("says who declined, in both languages", () => {
    declined({ userId: "u2", handle: "bob" });
    const { unmount } = render(<Conversation />);
    expect(screen.getByText("@bob declined your request")).toBeTruthy();
    unmount();
    setLang("zh");
    render(<Conversation />);
    expect(screen.getByText("@bob 拒绝了你的联系人申请")).toBeTruthy();
  });

  it("a malformed one is a plain note", () => {
    declined({});
    render(<Conversation />);
    expect(screen.getByText("This version cannot show this system message.")).toBeTruthy();
  });
});

describe("the official badge", () => {
  it("is a fixed picture, the same wherever the official channel shows, and not any user's avatar", async () => {
    const { Avatar } = await import("../components/ui");
    const { avatarUri, officialBadgeSvg } = await import("../avatar");
    const { container } = render(<Avatar userId="official" size={30} admin />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe(avatarUri("official"));
    expect(img.className).toBe("ch-avatar-official"); // no ring, not gold even if asked
    const svg = officialBadgeSvg();
    expect(svg).toContain("#4285F4");
    expect(svg).toContain('stroke="#fff"'); // the check mark
    expect((svg.match(/,/g) ?? []).length).toBeGreaterThanOrEqual(24); // 12 points, outer and inner vertex each
    expect(avatarUri("some-user")).not.toBe(avatarUri("official"));
  });

  it("the list entry, the header and the message cards all wear it", () => {
    useChat.setState({ official: OFFICIAL, activeConv: OFFICIAL, messages: { [OFFICIAL]: [official(1, "card", cardData())] } });
    const { container } = render(
      <>
        <ContactsPane />
        <Conversation />
      </>,
    );
    expect(container.querySelectorAll("img.ch-avatar-official").length).toBeGreaterThanOrEqual(3);
  });
});

describe("the tab title count", () => {
  it("counts only conversations the list shows, and the official one among them", async () => {
    const { totalUnread } = await import("../store");
    const base = { contacts: [{ userId: "p", handle: "p", role: "user", convId: "c1", key: null }], groups: [], official: OFFICIAL };
    expect(totalUnread({ ...base, unread: { c1: 2, [OFFICIAL]: 1, gone: 5 } })).toBe(3);
    expect(totalUnread({ ...base, unread: { c1: 0, [OFFICIAL]: 0, gone: 5 } })).toBe(0);
  });
});

describe("administrators in the contact list", () => {
  it("carry the administrator badge, ordinary contacts and the official channel do not", () => {
    useChat.setState({
      official: OFFICIAL,
      contacts: [
        { userId: "a", handle: "boss", role: "admin", convId: "c1", key: null },
        { userId: "p", handle: "peer", role: "user", convId: "c2", key: null },
      ],
    });
    const { container } = render(<ContactsPane />);
    const badges = [...container.querySelectorAll(".ch-row-title .ch-admin")];
    expect(badges).toHaveLength(1);
    expect(badges[0].closest(".ch-row-title")?.textContent).toContain("@boss");
  });
});
