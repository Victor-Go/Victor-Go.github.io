import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ManagementPage } from "../components/ManagementPage";
import { unlockedNow } from "../adminLock";
import { ApiError } from "../net/api";
import { setLang } from "../lang";
import { PATH, go } from "../route";
import { initialState, useChat } from "../store";

type Call = [string, string, unknown?];
const calls: Call[] = [];
let answers: Record<string, unknown> = {};
let failures: Record<string, Error> = {};

const handle = (method: string, path: string, body?: unknown) => {
  calls.push([method, path, body]);
  const failure = failures[`${method} ${path}`];
  if (failure) return Promise.reject(failure);
  const key = Object.keys(answers).find((k) => `${method} ${path}`.startsWith(k));
  return Promise.resolve(key ? answers[key] : {});
};
const fake = {
  get: (path: string) => handle("GET", path),
  post: (path: string, body?: unknown) => handle("POST", path, body),
  put: (path: string, body?: unknown) => handle("PUT", path, body),
};
const lookupUser = vi.hoisted(() => vi.fn());
vi.mock("../client", async (orig) => ({ ...(await orig<typeof import("../client")>()), rawApi: () => fake, lookupUser }));

/** Test fixture only: what a server might list. The client keeps no such list. */
const PERMISSIONS = ["audit", "cards", "config", "epochs", "groups.create", "groups.delete_any", "invites", "jobs", "starter", "status", "users.manage", "users.read", "wipe", "wipe_all"];
const ALL_ACTIONS = { resetFailures: true, logout: true, suspend: true, contactsBlocked: true, delete: true };
const user = { userId: "u2", handle: "bob", role: "user", title: "", actions: ALL_ACTIONS, createdAt: 1, lastLoginAt: 1, lastActiveAt: 1, ips: [], loginCount: 1, failedCount: 0, suspended: false, contactsBlocked: false };
const post = (path: string) => calls.filter(([m, p]) => m === "POST" && p === path).map((c) => c[2]);

beforeEach(() => {
  setLang("en");
  calls.length = 0;
  answers = {};
  failures = {};
  unlockedNow();
  useChat.setState({ ...initialState, phase: "ready", me: { userId: "a", handle: "victor", role: "admin", publicKey: "" }, title: "admin", permissions: PERMISSIONS });
});

describe("creating an invite", () => {
  beforeEach(() => {
    answers = { "GET /admin/invites": { invites: [] } };
    go(PATH.managementPage("invites"));
  });

  it("sends expiresInDays (default 7) and contactsBlocked (default false), and no expiresAt", async () => {
    render(<ManagementPage />);
    fireEvent.click(await screen.findByText("Create invite"));
    await waitFor(() => expect(post("/admin/invites")).toHaveLength(1));
    expect(post("/admin/invites")[0]).toEqual({ note: "", expiresInDays: 7, contactsBlocked: false });
  });

  it("sends what was chosen, and keeps the days within 1 to 30", async () => {
    render(<ManagementPage />);
    const days = (await screen.findByLabelText("Valid days (1–30)")) as HTMLInputElement;
    fireEvent.change(days, { target: { value: "99" } });
    expect(days.value).toBe("30");
    fireEvent.change(days, { target: { value: "0" } });
    expect(days.value).toBe("1");
    fireEvent.change(days, { target: { value: "12" } });
    fireEvent.click(screen.getByRole("switch", { name: "New account cannot add or be added as contact" }));
    fireEvent.click(screen.getByText("Create invite"));
    await waitFor(() => expect(post("/admin/invites")).toHaveLength(1));
    expect(post("/admin/invites")[0]).toEqual({ note: "", expiresInDays: 12, contactsBlocked: true });
  });

  it("shows in the list which invites start an account with contacts blocked", async () => {
    answers = {
      "GET /admin/invites": {
        invites: [
          { id: "i1", note: "for ann", createdAt: 1, expiresAt: 2, code: "CODE-1", uses: [], contactsBlocked: true },
          { id: "i2", note: "for bo", createdAt: 3, expiresAt: 4, code: "CODE-2", uses: [], contactsBlocked: false },
        ],
      },
    };
    render(<ManagementPage />);
    await screen.findByText("CODE-1");
    expect(screen.getAllByText("Account registered with this invite: contacts blocked")).toHaveLength(1);
  });
});

describe("the contact switches", () => {
  it("a user can be blocked from adding contacts, and the switch follows the server's yes", async () => {
    go(PATH.managementPage("users/user"), user);
    render(<ManagementPage />);
    const sw = await screen.findByRole("switch", { name: "Block adding contacts" });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(sw);
    await waitFor(() => expect(post("/admin/users/u2/contacts-blocked")).toEqual([{ blocked: true }]));
    await waitFor(() => expect(screen.getByRole("switch", { name: "Block adding contacts" }).getAttribute("aria-checked")).toBe("true"));
  });

  it("an administrator row has no such switch", async () => {
    go(PATH.managementPage("users/user"), { ...user, userId: "a", role: "admin", title: "admin", actions: { resetFailures: true, logout: false, suspend: false, contactsBlocked: false, delete: false } });
    render(<ManagementPage />);
    await screen.findByText("@bob");
    expect(screen.queryByRole("switch", { name: "Block adding contacts" })).toBeNull();
  });

  it("the global switch is part of the config that is saved", async () => {
    answers = { "GET /admin/config": { inviteRequired: true, registrationOpen: true, fileEnabled: true, groupMax: 32, retentionDays: 30, favoriteMax: 10, globalContactsBlocked: false }, "PUT /admin/config": { inviteRequired: true, registrationOpen: true, fileEnabled: true, groupMax: 32, retentionDays: 30, favoriteMax: 10, globalContactsBlocked: true } };
    go(PATH.managementPage("config"));
    render(<ManagementPage />);
    fireEvent.click(await screen.findByRole("switch", { name: "Block adding contacts for everyone" }));
    await waitFor(() => expect(calls.some(([m, p]) => m === "PUT" && p === "/admin/config")).toBe(true));
    const put = calls.find(([m, p]) => m === "PUT" && p === "/admin/config")![2] as Record<string, unknown>;
    expect(put.globalContactsBlocked).toBe(true);
    expect(put.groupMax).toBe(32);
  });

  const puts = () => calls.filter(([m, p]) => m === "PUT" && p === "/admin/config");
  const openConfig = async (groupMax = 10) => {
    answers = {
      "GET /admin/config": { inviteRequired: true, registrationOpen: true, fileEnabled: true, groupMax, retentionDays: 30, favoriteMax: 10, fileMonthlyMB: 100, globalContactsBlocked: false },
      "PUT /admin/config": { inviteRequired: true, registrationOpen: true, fileEnabled: true, groupMax: 32, retentionDays: 30, favoriteMax: 10, fileMonthlyMB: 100, globalContactsBlocked: false },
    };
    go(PATH.managementPage("config"));
    render(<ManagementPage />);
  };

  it("a number is applied when the field loses focus, not while typing, and is kept inside its range", async () => {
    await openConfig();
    const input = (await screen.findByLabelText("Group size limit (max 32)")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "100" } });
    expect(puts()).toHaveLength(0);
    fireEvent.blur(input);
    await waitFor(() => expect(puts()).toHaveLength(1), { timeout: 4000 });
    expect((puts()[0][2] as { groupMax: number }).groupMax).toBe(32);
  });

  it("shows a number in its plain form (050 becomes 50) and sends that", async () => {
    await openConfig();
    answers["PUT /admin/config"] = { ...(answers["GET /admin/config"] as object), favoriteMax: 50 }; // what the server answers: the saved settings
    const input = (await screen.findByLabelText(/Favourites per person/)) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "050" } });
    fireEvent.blur(input);
    await waitFor(() => expect(puts()).toHaveLength(1), { timeout: 4000 });
    expect((puts()[0][2] as { favoriteMax: number }).favoriteMax).toBe(50);
    expect(input.value).toBe("50");
  });

  it("after a save a dialog tells the new settings, and closes", async () => {
    await openConfig();
    answers["PUT /admin/config"] = { ...(answers["GET /admin/config"] as object), favoriteMax: 50 };
    const input = (await screen.findByLabelText(/Favourites per person/)) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "50" } });
    fireEvent.blur(input);
    const dialog = await screen.findByRole("alertdialog", { name: "Settings saved" });
    expect(dialog.textContent).toContain("Favourites per person");
    expect(dialog.textContent).toContain("50");
    expect(dialog.textContent).not.toContain("File uploads per person per month"); // only what changed is listed
    expect(dialog.textContent).not.toContain("Group size limit");
    fireEvent.click(screen.getAllByRole("button", { name: "Close" }).at(-1)!);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("an empty entry puts the old value back and sends nothing; the monthly file limit stops at 256", async () => {
    await openConfig();
    const fav = (await screen.findByLabelText(/Favourites per person/)) as HTMLInputElement;
    fireEvent.change(fav, { target: { value: "" } });
    fireEvent.blur(fav);
    expect(fav.value).toBe("10");
    const files = screen.getByLabelText(/File uploads per person per month/) as HTMLInputElement;
    fireEvent.change(files, { target: { value: "9999" } });
    fireEvent.blur(files);
    await waitFor(() => expect(puts()).toHaveLength(1), { timeout: 4000 });
    expect(files.value).toBe("256");
    expect((puts()[0][2] as { fileMonthlyMB: number }).fileMonthlyMB).toBe(256);
  });
});

describe("contact cards", () => {
  const card = { id: "k1", recipientId: "u1", recipientHandle: "ann", subjectId: "u2", subjectHandle: "bob", createdAt: 1, expiresAt: 2 };
  beforeEach(() => {
    answers = {
      "GET /admin/cards": { total: 1, cards: [card] },
      "GET /admin/users?q=ann": { users: [{ ...user, userId: "u1", handle: "Ann" }, { ...user, userId: "u9", handle: "Annabel" }], total: 2 },
      "GET /admin/users?q=bob": { users: [{ ...user, userId: "u2", handle: "bob" }], total: 1 },
      "GET /admin/users?q=nobody": { users: [], total: 0 },
    };
    go(PATH.managementPage("cards"));
  });

  it("lists the active cards and revokes one", async () => {
    render(<ManagementPage />);
    await screen.findByText("@bob → @ann");
    fireEvent.click(screen.getByText("Revoke"));
    await waitFor(() => expect(calls.some(([m, p]) => m === "POST" && p === "/admin/cards/k1/revoke")).toBe(true));
  });

  it("issues a card for two usernames (3 days unless changed), finding their ids by exact username", async () => {
    render(<ManagementPage />);
    fireEvent.change(await screen.findByLabelText("Recipient username"), { target: { value: "ann" } });
    fireEvent.change(screen.getByLabelText("Username on the card"), { target: { value: "bob" } });
    expect((screen.getByLabelText("Valid days (1–30)") as HTMLInputElement).value).toBe("3");
    fireEvent.click(screen.getByText("Issue card"));
    await waitFor(() => expect(post("/admin/cards")).toHaveLength(1));
    expect(post("/admin/cards")[0]).toEqual({ recipientId: "u1", subjectId: "u2", expiresInDays: 3 });
  });

  it("says which username was not found and issues nothing", async () => {
    render(<ManagementPage />);
    fireEvent.change(await screen.findByLabelText("Recipient username"), { target: { value: "ann" } });
    fireEvent.change(screen.getByLabelText("Username on the card"), { target: { value: "nobody" } });
    fireEvent.click(screen.getByText("Issue card"));
    await screen.findByText("The username on the card was not found.");
    expect(post("/admin/cards")).toHaveLength(0);
  });
});

describe("sending a contact card from a user page", () => {
  beforeEach(() => {
    lookupUser.mockReset();
    lookupUser.mockResolvedValue({ userId: "u2", handle: "bob", role: "user" });
    go(PATH.managementPage("users/user"), { ...user, userId: "u1", handle: "ann" });
  });

  const open = async () => {
    render(<ManagementPage />);
    fireEvent.click(await screen.findByText("Send contact card"));
    return screen.findByLabelText("Username on the card");
  };
  const fill = async (name: string) => fireEvent.change(await open(), { target: { value: name } });

  it("names the recipient and has no list of candidates and no search", async () => {
    await fill("bobby");
    expect(screen.getByText("Recipient: @ann")).toBeTruthy();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.queryAllByRole("button", { name: /^@/ })).toHaveLength(0);
    expect(calls.some(([m, p]) => m === "GET" && p.startsWith("/admin/users?q="))).toBe(false);
    expect((screen.getByText("Send") as HTMLButtonElement).disabled).toBe(false);
  });

  it("looks the exact name up with the usual work, then issues the card (3 days unless changed) and shows success", async () => {
    await fill("bob");
    fireEvent.click(screen.getByText("Send"));
    await screen.findByText("The card of @bob was sent to @ann (they get it as an official message).");
    expect(lookupUser).toHaveBeenCalledWith("bob", expect.any(Function));
    expect(post("/admin/cards")).toEqual([{ recipientId: "u1", subjectId: "u2", expiresInDays: 3 }]);
  });

  it("keeps the days within 1 to 30", async () => {
    await fill("bob");
    fireEvent.change(screen.getByLabelText("Valid days (1–30)"), { target: { value: "45" } });
    fireEvent.click(screen.getByText("Send"));
    await waitFor(() => expect(post("/admin/cards")).toHaveLength(1));
    expect((post("/admin/cards")[0] as { expiresInDays: number }).expiresInDays).toBe(30);
  });

  it("a name that does not exist gets the add-contact text, and nothing is issued", async () => {
    lookupUser.mockRejectedValue(new ApiError(404, "not_found", { reason: "handle" }));
    await fill("nobody");
    fireEvent.click(screen.getByText("Send"));
    await screen.findByText("No account with that username was found.");
    expect(post("/admin/cards")).toHaveLength(0);
  });

  it("refuses the recipient or an administrator as the person on the card, before anything is issued", async () => {
    lookupUser.mockResolvedValue({ userId: "u1", handle: "ann" });
    await fill("ann");
    fireEvent.click(screen.getByText("Send"));
    await screen.findByText("Something looks wrong. Please check and try again.");
    lookupUser.mockResolvedValue({ userId: "u7", handle: "boss", role: "admin" });
    fireEvent.change(screen.getByLabelText("Username on the card"), { target: { value: "boss" } });
    fireEvent.click(screen.getByText("Send"));
    await waitFor(() => expect(lookupUser).toHaveBeenCalledTimes(2));
    expect(post("/admin/cards")).toHaveLength(0);
  });

  it.each([
    [409, "conflict", "already_contacts", "You are already contacts."],
    [409, "conflict", "request_pending", "A contact request between them is already waiting."],
    [409, "conflict", "card_exists", "This recipient already has an active card of that person."],
    [404, "not_found", "recipient", "The recipient's username was not found."],
    [404, "not_found", "subject", "The username on the card was not found."],
    [400, "bad_request", undefined, "Something looks wrong. Please check and try again."],
  ] as const)("shows a readable message for %i %s %s", async (status, code, reason, text) => {
    failures["POST /admin/cards"] = new ApiError(status, code, reason ? { reason } : {});
    await fill("bob");
    fireEvent.click(screen.getByText("Send"));
    await screen.findByText(text);
  });

  it("an administrator page has no such button", async () => {
    go(PATH.managementPage("users/user"), { ...user, userId: "a", role: "admin", title: "admin", actions: { resetFailures: true, logout: false, suspend: false, contactsBlocked: false, delete: false } });
    render(<ManagementPage />);
    await screen.findByText("@bob");
    expect(screen.queryByText("Send contact card")).toBeNull();
  });
});
