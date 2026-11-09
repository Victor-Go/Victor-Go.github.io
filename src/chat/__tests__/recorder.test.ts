import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RELEASE_WAIT_MS, startRecording } from "../voice";

/** A microphone stream whose tracks can be inspected, and a recorder that behaves like a browser's (or does not). */
class FakeTrack {
  readyState: "live" | "ended" = "live";
  stop() {
    this.readyState = "ended";
  }
}
let tracks: FakeTrack[];
let recorderBehaviour: { sendStop: boolean; startThrows: boolean };

class FakeRecorder {
  state: "inactive" | "recording" = "inactive";
  mimeType = "audio/mp4";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  start() {
    if (recorderBehaviour.startThrows) throw new DOMException("no", "InvalidStateError");
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    if (recorderBehaviour.sendStop) setTimeout(() => this.onstop?.(), 5);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  tracks = [new FakeTrack(), new FakeTrack()];
  recorderBehaviour = { sendStop: true, startThrows: false };
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn(async () => ({ getTracks: () => tracks })) } });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const live = () => tracks.filter((t) => t.readyState === "live").length;

describe("the microphone is let go", () => {
  it("when a recording is cancelled", async () => {
    const r = await startRecording(60);
    expect(live()).toBe(2);
    r.cancel();
    await vi.advanceTimersByTimeAsync(10);
    expect(live()).toBe(0);
  });

  it("even when the browser never sends the recorder's stop event", async () => {
    recorderBehaviour.sendStop = false;
    const r = await startRecording(60);
    r.cancel();
    await vi.advanceTimersByTimeAsync(RELEASE_WAIT_MS - 1);
    expect(live()).toBe(2);
    await vi.advanceTimersByTimeAsync(2);
    expect(live()).toBe(0);
  });

  it("at once when the recorder cannot start", async () => {
    recorderBehaviour.startThrows = true;
    await expect(startRecording(60)).rejects.toMatchObject({ name: "InvalidStateError" });
    expect(live()).toBe(0);
  });

  it("when a recording that was too short is finished", async () => {
    const r = await startRecording(60);
    const done = r.finish();
    await vi.advanceTimersByTimeAsync(10);
    await expect(done).resolves.toBeNull();
    expect(live()).toBe(0);
  });

  it("only once however many times stopping is asked for", async () => {
    const r = await startRecording(60);
    r.cancel();
    r.cancel();
    await vi.advanceTimersByTimeAsync(10);
    expect(live()).toBe(0);
  });
});
