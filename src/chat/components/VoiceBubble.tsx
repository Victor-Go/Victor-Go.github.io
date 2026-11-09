import { useState } from "react";
import { Pause, Play } from "lucide-react";
import { ApiError, playVoiceMessage } from "../client";
import { errorOf } from "../i18nApp";
import type { Msg } from "../store";
import { useLang } from "../useChat";
import { formatDuration } from "../voice";
import { stopVoice, usePlayingVoice } from "../voicePlayer";

/** A voice message: play or stop, and the length. The recording is downloaded and opened on the first play only. */
export function VoiceBubble({ conv, m }: { conv: string; m: Msg }) {
  const { a } = useLang();
  const playing = usePlayingVoice();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (m.payload?.k !== "voice") return null;
  const { id, ms } = m.payload.voice;
  const on = id !== "" && playing === id;

  const toggle = async () => {
    if (on) return stopVoice();
    setError(null);
    setBusy(true);
    try {
      await playVoiceMessage(conv, m);
    } catch (e) {
      setError(e instanceof ApiError ? errorOf(a, e) : a.voicePlayFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ch-voice">
      <button type="button" className="ch-voice-btn" aria-label={on ? a.voicePause : a.voicePlay} aria-pressed={on} disabled={busy || id === ""} onClick={() => void toggle()}>
        {on ? <Pause size={18} /> : <Play size={18} />}
      </button>
      <span className="ch-voice-label">{a.voiceMessage}</span>
      <span className="ch-voice-time">{formatDuration(ms)}</span>
      {error && (
        <span className="ch-bad ch-hint" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
