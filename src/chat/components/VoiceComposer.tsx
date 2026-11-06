import { useEffect, useRef, useState } from "react";
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
}

/** The microphone button and, while recording, the timer with cancel and send. The microphone is asked for only when the button is pressed. */
export function VoiceComposer({ conv, disabled, onBusy, onError }: Props) {
  const { a } = useLang();
  const maxSec = useChat((s) => s.voiceMaxSec);
  const voiceOff = useChat((s) => s.voiceOff);
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const rec = useRef<Recording | null>(null);
  const startedAt = useRef(0);
  const finishing = useRef(false);

  useEffect(() => onBusy(phase === "recording" || phase === "encoding"), [phase, onBusy]);
  // Leaving the chat (or the page) while recording throws the recording away and releases the microphone.
  useEffect(
    () => () => {
      rec.current?.cancel();
      rec.current = null;
    },
    [],
  );

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
      onError(a.voiceFailed);
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

  if (voiceOff || !voiceSupported()) return null;

  const start = async () => {
    onError(null);
    setPhase("starting");
    try {
      const r = await startRecording(maxSec);
      rec.current = r;
      startedAt.current = Date.now();
      setElapsed(0);
      setPhase("recording");
    } catch (e) {
      setPhase("idle");
      onError(e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError") ? a.voiceDenied : a.voiceFailed);
    }
  };

  if (phase === "recording" || phase === "encoding") {
    return (
      <div className="ch-rec" role="group" aria-label={a.voiceRecording}>
        <button type="button" className="ch-icon" aria-label={a.voiceCancel} disabled={phase === "encoding"} onClick={() => void finish(false)}>
          <X size={20} />
        </button>
        <span className="ch-rec-dot" aria-hidden="true" />
        <span className="ch-rec-time" role="timer" aria-label={a.voiceRecording}>
          {formatDuration(elapsed)} / {formatDuration(maxSec * 1000)}
        </span>
        <button type="button" className="ch-send" aria-label={a.voiceSend} disabled={phase === "encoding" || elapsed < VOICE_MIN_MS} onClick={() => void finish(true)}>
          <Send size={20} />
        </button>
      </div>
    );
  }
  return (
    <button type="button" className="ch-icon ch-mic" aria-label={a.voiceRecord} disabled={disabled || phase === "starting"} onClick={() => void start()}>
      <Mic size={22} />
    </button>
  );
}
