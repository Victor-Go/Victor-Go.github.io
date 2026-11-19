/**
 * What a browser lets a call page do about the phone itself: keep the screen from sleeping, and choose where the other person's voice comes out.
 * It cannot ring a locked phone, turn the screen off near the ear or pick the earpiece on iOS; those are not available to a web page.
 * Nothing here is stored.
 */

interface WakeLockSentinelLike {
  release(): Promise<void>;
}
interface WakeLockApi {
  request(type: "screen"): Promise<WakeLockSentinelLike>;
}

/**
 * Keeps the screen awake while a call lasts (a screen that sleeps takes the page's connection with it on most phones). The browser drops the lock
 * whenever the page is hidden, so it is asked for again when the page comes back. Returns a function that gives it up; where the browser has no
 * Wake Lock this does nothing and the returned function is a no-op.
 */
export function keepScreenAwake(): () => void {
  const api = (typeof navigator !== "undefined" ? (navigator as { wakeLock?: WakeLockApi }).wakeLock : undefined) ?? null;
  if (!api) return () => {};
  let sentinel: WakeLockSentinelLike | null = null;
  let stopped = false;
  const acquire = () => {
    if (stopped || sentinel) return;
    api
      .request("screen")
      .then((s) => {
        if (stopped) void s.release().catch(() => {});
        else sentinel = s;
      })
      .catch(() => {
        /* refused (battery saver, a hidden page): the call goes on, the screen may sleep */
      });
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") {
      sentinel = null; // the browser released it when the page was hidden
      acquire();
    }
  };
  document.addEventListener("visibilitychange", onVisible);
  acquire();
  return () => {
    stopped = true;
    document.removeEventListener("visibilitychange", onVisible);
    void sentinel?.release().catch(() => {});
    sentinel = null;
  };
}

export interface Output {
  id: string;
  label: string;
}

type Sinkable = HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> };

/** Can the page choose the output device? (Desktop Chrome and Edge, some Android Chrome; not iOS Safari: there the system's own picker is the way.) */
export function canChooseOutput(): boolean {
  return typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype && !!navigator.mediaDevices?.enumerateDevices;
}

/** The speakers and headphones the browser lists (names appear once the microphone has been allowed). */
export async function listOutputs(): Promise<Output[]> {
  if (!canChooseOutput()) return [];
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "audiooutput").map((d, i) => ({ id: d.deviceId, label: d.label || String(i + 1) }));
  } catch {
    return [];
  }
}

/** Sends the voice to this device. False when the browser refuses. */
export async function sendOutputTo(el: HTMLMediaElement, id: string): Promise<boolean> {
  const sink = el as Sinkable;
  if (!sink.setSinkId) return false;
  try {
    await sink.setSinkId(id);
    return true;
  } catch {
    return false;
  }
}

/** Calls `fn` when a headset or speaker is plugged in or taken out. Returns the way to stop. */
export function onOutputsChange(fn: () => void): () => void {
  const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
  if (!md?.addEventListener) return () => {};
  md.addEventListener("devicechange", fn);
  return () => md.removeEventListener("devicechange", fn);
}
