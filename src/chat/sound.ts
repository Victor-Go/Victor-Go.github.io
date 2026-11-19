let ctx: AudioContext | null = null;
let primed = false;

function context(): AudioContext | null {
  if (ctx) return ctx;
  const g = globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

/**
 * Browsers only let a page make sound after the user has touched it, and phones only count a finished tap (touchend, click), not the
 * moment a finger lands. So this is called on every tap, click and key press, not just the first one: it creates the audio context,
 * wakes it if the browser put it to sleep, and, once, starts a silent sound inside the gesture, which is what iOS needs to unlock audio.
 * Nothing is loaded or stored: the tone is synthesised.
 */
export function armSound(): void {
  const c = context();
  if (!c) return;
  if (c.state === "suspended") void c.resume().catch(() => {});
  if (!primed) {
    try {
      const silent = c.createBufferSource();
      silent.buffer = c.createBuffer(1, 1, 22050);
      silent.connect(c.destination);
      silent.start(0);
      primed = true;
    } catch {
      /* try again on the next gesture */
    }
  }
}

function ring(c: AudioContext): void {
  const start = c.currentTime;
  for (const [i, freq] of [880, 1175].entries()) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    const t = start + i * 0.13;
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.14, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.22);
  }
}

/**
 * A short two-note chime, quiet enough not to startle. If the browser has put the audio to sleep (a background tab, a phone that
 * locked) it is woken first; that works once the user has ever touched the page. Silent if the browser still refuses.
 */
/**
 * The two telephone tones, made in the page (nothing is loaded): the ring an incoming call makes (two short bursts, a pause, again) and the ringback
 * the caller hears while the other end rings (one tone, one second on, three off). Each repeats until stopped.
 */
function tone(c: AudioContext, freqs: number[], at: number, seconds: number, volume: number): void {
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.02);
  gain.gain.setValueAtTime(volume, at + seconds - 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  gain.connect(c.destination);
  for (const f of freqs) {
    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f;
    osc.connect(gain);
    osc.start(at);
    osc.stop(at + seconds + 0.02);
  }
}

const ringPattern = (c: AudioContext): void => {
  const t = c.currentTime;
  tone(c, [440, 480], t, 0.4, 0.1);
  tone(c, [440, 480], t + 0.6, 0.4, 0.1);
};
const ringbackPattern = (c: AudioContext): void => tone(c, [425], c.currentTime, 1, 0.08);

/** Runs `pattern` now and every `everyMs` until `stop`; where the browser still refuses sound it stays silent. */
function loop(pattern: (c: AudioContext) => void, everyMs: number): ReturnType<typeof setInterval> {
  const play = () => {
    const c = context();
    if (!c) return;
    if (c.state === "running") return pattern(c);
    void c
      .resume()
      .then(() => c.state === "running" && pattern(c))
      .catch(() => {});
  };
  play();
  return setInterval(play, everyMs);
}

let ringTimer: ReturnType<typeof setInterval> | undefined;
let ringbackTimer: ReturnType<typeof setInterval> | undefined;

/** Rings for an incoming call until `stopRinging`. */
export function startRinging(): void {
  stopRinging();
  ringTimer = loop(ringPattern, 3000);
}

export function stopRinging(): void {
  clearInterval(ringTimer);
  ringTimer = undefined;
}

/** The caller's "tu... tu...": until `stopRingback`. */
export function startRingback(): void {
  stopRingback();
  ringbackTimer = loop(ringbackPattern, 4000);
}

export function stopRingback(): void {
  clearInterval(ringbackTimer);
  ringbackTimer = undefined;
}

export function playChime(): void {
  const c = context();
  if (!c) return;
  if (c.state === "running") return ring(c);
  void c
    .resume()
    .then(() => {
      if (c.state === "running") ring(c);
    })
    .catch(() => {});
}
