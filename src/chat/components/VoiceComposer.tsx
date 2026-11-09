import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { Mic, Send, X } from "lucide-react";
import { useChat } from "../store";
import { useLang } from "../useChat";
import { sendVoice } from "../client";
import { VOICE_MIN_MS, formatDuration, startRecording, voiceSupported, type Recording } from "../voice";

type Phase = "idle" | "starting" | "recording" | "encoding";

interface Props {
  conv: string;
  disabled: boolean;
  /** True while recording or encoding, so the composer can hide the text box. */
  onBusy: (busy: boolean) => void;
  onError: (text: string | null) => void;
  /** True when the microphone button lives elsewhere (the "+" panel): only the recording bar is drawn here. */
  compact?: boolean;
  /** Filled with a handle that starts a recording, for the button elsewhere. Call it from the tap's own handler: the microphone prompt needs the gesture. */
  controlRef?: MutableRefObject<{ start: () => void } | null>;
}

/** The microphone button and, while recording, the timer with cancel and send. The microphone is asked for only when the button is pressed. */
export function VoiceComposer({ conv, disabled, onBusy, onError, compact = false, controlRef }: Props) {
  const { a } = useLang();
  const maxSec = useChat((s) => s.voiceMaxSec);
  const filesOff = useChat((s) => s.filesOff);
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const rec = useRef<Recording | null>(null);
  const startedAt = useRef(0);
  const finishing = useRef(false);
  /** Set when the recording bar is cancelled, or the chat left, while the microphone is still being opened: whatever opens is let go at once. */
  const abandoned = useRef(false);

  // The bar takes the text box's place from the moment of the tap (the microphone can take a moment to open or to be allowed), so the row
  // changes once, not twice.
  useEffect(() => onBusy(phase !== "idle"), [phase, onBusy]);
  // Leaving the chat (or the page) while recording throws the recording away and releases the microphone.
  useEffect(
    () => () => {
      abandoned.current = true;
      rec.current?.cancel();
      rec.current = null;
    },
    [],
  );

  // Hiding the page (another tab or app, the screen locking) while recording throws the recording away: the microphone is never left on in the background.
  useEffect(() => {
    if (phase !== "starting" && phase !== "recording") return;
    const abort = () => {
      if (phase === "starting") {
        abandoned.current = true;
        setPhase("idle");
      } else void finish(false);
    };
    const onVisibility = () => document.visibilityState === "hidden" && abort();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", abort);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", abort);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const finish = async (send: boolean) => {
    const r = rec.current;
    if (!r || finishing.current) return;
    finishing.current = true;
    rec.current = null;
    if (!send) {
      r.cancel();
      setPhase("idle");
      finishing.current = false;
      return;
    }
    setPhase("encoding");
    try {
      const out = await r.finish();
      if (!out) onError(a.voiceTooShort);
      else void sendVoice(conv, out.mp3, out.ms);
    } catch {
      onError(a.voiceEncodeFailed); // the microphone worked: what was recorded could not be turned into a message
    } finally {
      finishing.current = false;
      setPhase("idle");
    }
  };

  // The clock, and the automatic stop at the server's limit.
  useEffect(() => {
    if (phase !== "recording") return;
    const timer = setInterval(() => {
      const ms = Date.now() - startedAt.current;
      setElapsed(ms);
      if (ms >= maxSec * 1000) void finish(true);
    }, 200);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, maxSec]);

  const start = async () => {
    if (phase !== "idle" || disabled) return;
    onError(null);
    abandoned.current = false;
    setElapsed(0);
    setPhase("starting");
    try {
      const r = await startRecording(maxSec);
      if (abandoned.current) return r.cancel();
      rec.current = r;
      startedAt.current = Date.now();
      setElapsed(0);
      setPhase("recording");
    } catch (e) {
      if (abandoned.current) return;
      setPhase("idle");
      const name = e instanceof DOMException ? e.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") onError(a.voiceDenied);
      else if (name === "NotFoundError") onError(a.voiceNoMic);
      else if (name === "NotReadableError") onError(a.voiceBusy);
      else onError(a.voiceFailed);
    }
  };
  // Runs after every render so the handle never holds an old `phase`.
  useEffect(() => {
    if (!controlRef) return;
    controlRef.current = { start: () => void start() };
    return () => {
      controlRef.current = null;
    };
  });

  if (filesOff || !voiceSupported()) return null;

  if (phase !== "idle") {
    return (
      <div className="ch-rec" role="group" aria-label={a.voiceRecording}>
        <button
          type="button"
          className="ch-icon"
          aria-label={a.voiceCancel}
          disabled={phase === "encoding"}
          onClick={() => {
            if (phase === "starting") {
              abandoned.current = true; // the microphone that is being opened is let go when it arrives
              setPhase("idle");
            } else void finish(false);
          }}
        >
          <X size={20} />
        </button>
        <span className="ch-rec-dot" aria-hidden="true" />
        <span className="ch-rec-time" role="timer" aria-label={a.voiceRecording}>
          {formatDuration(elapsed)} / {formatDuration(maxSec * 1000)}
        </span>
        <button type="button" className="ch-send" aria-label={a.voiceSend} disabled={phase !== "recording" || elapsed < VOICE_MIN_MS} onClick={() => void finish(true)}>
          <Send size={20} />
        </button>
      </div>
    );
  }
  if (compact) return null;
  return (
    <button type="button" className="ch-icon ch-mic" aria-label={a.voiceRecord} disabled={disabled} onClick={() => void start()}>
      <Mic size={22} />
    </button>
  );
}
