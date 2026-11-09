import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Conversation } from "../components/Conversation";
import { setLang } from "../lang";
import { initialState, useChat } from "../store";

const sendImage = vi.hoisted(() => vi.fn(async (_conv: string, _file: Blob) => {}));
vi.mock("../client", async (orig) => ({ ...(await orig<typeof import("../client")>()), sendImage }));
const startRecording = vi.hoisted(() => vi.fn(async () => ({ cancel() {}, finish: async () => null })));
vi.mock("../voice", async (orig) => ({ ...(await orig<typeof import("../voice")>()), voiceSupported: () => true, startRecording }));

const CONV = "c1";
let widths: ((width: number) => void) | null;

/** A ResizeObserver the test drives: `resizeTo(300)` reports a composer 300 px wide. */
function stubResize() {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(cb: (e: { contentRect: { width: number } }[]) => void) {
        widths = (width) => act(() => cb([{ contentRect: { width } }]));
      }
      observe() {}
      disconnect() {}
    },
  );
}

beforeEach(() => {
  setLang("zh");
  widths = null;
  sendImage.mockClear();
  startRecording.mockClear();
  useChat.setState({
    ...initialState,
    phase: "ready",
    me: { userId: "me", handle: "me", role: "user", publicKey: "" },
    contacts: [{ userId: "peer", handle: "peer", role: "user", convId: CONV, key: new Uint8Array(32) }],
    activeConv: CONV,
    messages: { [CONV]: [] },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("a composer with room", () => {
  it("shows the microphone, picture and emoji buttons beside the text box, and no \"+\"", () => {
    render(<Conversation />);
    expect(screen.getByLabelText("录制语音")).toBeTruthy();
    expect(screen.getByLabelText("发送图片")).toBeTruthy();
    expect(screen.getByLabelText("表情")).toBeTruthy();
    expect(screen.queryByLabelText("更多")).toBeNull();
  });

  it("sends the picked file at once and shows nothing in a panel", async () => {
    render(<Conversation />);
    const file = new File(["x"], "a.png", { type: "image/png" });
    fireEvent.change(screen.getByTestId("image-input"), { target: { files: [file] } });
    await waitFor(() => expect(sendImage).toHaveBeenCalledWith(CONV, file));
  });
});

describe("a composer too narrow for the text box (under about 15 characters)", () => {
  beforeEach(() => stubResize());

  it("keeps only \"+\" and send", () => {
    render(<Conversation />);
    widths!(300);
    expect(screen.getByLabelText("更多")).toBeTruthy();
    expect(screen.queryByLabelText("录制语音")).toBeNull();
    expect(screen.queryByLabelText("发送图片")).toBeNull();
    expect(screen.queryByLabelText("表情")).toBeNull();
    expect(screen.getByLabelText("发送")).toBeTruthy();
  });

  it("goes back to the full row when there is room again", () => {
    render(<Conversation />);
    widths!(300);
    widths!(700);
    expect(screen.queryByLabelText("更多")).toBeNull();
    expect(screen.getByLabelText("表情")).toBeTruthy();
  });

  it("opens a menu with emoji, picture and voice", () => {
    render(<Conversation />);
    widths!(300);
    fireEvent.click(screen.getByLabelText("更多"));
    const menu = screen.getByRole("group", { name: "更多" });
    expect(menu.textContent).toContain("表情");
    expect(menu.textContent).toContain("图片");
    expect(menu.textContent).toContain("语音");
  });

  it("switches to the emoji panel when emoji is chosen, and an emoji lands in the text box", () => {
    render(<Conversation />);
    widths!(300);
    fireEvent.click(screen.getByLabelText("更多"));
    fireEvent.click(screen.getByText("表情"));
    expect(screen.queryByRole("group", { name: "更多" })).toBeNull();
    const grid = screen.getByRole("group", { name: "表情" });
    fireEvent.pointerDown(grid.querySelector(".ch-emoji-item") as HTMLElement);
    expect((screen.getByPlaceholderText("输入消息") as HTMLTextAreaElement).value).toBe("👌");
  });

  it("closes the panel and starts recording when voice is chosen", async () => {
    render(<Conversation />);
    widths!(300);
    fireEvent.click(screen.getByLabelText("更多"));
    fireEvent.click(screen.getByLabelText("录制语音"));
    expect(screen.queryByRole("group", { name: "更多" })).toBeNull();
    await waitFor(() => expect(startRecording).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("group", { name: "正在录音" })).toBeTruthy();
  });

  it("shows the recording bar the moment voice is chosen, while the microphone is still opening, so the row changes once", async () => {
    let open!: (r: { cancel(): void; finish: () => Promise<null> }) => void;
    startRecording.mockImplementationOnce(() => new Promise((resolve) => (open = resolve)) as ReturnType<typeof startRecording>);
    render(<Conversation />);
    widths!(300);
    fireEvent.click(screen.getByLabelText("更多"));
    fireEvent.click(screen.getByLabelText("录制语音"));
    // not yet recording, but already the bar: no text box, no "+", and nothing to send yet
    expect(screen.getByRole("group", { name: "正在录音" })).toBeTruthy();
    expect(screen.queryByPlaceholderText("输入消息")).toBeNull();
    expect(screen.queryByLabelText("更多")).toBeNull();
    expect((screen.getByLabelText("发送语音") as HTMLButtonElement).disabled).toBe(true);
    await act(async () => open({ cancel() {}, finish: async () => null }));
    expect(screen.getByRole("group", { name: "正在录音" })).toBeTruthy(); // the same bar goes on
  });

  it("goes back to the text box with a message when the microphone is refused", async () => {
    startRecording.mockRejectedValueOnce(new DOMException("no", "NotAllowedError"));
    render(<Conversation />);
    widths!(300);
    fireEvent.click(screen.getByLabelText("更多"));
    fireEvent.click(screen.getByLabelText("录制语音"));
    expect(screen.getByRole("group", { name: "正在录音" })).toBeTruthy();
    await waitFor(() => expect(screen.getByPlaceholderText("输入消息")).toBeTruthy());
    expect(screen.getByText(/无法使用麦克风/)).toBeTruthy();
  });

  it("lets go of a microphone that opens after the recording bar was cancelled", async () => {
    const cancel = vi.fn();
    let open!: (r: { cancel(): void; finish: () => Promise<null> }) => void;
    startRecording.mockImplementationOnce(() => new Promise((resolve) => (open = resolve)) as ReturnType<typeof startRecording>);
    render(<Conversation />);
    widths!(300);
    fireEvent.click(screen.getByLabelText("更多"));
    fireEvent.click(screen.getByLabelText("录制语音"));
    fireEvent.click(screen.getByLabelText("取消录音"));
    expect(screen.getByPlaceholderText("输入消息")).toBeTruthy();
    await act(async () => open({ cancel, finish: async () => null }));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(screen.getByPlaceholderText("输入消息")).toBeTruthy(); // and no recording bar comes back
  });

  it("keeps the panel open while the picture is on its way and closes it when that is over", async () => {
    let done!: () => void;
    sendImage.mockImplementationOnce(() => new Promise<void>((resolve) => (done = resolve)));
    render(<Conversation />);
    widths!(300);
    fireEvent.click(screen.getByLabelText("更多"));
    const file = new File(["x"], "a.png", { type: "image/png" });
    fireEvent.change(screen.getByTestId("image-input"), { target: { files: [file] } });
    await waitFor(() => expect(sendImage).toHaveBeenCalledWith(CONV, file));
    // a tap elsewhere, Escape and the "+" itself leave it open
    fireEvent.pointerDown(document.body);
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "更多" }));
    expect(screen.getByRole("group", { name: "更多" })).toBeTruthy();
    expect(screen.getByLabelText("发送图片").getAttribute("aria-busy")).toBe("true");
    await act(async () => done());
    await waitFor(() => expect(screen.queryByRole("group", { name: "更多" })).toBeNull());
  });

  it("closes the panel after a failure too, and says why", async () => {
    sendImage.mockRejectedValueOnce(Object.assign(new Error("unreadable"), { name: "ImageError" }));
    render(<Conversation />);
    widths!(300);
    fireEvent.click(screen.getByLabelText("更多"));
    fireEvent.change(screen.getByTestId("image-input"), { target: { files: [new File(["x"], "a.txt")] } });
    await waitFor(() => expect(screen.queryByRole("group", { name: "更多" })).toBeNull());
    expect(screen.getByText("无法发送或显示这张图片。")).toBeTruthy();
  });

  it("offers only emoji when the administrator has switched voice off (pictures and recordings share that switch)", () => {
    useChat.setState({ filesOff: true });
    render(<Conversation />);
    widths!(300);
    fireEvent.click(screen.getByLabelText("更多"));
    const menu = screen.getByRole("group", { name: "更多" });
    expect(menu.textContent).toContain("表情");
    expect(menu.textContent).not.toContain("图片");
    expect(menu.textContent).not.toContain("语音");
  });
});
