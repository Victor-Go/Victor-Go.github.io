import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NotifyPrompt } from "../components/NotifyPrompt";
import { initialState, useChat } from "../store";

function fakeNotification(permission: NotificationPermission) {
  const request = vi.fn(async () => {
    (Notification as unknown as { permission: string }).permission = "granted";
    return "granted" as NotificationPermission;
  });
  (globalThis as { Notification?: unknown }).Notification = Object.assign(function () {}, { permission, requestPermission: request });
  return request;
}

beforeEach(() => {
  useChat.setState({ ...initialState });
});
afterEach(() => {
  delete (globalThis as { Notification?: unknown }).Notification;
});

describe("NotifyPrompt", () => {
  it("is shown while the permission is still undecided", () => {
    fakeNotification("default");
    render(<NotifyPrompt />);
    expect(screen.getByRole("region")).toBeTruthy();
  });

  it("asks the browser when the user taps turn on, then goes away", async () => {
    const request = fakeNotification("default");
    render(<NotifyPrompt />);
    fireEvent.click(screen.getByRole("button", { name: /开启|Turn on/ }));
    expect(request).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("region")).toBeNull());
  });

  it("not now hides it for this account", () => {
    fakeNotification("default");
    useChat.setState({ me: null });
    render(<NotifyPrompt />);
    useChat.setState({ notifyDismissed: true });
    return waitFor(() => expect(screen.queryByRole("region")).toBeNull());
  });

  it("stays away once decided, and where notifications do not exist", () => {
    fakeNotification("granted");
    const first = render(<NotifyPrompt />);
    expect(first.container.innerHTML).toBe("");
    first.unmount();

    fakeNotification("denied");
    const second = render(<NotifyPrompt />);
    expect(second.container.innerHTML).toBe("");
    second.unmount();

    delete (globalThis as { Notification?: unknown }).Notification;
    const third = render(<NotifyPrompt />);
    expect(third.container.innerHTML).toBe("");
  });

  it("does not show a dismissed prompt again", () => {
    fakeNotification("default");
    useChat.setState({ notifyDismissed: true });
    const view = render(<NotifyPrompt />);
    expect(view.container.innerHTML).toBe("");
  });
});
