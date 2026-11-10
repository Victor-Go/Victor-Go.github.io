import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ManagementPage } from "../components/ManagementPage";
import { SettingsFlow } from "../components/SettingsPage";
import { TitleBadge } from "../components/ui";
import { unlockedNow } from "../adminLock";
import { applyConfig } from "../client";
import { ApiError } from "../net/api";
import { setLang } from "../lang";
import { PATH, go } from "../route";
import { badgeOf, hasPermission, initialState, useChat, type Group } from "../store";

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
vi.mock("../client", async (orig) => ({ ...(await orig<typeof import("../client")>()), rawApi: () => fake }));

/** Test fixture only: what a server might list for an account. The client keeps no list of its own. */
const EVERYTHING = ["audit", "cards", "config", "epochs", "groups.create", "groups.delete_any", "invites", "jobs", "starter", "status", "users.manage", "users.read", "wipe", "wipe_all"];
const as = (permissions: string[], title = "admin") =>
  useChat.setState({ ...initialState, phase: "ready", me: { userId: "a", handle: "boss", role: "admin", publicKey: "" }, title, permissions });

beforeEach(() => {
  setLang("en");
  calls.length = 0;
  answers = {};
  failures = {};
  unlockedNow();
  as(EVERYTHING);
});

describe("the badge, from the administrator list", () => {
  const admins = { o1: "owner", a1: "admin", x1: "council" };

  it("owner is gold, admin is the plain badge", () => {
    expect(badgeOf(admins, "o1")).toBe("owner");
    expect(badgeOf(admins, "a1")).toBe("admin");
  });
  it("an unknown title falls back to the plain badge", () => {
    expect(badgeOf(admins, "x1")).toBe("admin");
    expect(badgeOf({ y: "" }, "y")).toBe("admin");
  });
  it("a sender that is not listed but has the admin role gets the plain badge; nobody else gets one", () => {
    expect(badgeOf(admins, "zz", "admin")).toBe("admin");
    expect(badgeOf(admins, "zz", "user")).toBe("none");
    expect(badgeOf(admins, undefined)).toBe("none");
  });
  it("the list decides over the role (an owner whose message says admin)", () => {
    expect(badgeOf(admins, "o1", "admin")).toBe("owner");
  });
  it("names like prototype keys are not administrators", () => {
    expect(badgeOf({}, "constructor")).toBe("none");
    expect(badgeOf({}, "__proto__")).toBe("none");
  });

  it("renders 负责人/Owner with the gold class and 管理员/Admin plain, and a hostile title only as plain text", () => {
    useChat.setState({ admins: { o1: "owner", a1: "admin", h1: "<img src=x onerror=alert(1)>" } });
    const { container } = render(
      <>
        <TitleBadge userId="o1" role="admin" />
        <TitleBadge userId="a1" role="admin" />
        <TitleBadge userId="h1" role="admin" />
        <TitleBadge userId="u1" role="user" />
      </>,
    );
    const badges = [...container.querySelectorAll(".ch-admin")];
    expect(badges.map((b) => b.textContent)).toEqual(["Owner", "Admin", "Admin"]);
    expect(badges[0].classList.contains("ch-owner")).toBe(true);
    expect(badges[1].classList.contains("ch-owner")).toBe(false);
    expect(container.querySelector("img")).toBeNull();
  });
  it("says 负责人 in Chinese", () => {
    setLang("zh");
    useChat.setState({ admins: { o1: "owner" } });
    render(<TitleBadge userId="o1" />);
    expect(screen.getByText("负责人")).toBeTruthy();
  });
});

describe("the account's title and permissions come from the server's config", () => {
  it("applyConfig takes them, and a later config without them clears them", () => {
    applyConfig({ title: "owner", permissions: ["status", "starter"] });
    expect(useChat.getState().title).toBe("owner");
    expect(hasPermission(useChat.getState(), "starter")).toBe(true);
    expect(hasPermission(useChat.getState(), "wipe_all")).toBe(false);
    applyConfig({ title: "", permissions: [] });
    expect(useChat.getState().permissions).toEqual([]);
    applyConfig({ permissions: ["a", 3, null] as unknown as string[] });
    expect(useChat.getState().permissions).toEqual(["a"]);
  });
});

describe("what the management page shows follows the permissions", () => {
  it("no permission: no management at all", () => {
    as([]);
    render(<ManagementPage />);
    expect(screen.getByText("You are not an administrator.")).toBeTruthy();
  });
  it("shows exactly the entries listed", () => {
    as(["users.read", "starter", "status"]);
    render(<ManagementPage />);
    expect(screen.getByText("Users")).toBeTruthy();
    expect(screen.getByText("Starter administrator")).toBeTruthy();
    expect(screen.getByText("Status")).toBeTruthy();
    expect(screen.queryByText("Invites")).toBeNull();
    expect(screen.queryByText("Configuration")).toBeNull();
    expect(screen.queryByText("Audit log")).toBeNull();
  });
  it("an address for a page without its permission shows the menu, not the page", () => {
    as(["users.read"]);
    go(PATH.managementPage("invites"));
    render(<ManagementPage />);
    expect(screen.getByText("Users")).toBeTruthy();
    expect(calls).toHaveLength(0);
  });
  it("wipe everything is offered only with wipe_all", async () => {
    answers = { "GET /admin/config": { inviteRequired: true, registrationOpen: true, fileEnabled: true, groupMax: 32, retentionDays: 30, favoriteMax: 10, fileMonthlyMB: 100, globalContactsBlocked: false } };
    as(["config"]);
    go(PATH.managementPage("config"));
    const { unmount } = render(<ManagementPage />);
    await screen.findByText("Block adding contacts for everyone");
    expect(screen.queryByText("Wipe everything (admin too)")).toBeNull();
    unmount();
    as(["config", "wipe_all"]);
    render(<ManagementPage />);
    expect(await screen.findByText("Wipe everything (admin too)")).toBeTruthy();
  });
});

describe("the rows of the user list", () => {
  const row = (over: Record<string, unknown>) => ({ userId: "u2", handle: "bob", role: "user", title: "", createdAt: 1, lastLoginAt: 1, lastActiveAt: 1, ips: [], loginCount: 1, failedCount: 0, suspended: false, ...over });

  it("shows exactly the buttons whose action is true", async () => {
    go(PATH.managementPage("users/user"), row({ actions: { resetFailures: true, logout: false, suspend: true, contactsBlocked: false, delete: false } }));
    render(<ManagementPage />);
    await screen.findByText("@bob");
    expect(screen.getByText("Reset failures")).toBeTruthy();
    expect(screen.getByText("Suspend")).toBeTruthy();
    expect(screen.queryByText("Force sign-out")).toBeNull();
    expect(screen.queryByText("Delete account")).toBeNull();
    expect(screen.queryByRole("switch", { name: "Block adding contacts" })).toBeNull();
  });
  it("another administrator: only the failure reset, with the title badge", async () => {
    useChat.setState({ admins: { u2: "owner" } });
    go(PATH.managementPage("users/user"), row({ role: "admin", title: "owner", actions: { resetFailures: true, logout: false, suspend: false, contactsBlocked: false, delete: false } }));
    render(<ManagementPage />);
    await screen.findByText("@bob");
    expect(screen.getByText("Reset failures")).toBeTruthy();
    expect(screen.queryByText("Suspend")).toBeNull();
    expect(screen.queryByText("Delete account")).toBeNull();
    expect(screen.queryByText("Send contact card")).toBeNull();
    expect(document.querySelector(".ch-owner")).not.toBeNull();
  });
  it("a row without `actions` offers nothing", async () => {
    go(PATH.managementPage("users/user"), row({}));
    render(<ManagementPage />);
    await screen.findByText("@bob");
    expect(screen.queryByText("Reset failures")).toBeNull();
    expect(screen.queryByText("Delete account")).toBeNull();
  });
});

describe("the invites page and administrator invites", () => {
  it("shows the masked code, the badge and the hint, and no copy or revoke button", async () => {
    answers = {
      "GET /admin/invites": {
        invites: [
          { id: "i1", note: "second admin", createdAt: 5, expiresAt: 9, code: "********", uses: [], contactsBlocked: false, adminInvite: true, title: "owner", revocable: false },
          { id: "i2", note: "friend", createdAt: 3, expiresAt: 8, code: "CODE-2", uses: [], contactsBlocked: false, adminInvite: false, revocable: true },
        ],
      },
    };
    go(PATH.managementPage("invites"));
    render(<ManagementPage />);
    await screen.findByText("second admin");
    expect(screen.getByText("********")).toBeTruthy();
    expect(screen.getByText("Administrator invites are made and revoked with the AWS function")).toBeTruthy();
    expect(document.querySelector(".ch-owner")).not.toBeNull();
    // one copy and one revoke button: the ordinary invite's
    expect(screen.getAllByText("Copy")).toHaveLength(1);
    expect(screen.getAllByText("Revoke")).toHaveLength(1);
  });
});

describe("the starter administrator", () => {
  beforeEach(() => {
    answers = { "GET /admin/starter": { explicit: true, userId: "a2", handle: "second" } };
    go(PATH.managementPage("starter"));
  });
  const edit = () => fireEvent.click(screen.getByText("Edit"));
  const save = () => fireEvent.click(screen.getByText("Save"));
  const puts = () => calls.filter(([m, p]) => m === "PUT" && p === "/admin/starter").map((c) => c[2]);

  it("the page is read-only; Edit opens a dialog; Cancel closes it without a request and discards what was typed", async () => {
    render(<ManagementPage />);
    await screen.findByText("@second");
    expect(screen.queryByLabelText("Administrator's username")).toBeNull();
    expect(screen.queryByText("Save")).toBeNull();
    edit();
    expect(screen.getByRole("dialog")).toBeTruthy();
    const input = screen.getByLabelText("Administrator's username") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "typed" } });
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByLabelText("Administrator's username")).toBeNull();
    edit();
    expect((screen.getByLabelText("Administrator's username") as HTMLInputElement).value).toBe("second");
    expect(puts()).toEqual([]);
  });
  it("Escape closes the dialog", async () => {
    render(<ManagementPage />);
    await screen.findByText("@second");
    edit();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(puts()).toEqual([]);
  });
  it("Save is disabled while the request is in flight, and Enter saves", async () => {
    let release: (v: unknown) => void = () => {};
    fake.put = () => new Promise((r) => (release = r)) as never;
    render(<ManagementPage />);
    await screen.findByText("@second");
    edit();
    fireEvent.keyDown(screen.getByLabelText("Administrator's username"), { key: "Enter" });
    await waitFor(() => expect((screen.getByRole("button", { name: "Working…" }) as HTMLButtonElement).disabled).toBe(true));
    release({});
    fake.put = (path: string, body?: unknown) => handle("PUT", path, body);
  });
  it("a saved handle closes the dialog and updates the current row", async () => {
    answers = { "GET /admin/starter": { explicit: true, userId: "a2", handle: "second" } };
    render(<ManagementPage />);
    await screen.findByText("@second");
    edit();
    fireEvent.change(screen.getByLabelText("Administrator's username"), { target: { value: "boss" } });
    answers = { "GET /admin/starter": { explicit: true, userId: "a3", handle: "boss" }, "PUT /admin/starter": {} };
    save();
    await screen.findByText("@boss");
    expect(screen.queryByLabelText("Administrator's username")).toBeNull();
  });
  it("a failed save keeps the dialog open with the error inside it", async () => {
    failures["PUT /admin/starter"] = new ApiError(404, "not_found");
    render(<ManagementPage />);
    await screen.findByText("@second");
    edit();
    save();
    const message = await screen.findByText("There is no such user.");
    expect(message.closest("[role=dialog]")).not.toBeNull();
    expect(screen.getByLabelText("Administrator's username")).toBeTruthy();
  });
  it("shows the current one and saves a handle", async () => {
    render(<ManagementPage />);
    await screen.findByText("@second");
    edit();
    const input = screen.getByLabelText("Administrator's username") as HTMLInputElement;
    expect(input.value).toBe("second");
    fireEvent.change(input, { target: { value: "boss" } });
    save();
    await waitFor(() => expect(puts()).toEqual([{ handle: "boss" }]));
  });
  it("an empty handle resets to the default", async () => {
    render(<ManagementPage />);
    await screen.findByText("@second");
    edit();
    fireEvent.change(screen.getByLabelText("Administrator's username"), { target: { value: "" } });
    save();
    await waitFor(() => expect(puts()).toEqual([{ handle: "" }]));
  });
  it("404 not_found: no such user", async () => {
    failures["PUT /admin/starter"] = new ApiError(404, "not_found");
    render(<ManagementPage />);
    await screen.findByText("@second");
    edit();
    fireEvent.change(screen.getByLabelText("Administrator's username"), { target: { value: "nobody" } });
    save();
    await screen.findByText("There is no such user.");
  });
  it("409 conflict not_admin: not an administrator", async () => {
    failures["PUT /admin/starter"] = new ApiError(409, "conflict", { reason: "not_admin" });
    render(<ManagementPage />);
    await screen.findByText("@second");
    edit();
    fireEvent.change(screen.getByLabelText("Administrator's username"), { target: { value: "bob" } });
    save();
    await screen.findByText("That user is not an administrator (or is suspended).");
  });
  it("anything else: the general error; and a success shows no message", async () => {
    failures["PUT /admin/starter"] = new ApiError(500, "internal");
    render(<ManagementPage />);
    await screen.findByText("@second");
    edit();
    save();
    await screen.findByText("The server hit an error. Please try again later.");
  });
  it("without the starter permission the page is not shown", () => {
    as(["users.read"]);
    render(<ManagementPage />);
    expect(screen.queryByLabelText("Administrator's username")).toBeNull();
  });
});

describe("an administrator deleting their own account", () => {
  const group = (id: string, ownerId: string): Group => ({ id, name: id, ownerId, gen: 0, max: 32, needsRekey: false, pendingOwner: null, members: [], keys: new Map() });

  it("is offered, and says how many groups they own go with it", () => {
    useChat.setState({ groups: [group("g1", "a"), group("g2", "a"), group("g3", "other")] });
    go(PATH.settingsDetail("delete"));
    render(<SettingsFlow />);
    expect(screen.getByText(/You own 2 groups/)).toBeTruthy();
  });
  it("the settings list offers the deletion to an administrator and hides the rename", () => {
    go(PATH.settings);
    render(<SettingsFlow />);
    expect(screen.getAllByText("Delete account").length).toBeGreaterThan(0);
    expect(screen.queryByText("Username")).toBeNull();
  });
});
