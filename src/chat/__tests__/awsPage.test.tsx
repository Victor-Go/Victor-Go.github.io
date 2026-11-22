import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ManagementPage } from "../components/ManagementPage";
import { unlockedNow } from "../adminLock";
import { ApiError } from "../net/api";
import { setLang } from "../lang";
import { PATH, go } from "../route";
import { initialState, useChat } from "../store";

type Call = [string, string];
const calls: Call[] = [];
let answers: Record<string, unknown> = {};
const handle = (method: string, path: string) => {
  calls.push([method, path]);
  const answer = answers[`${method} ${path}`];
  return Promise.resolve(typeof answer === "function" ? (answer as () => unknown)() : (answer ?? {}));
};
const fake = { get: (p: string) => handle("GET", p), post: (p: string) => handle("POST", p), put: (p: string) => handle("PUT", p) };
vi.mock("../client", async (orig) => ({ ...(await orig<typeof import("../client")>()), rawApi: () => fake }));

const snapshot = {
  fetchedAt: Date.now() - 3_600_000,
  lambdas: [{ name: "chat-api", invocations: 1200, errors: 2, throttles: 0, avgMs: 38, maxMs: 410 }],
  tables: [{ name: "chat-main", readProvisioned: 16, writeProvisioned: 16, items: 1500, sizeBytes: 2_400_000, readUnits: 52000, writeUnits: 31000, readPeak: 4.2, writePeak: 3.1, readThrottles: 0, writeThrottles: 1, indexes: [] }],
  apis: [{ name: "websocket", kind: "websocket", requests: 5400, connects: 61 }],
  bucket: { name: "chat-files", sizeBytes: 18_000_000, objects: 240 },
  provisionedRead: 23,
  provisionedWrite: 23,
};
const state = (over: Record<string, unknown> = {}) => ({ snapshot, error: "", failedAt: 0, requestedAt: 0, refreshing: false, nextAt: Date.now() + 86_400_000, ...over });

beforeEach(() => {
  setLang("en");
  calls.length = 0;
  answers = {};
  unlockedNow();
  useChat.setState({ ...initialState, phase: "ready", me: { userId: "a", handle: "victor", role: "admin", publicKey: "" }, title: "admin", permissions: ["aws", "status"] });
  go(PATH.managementPage("aws"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the AWS usage page", () => {
  it("shows what was collected: functions, tables with their capacity, APIs and the bucket", async () => {
    answers = { "GET /admin/aws": state() };
    render(<ManagementPage />);
    expect(await screen.findByText("chat-api")).toBeTruthy();
    expect(screen.getByText("DynamoDB · Main data (chat-main)")).toBeTruthy();
    expect(screen.getAllByText("16 / 16").length).toBeGreaterThan(0);
    expect(screen.getByText("23 / 23")).toBeTruthy();
    expect(screen.getByText("S3 · chat-files")).toBeTruthy();
    expect(screen.getByText("5,400 messages")).toBeTruthy();
  });

  it("says so when nothing was collected yet, and shows a failure next to the last numbers", async () => {
    answers = { "GET /admin/aws": state({ snapshot: null }) };
    const { unmount } = render(<ManagementPage />);
    expect(await screen.findByText("No data yet")).toBeTruthy();
    unmount();
    answers = { "GET /admin/aws": state({ error: "the metrics could not be read", failedAt: Date.now() }) };
    render(<ManagementPage />);
    expect(await screen.findByText(/the metrics could not be read/)).toBeTruthy();
    expect(screen.getByText("chat-api")).toBeTruthy();
  });

  it("refresh now asks once; while it is pending the old numbers stay, the button is off, and the page does not ask again by itself", async () => {
    answers = { "GET /admin/aws": state(), "POST /admin/aws/refresh": state({ refreshing: true, requestedAt: Date.now() }) };
    vi.useFakeTimers({ toFake: ["setInterval", "setTimeout"] }); // nothing may be scheduled behind the page's back
    render(<ManagementPage />);
    vi.useRealTimers();
    fireEvent.click(await screen.findByText("Refresh now"));
    const waiting = await screen.findByText("Refreshing");
    expect((waiting.closest("button") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("chat-api")).toBeTruthy(); // the previous data is still there
    const gets = () => calls.filter(([m, p]) => m === "GET" && p === "/admin/aws").length;
    const before = gets();
    await new Promise((r) => setTimeout(r, 50));
    expect(gets()).toBe(before);
    expect(calls.filter(([m, p]) => m === "POST" && p === "/admin/aws/refresh")).toHaveLength(1);
  });

  it("reads the numbers again when the server says they changed (the notice), and the button comes back", async () => {
    answers = { "GET /admin/aws": state({ refreshing: true, requestedAt: Date.now() }) };
    render(<ManagementPage />);
    expect(await screen.findByText("Refreshing")).toBeTruthy(); // somebody else asked: this page shows it too
    answers["GET /admin/aws"] = state({ snapshot: { ...snapshot, fetchedAt: Date.now() } });
    act(() => useChat.setState({ awsTick: useChat.getState().awsTick + 1 }));
    await waitFor(() => expect(screen.getByText("Refresh now")).toBeTruthy());
    expect((screen.getByText("Refresh now").closest("button") as HTMLButtonElement).disabled).toBe(false);
  });

  it("a conflict answer to the refresh is not shown as an error: the page just reads where things stand", async () => {
    answers = {
      "GET /admin/aws": state(),
      "POST /admin/aws/refresh": () => {
        throw new ApiError(409, "conflict", { reason: "too_soon" });
      },
    };
    render(<ManagementPage />);
    fireEvent.click(await screen.findByText("Refresh now"));
    await waitFor(() => expect(calls.filter(([m, p]) => m === "GET" && p === "/admin/aws").length).toBeGreaterThan(1));
    expect(screen.queryByText(/conflict/i)).toBeNull();
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect((screen.getByText("Refresh now").closest("button") as HTMLButtonElement).disabled).toBe(false);
  });

  it("is not shown to an administrator without the permission", async () => {
    useChat.setState({ permissions: ["status"] });
    render(<ManagementPage />);
    expect(screen.queryByText("AWS usage")).toBeNull();
    expect(calls.some(([, p]) => p === "/admin/aws")).toBe(false);
  });
});
