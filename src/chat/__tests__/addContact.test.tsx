import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ContactsPane } from "../components/ContactsPane";
import { ApiError } from "../net/api";
import { setLang } from "../lang";
import { initialState, useChat } from "../store";

const requestContact = vi.hoisted(() => vi.fn(async (_handle: string, _progress: unknown) => {}));
vi.mock("../client", async (orig) => ({ ...(await orig<typeof import("../client")>()), requestContact }));

beforeEach(() => {
  setLang("zh");
  requestContact.mockReset();
  useChat.setState({ ...initialState, phase: "ready", me: { userId: "me", handle: "me", role: "user", publicKey: "" } });
});

const ask = async () => {
  render(<ContactsPane />);
  fireEvent.click(screen.getByLabelText("添加联系人"));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "peer" } });
  fireEvent.click(screen.getByText("发送申请"));
};

describe("adding a contact that conflicts", () => {
  it.each([
    ["already_contacts", "你们已经是联系人了。"],
    ["request_sent", "你已经向对方发送过申请,正在等待对方同意。"],
    ["request_received", "对方已经向你发送了申请,请在申请列表里同意。"],
  ])("says which it is: %s", async (reason, text) => {
    requestContact.mockRejectedValue(new ApiError(409, "conflict", { reason }));
    await ask();
    await waitFor(() => expect(screen.getByText(text)).toBeTruthy());
  });

  it("keeps the general text for a conflict that gives no reason", async () => {
    requestContact.mockRejectedValue(new ApiError(409, "conflict"));
    await ask();
    await waitFor(() => expect(screen.getByText("操作冲突(可能已经存在或已满)。")).toBeTruthy());
  });
});
