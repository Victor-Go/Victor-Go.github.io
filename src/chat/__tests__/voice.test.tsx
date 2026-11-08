import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { fromB64 } from "../crypto/b64";
import { toEpochs } from "../crypto/keys";
import { decryptBytes, decryptMessage, encryptBytes, encryptMessage, voiceBinding, type Binding } from "../crypto/message";
import { VoiceBubble } from "../components/VoiceBubble";
import { VOICE_MAX_BYTES, VOICE_SAMPLE_RATE, encodeMp3, fitsServer, floatToInt16, formatDuration } from "../voice";
import { playVoice, playingKey, stopVoice } from "../voicePlayer";
import { initialState, useChat, type Msg } from "../store";
import { ApiError, lock } from "../client";

const play = vi.hoisted(() => vi.fn());
vi.mock("../client", async (orig) => ({ ...(await orig<typeof import("../client")>()), playVoiceMessage: play }));

const epochs = toEpochs([{ id: 3, constant: "week_three" }], 3);
const key = new Uint8Array(32).fill(5);
const binding: Binding = { conv: "c1", senderId: "u1", clientMsgId: "m1", gen: 0 };

function tone(seconds: number): Float32Array {
  const out = new Float32Array(Math.round(seconds * VOICE_SAMPLE_RATE));
  for (let i = 0; i < out.length; i++) out[i] = 0.4 * Math.sin((2 * Math.PI * 440 * i) / VOICE_SAMPLE_RATE) + 0.1 * Math.sin((2 * Math.PI * 1234 * i) / VOICE_SAMPLE_RATE);
  return out;
}

describe("sample conversion and MP3 size", () => {
  it("converts floats to clipped 16-bit integers", () => {
    expect(Array.from(floatToInt16(Float32Array.of(0, 1, -1, 2, -2, 0.5)))).toEqual([0, 32767, -32768, 32767, -32768, 16384]);
  });

  it("encodes a tone as MP3 at about 3 KB per second", async () => {
    const mp3 = await encodeMp3(tone(2));
    expect(mp3[0]).toBe(0xff); // frame sync
    expect(mp3.length).toBeGreaterThan(4000);
    expect(mp3.length).toBeLessThan(9000);
  });

  it("keeps a full-length recording within what the server accepts once sealed", async () => {
    const mp3 = await encodeMp3(tone(60));
    expect(mp3.length).toBeLessThan(200_000);
    const { ct } = await encryptBytes(key, epochs, mp3, voiceBinding(binding));
    // The server counts the raw ciphertext bytes (1 to 262144), not the base64 text.
    expect(fitsServer(fromB64(ct).length)).toBe(true);
    expect(fitsServer(VOICE_MAX_BYTES)).toBe(true);
    expect(fitsServer(VOICE_MAX_BYTES + 1)).toBe(false);
    expect(fitsServer(0)).toBe(false);
  }, 30_000);

  it("formats durations", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(5400)).toBe("0:05");
    expect(formatDuration(60_000)).toBe("1:00");
    expect(formatDuration(-5)).toBe("0:00");
  });
});

describe("sealing a recording", () => {
  it("opens with the same binding and not with another message's, another chat's, or the plain message binding", async () => {
    const bytes = Uint8Array.of(1, 2, 3, 4, 5);
    const { ct } = await encryptBytes(key, epochs, bytes, voiceBinding(binding));
    expect(Array.from(await decryptBytes(key, epochs, ct, voiceBinding(binding)))).toEqual([1, 2, 3, 4, 5]);
    await expect(decryptBytes(key, epochs, ct, binding)).rejects.toThrow();
    await expect(decryptBytes(key, epochs, ct, voiceBinding({ ...binding, clientMsgId: "m2" }))).rejects.toThrow();
    await expect(decryptBytes(key, epochs, ct, voiceBinding({ ...binding, conv: "c2" }))).rejects.toThrow();
    await expect(decryptBytes(key, toEpochs([{ id: 4, constant: "week_four" }], 4), ct, voiceBinding(binding))).rejects.toThrow();
  });

  it("round-trips a voice message payload and rejects malformed ones", async () => {
    const ok = { k: "voice" as const, voice: { id: "abc", ms: 1500 }, sentAt: 1 };
    const { ct } = await encryptMessage(key, epochs, ok, binding);
    expect(await decryptMessage(key, epochs, ct, binding)).toEqual(ok);
    for (const bad of [{ id: "", ms: 1 }, { id: "a", ms: -1 }, { id: "a", ms: "9" }, { id: 5, ms: 1 }]) {
      const sealed = await encryptMessage(key, epochs, { k: "voice", voice: bad as never, sentAt: 1 }, binding);
      await expect(decryptMessage(key, epochs, sealed.ct, binding)).rejects.toThrow();
    }
  });
});

class FakeAudio {
  static made: FakeAudio[] = [];
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  paused = false;
  src: string;
  constructor(src: string) {
    this.src = src;
    FakeAudio.made.push(this);
  }
  play = () => Promise.resolve();
  pause = () => {
    this.paused = true;
  };
  removeAttribute = () => {};
}

describe("playback keeps audio in memory and revokes it", () => {
  let revoked: string[];
  beforeEach(() => {
    revoked = [];
    FakeAudio.made = [];
    vi.stubGlobal("Audio", FakeAudio);
    URL.createObjectURL = vi.fn(() => `blob:test/${FakeAudio.made.length}`);
    URL.revokeObjectURL = vi.fn((u: string) => void revoked.push(u));
  });
  afterEach(() => {
    stopVoice();
    vi.unstubAllGlobals();
  });

  it("revokes the URL on stop and when another recording starts", async () => {
    await playVoice("a", Uint8Array.of(1));
    expect(playingKey()).toBe("a");
    await playVoice("b", Uint8Array.of(2));
    expect(revoked).toEqual(["blob:test/0"]);
    expect(playingKey()).toBe("b");
    stopVoice();
    expect(revoked).toHaveLength(2);
    expect(playingKey()).toBeNull();
  });

  it("revokes when playback ends", async () => {
    await playVoice("a", Uint8Array.of(1));
    FakeAudio.made[0].onended?.();
    expect(revoked).toHaveLength(1);
    expect(playingKey()).toBeNull();
  });

  it("stops and frees the audio when the chat locks", async () => {
    await playVoice("a", Uint8Array.of(1));
    lock(null);
    expect(revoked).toHaveLength(1);
    expect(playingKey()).toBeNull();
  });
});

describe("VoiceBubble", () => {
  const voiceMsg = (id: string): Msg => ({
    id: "m1", seq: 1, senderId: "u2", role: "user", time: 1, mine: false, status: "sent",
    payload: { k: "voice", voice: { id, ms: 65_000 }, sentAt: 1 },
  });
  beforeEach(() => useChat.setState({ ...initialState }));

  it("shows the duration and a play control", () => {
    render(<VoiceBubble conv="c1" m={voiceMsg("v1")} />);
    expect(screen.getByText("1:05")).toBeTruthy();
    const btn = screen.getByRole("button", { name: /播放语音|Play voice/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it("cannot be played before the upload has given it an id", () => {
    render(<VoiceBubble conv="c1" m={voiceMsg("")} />);
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows an error instead of throwing when playing fails", async () => {
    play.mockRejectedValueOnce(new ApiError(0, "network"));
    render(<VoiceBubble conv="c1" m={voiceMsg("v1")} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  });
});
