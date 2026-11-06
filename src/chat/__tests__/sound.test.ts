import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** A stand-in for the browser's audio engine that counts what the code starts. */
class FakeAudio {
  static instances: FakeAudio[] = [];
  state: "suspended" | "running" = "suspended";
  currentTime = 0;
  destination = {};
  notes = 0;
  silentStarts = 0;
  /** Browsers refuse to wake the audio before the user has touched the page. */
  static activated = true;
  constructor() {
    FakeAudio.instances.push(this);
  }
  resume(): Promise<void> {
    if (!FakeAudio.activated) return Promise.reject(new Error("not allowed"));
    this.state = "running";
    return Promise.resolve();
  }
  createOscillator() {
    this.notes++;
    return { type: "", frequency: { value: 0 }, connect: () => ({ connect: () => ({}) }), start() {}, stop() {} };
  }
  createGain() {
    return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: () => ({ connect: () => ({}) }) };
  }
  createBuffer() {
    return {};
  }
  createBufferSource() {
    return { buffer: null, connect() {}, start: () => void this.silentStarts++ };
  }
}

async function load() {
  vi.resetModules();
  return import("../sound");
}

beforeEach(() => {
  FakeAudio.instances = [];
  FakeAudio.activated = true;
  (globalThis as { AudioContext?: unknown }).AudioContext = FakeAudio;
});
afterEach(() => {
  delete (globalThis as { AudioContext?: unknown }).AudioContext;
});

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("sound", () => {
  it("a tap or key press creates the audio, wakes it and primes iOS once", async () => {
    const { armSound } = await load();
    armSound();
    armSound();
    armSound();
    await tick();
    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0].state).toBe("running");
    expect(FakeAudio.instances[0].silentStarts).toBe(1);
  });

  it("rings two notes for a message once the audio is awake", async () => {
    const { armSound, playChime } = await load();
    armSound();
    await tick();
    playChime();
    expect(FakeAudio.instances[0].notes).toBe(2);
  });

  it("wakes audio the browser put to sleep and still rings", async () => {
    const { armSound, playChime } = await load();
    armSound();
    await tick();
    FakeAudio.instances[0].state = "suspended";
    playChime();
    await tick();
    expect(FakeAudio.instances[0].notes).toBe(2);
  });

  it("stays silent, without errors, when the browser refuses until the user touches the page", async () => {
    FakeAudio.activated = false;
    const { armSound, playChime } = await load();
    armSound();
    playChime();
    await tick();
    expect(FakeAudio.instances[0].notes).toBe(0);
    // a later tap unlocks it, and the next message rings
    FakeAudio.activated = true;
    armSound();
    await tick();
    playChime();
    expect(FakeAudio.instances[0].notes).toBe(2);
  });

  it("does nothing where there is no audio engine", async () => {
    delete (globalThis as { AudioContext?: unknown }).AudioContext;
    const { armSound, playChime } = await load();
    expect(() => {
      armSound();
      playChime();
    }).not.toThrow();
  });
});
