import { useSyncExternalStore } from "react";

/**
 * One recording plays at a time. The audio is an object URL over bytes held in memory only; the URL is revoked as soon as playback stops,
 * ends, fails, or the chat locks.
 */
interface Current {
  key: string;
  audio: HTMLAudioElement;
  url: string;
}

let current: Current | null = null;
let playing: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const setPlaying = (key: string | null) => {
  if (playing === key) return;
  playing = key;
  emit();
};

/** Stops whatever plays and frees its audio. Safe to call at any time. */
export function stopVoice(): void {
  const c = current;
  current = null;
  if (c) {
    c.audio.onended = c.audio.onerror = null;
    try {
      c.audio.pause();
    } catch {
      /* already gone */
    }
    c.audio.removeAttribute("src");
    URL.revokeObjectURL(c.url);
  }
  setPlaying(null);
}

/** Plays MP3 bytes under `key`, replacing anything that plays now. Rejects when the browser cannot play them. */
export async function playVoice(key: string, mp3: Uint8Array): Promise<void> {
  stopVoice();
  const url = URL.createObjectURL(new Blob([mp3 as BlobPart], { type: "audio/mpeg" }));
  const audio = new Audio(url);
  const mine: Current = { key, audio, url };
  current = mine;
  setPlaying(key);
  audio.onended = () => current === mine && stopVoice();
  audio.onerror = () => current === mine && stopVoice();
  try {
    await audio.play();
  } catch (e) {
    if (current === mine) stopVoice();
    throw e;
  }
}

export const playingKey = (): string | null => playing;

/** The key of the recording that plays now, or null. */
export function usePlayingVoice(): string | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => playing,
    () => null,
  );
}
