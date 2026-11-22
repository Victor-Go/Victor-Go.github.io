import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ManagementPage } from "../components/ManagementPage";
import { unlockedNow } from "../adminLock";
import { setLang } from "../lang";
import { PATH, go } from "../route";
import { initialState, useChat } from "../store";

const calls: [string, string][] = [];
let answers: Record<string, unknown> = {};
const handle = (method: string, path: string) => {
  calls.push([method, path]);
  const key = Object.keys(answers).find((k) => `${method} ${path}`.startsWith(k));
  return Promise.resolve(key ? answers[key] : {});
};
const fake = { get: (p: string) => handle("GET", p), post: (p: string) => handle("POST", p), put: (p: string) => handle("PUT", p) };
const adminDeleteUser = vi.hoisted(() => vi.fn(async (_id: string, _handle: string) => {}));
vi.mock("../client", async (orig) => ({ ...(await orig<typeof import("../client")>()), rawApi: () => fake, adminDeleteUser }));

const user = {
  userId: "u2", handle: "bob", role: "user", title: "", actions: { resetFailures: true, logout: true, suspend: true, contactsBlocked: true, canCall: true, delete: true },
  createdAt: 1, lastLoginAt: 1, lastActiveAt: 1, ips: [], loginCount: 1, failedCount: 0, suspended: false, contactsBlocked: false, canCall: false,
};

beforeEach(() => {
  setLang("en");
  calls.length = 0;
  answers = { "GET /admin/users": { users: [], total: 0 } };
  adminDeleteUser.mockClear();
  unlockedNow();
  useChat.setState({ ...initialState, phase: "ready", me: { userId: "a", handle: "victor", role: "admin", publicKey: "" }, title: "admin", permissions: ["users.read", "users.manage", "epochs", "wipe"] });
});
afterEach(cleanup);

describe("the management page asks in our own dialogs, never the browser's", () => {
  it("deleting an account needs the name typed; nothing is sent before", async () => {
    const natives = [vi.spyOn(window, "confirm"), vi.spyOn(window, "prompt"), vi.spyOn(window, "alert")];
    go(PATH.managementPage("users/user"), user);
    render(<ManagementPage />);
    fireEvent.click(await screen.findByText("Delete account"));
    const confirmButton = () => screen.getAllByText("Delete account").at(-1)!.closest("button") as HTMLButtonElement;
    expect(confirmButton().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Type the username to confirm"), { target: { value: "bo" } });
    expect(confirmButton().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Type the username to confirm"), { target: { value: "bob" } });
    expect(confirmButton().disabled).toBe(false);
    expect(adminDeleteUser).not.toHaveBeenCalled();
    fireEvent.click(confirmButton());
    await waitFor(() => expect(adminDeleteUser).toHaveBeenCalledWith("u2", "bob"));
    for (const n of natives) expect(n).not.toHaveBeenCalled();
  });

  it("destroying a key asks first", async () => {
    const native = vi.spyOn(window, "confirm");
    answers = {
      ...answers,
      "GET /admin/epochs": {
        retentionDays: 30,
        messages: [{ id: 1, current: false, replacement: false, createdAt: 1, expiresAt: 2 }],
        favorites: [],
      },
    };
    go(PATH.managementPage("epochs"));
    render(<ManagementPage />);
    fireEvent.click(await screen.findByText("Destroy"));
    expect(screen.getByRole("dialog").textContent).toMatch(/can never be opened/);
    expect(calls.some(([m, p]) => m === "POST" && p.endsWith("/revoke"))).toBe(false);
    fireEvent.click(screen.getByText("Cancel"));
    expect(calls.some(([m, p]) => m === "POST" && p.endsWith("/revoke"))).toBe(false);
    fireEvent.click(await screen.findByText("Destroy"));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Destroy" }));
    await waitFor(() => expect(calls.some(([m, p]) => m === "POST" && p === "/admin/epochs/1/revoke")).toBe(true));
    expect(native).not.toHaveBeenCalled();
  });
});
