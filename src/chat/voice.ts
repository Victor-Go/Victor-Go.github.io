/** Contract: chat-server docs/protocol.md section 10 and the "Voice moves to S3" entry of docs/CHANGELOG.md (protocol 2). */
export const VOICE_SAMPLE_RATE = 16000;
export const VOICE_KBPS = 24;
/** The server takes a ciphertext of 1 to 262144 bytes (the raw bytes, not their base64 text). */
export const VOICE_MAX_BYTES = 256 * 1024;
/** Anything shorter than this is a mis-tap, not a message. */
export const VOICE_MIN_MS = 500;

const FRAME = 1152;

/** Float samples in -1..1 to 16-bit integers, clipping anything outside. */
export function floatToInt16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    out[i] = v < 0 ? Math.round(v * 0x8000) : Math.round(v * 0x7fff);
  }
  return out;
}

/** Mono 16 kHz samples to MP3 bytes at about 24 kbps. */
export async function encodeMp3(samples: Float32Array): Promise<Uint8Array> {
  // Loaded on the first recording only, so the encoder is not part of opening the chat.
  const { Mp3Encoder } = await import("@breezystack/lamejs");
  const enc = new Mp3Encoder(1, VOICE_SAMPLE_RATE, VOICE_KBPS);
  const pcm = floatToInt16(samples);
  const parts: Uint8Array[] = [];
  let total = 0;
  const keep = (chunk: Uint8Array) => {
    if (chunk.length === 0) return;
    parts.push(chunk);
    total += chunk.length;
  };
  for (let i = 0; i < pcm.length; i += FRAME) keep(enc.encodeBuffer(pcm.subarray(i, i + FRAME)));
  keep(enc.flush());
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Whether a ciphertext of this many bytes is within what the server accepts. */
export const fitsServer = (bytes: number): boolean => bytes >= 1 && bytes <= VOICE_MAX_BYTES;

/** M:ss for a duration in milliseconds, rounded to whole seconds. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Microphone capture and the media APIs are present (a secure context is needed as well, which the browser enforces on asking). */
export function voiceSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}

export interface Recording {
  /** Stops capturing and resolves with the encoded MP3 (null when it was too short or empty). */
  finish(): Promise<{ mp3: Uint8Array; ms: number } | null>;
  /** Stops capturing and throws everything away. */
  cancel(): void;
}

function release(stream: MediaStream): void {
  for (const t of stream.getTracks()) t.stop();
}

/** Decodes whatever the browser recorded and converts it to mono 16 kHz. */
async function toMono16k(blob: Blob): Promise<Float32Array> {
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const frames = Math.max(1, Math.ceil(decoded.duration * VOICE_SAMPLE_RATE));
    const offline = new OfflineAudioContext(1, frames, VOICE_SAMPLE_RATE);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination); // a mono destination mixes the channels down
    src.start();
    const rendered = await offline.startRendering();
    return rendered.getChannelData(0).slice();
  } finally {
    void ctx.close().catch(() => {});
  }
}

/**
 * Asks for the microphone (only now) and starts recording. The caller decides when to finish; `maxSec` is enforced by the caller too, but
 * the encoded result is cut to it here as a backstop. The stream is released on finish, cancel and failure.
 */
export async function startRecording(maxSec: number): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  let rec: MediaRecorder;
  try {
    rec = new MediaRecorder(stream);
  } catch (e) {
    release(stream);
    throw e;
  }
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const started = Date.now();
  const stopped = new Promise<void>((resolve) => {
    rec.onstop = () => resolve();
    rec.onerror = () => resolve();
  });
  rec.start();
  let done = false;
  const stop = (): Promise<void> => {
    if (done) return stopped;
    done = true;
    if (rec.state !== "inactive") rec.stop();
    else release(stream);
    return stopped.then(() => release(stream));
  };
  return {
    async finish() {
      const ms = Date.now() - started;
      await stop();
      if (ms < VOICE_MIN_MS || chunks.length === 0) return null;
      const samples = await toMono16k(new Blob(chunks, { type: rec.mimeType }));
      chunks.length = 0;
      const cut = samples.subarray(0, Math.floor(maxSec * VOICE_SAMPLE_RATE));
      const mp3 = await encodeMp3(cut);
      return { mp3, ms: Math.round((cut.length / VOICE_SAMPLE_RATE) * 1000) };
    },
    cancel() {
      chunks.length = 0;
      void stop();
    },
  };
}
