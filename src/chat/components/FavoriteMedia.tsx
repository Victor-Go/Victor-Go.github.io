import { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";
import { ApiError, favoriteImageUrl, playFavoriteVoice } from "../client";
import { errorOf } from "../i18nApp";
import type { Favorite } from "../store";
import { useLang } from "../useChat";
import { formatDuration } from "../voice";
import { stopVoice, usePlayingVoice } from "../voicePlayer";

/**
 * The voice message or picture saved with a favourite (protocol 10a). It is downloaded and opened with the favourite's own key when it is
 * shown (a picture) or played (a recording); when it is gone for good it says the same as a destroyed text.
 */
export function FavoriteMedia({ f }: { f: Favorite }) {
  const { a } = useLang();
  const playing = usePlayingVoice();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (f.kind !== "image") return;
    let live = true;
    favoriteImageUrl(f)
      .then((u) => {
        if (!live) return;
        if (u) setUrl(u);
        else setGone(true);
      })
      .catch((e) => live && setError(e instanceof ApiError ? errorOf(a, e) : a.imageFailed));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.id, f.gen, f.kind]);

  if (gone) return <div className="ios-text ios-gone">{a.undecryptable}</div>;
  if (f.kind === "image") {
    return url ? (
      <img className="ios-fav-image" src={url} alt={a.imageMessage} width={f.w} height={f.h} draggable={false} />
    ) : error ? (
      <div className="ch-bad ch-hint" role="alert">
        {error}
      </div>
    ) : (
      <span className="ch-spinner" aria-hidden="true" />
    );
  }

  const key = `fav:${f.id}`;
  const on = playing === key;
  const toggle = async () => {
    if (on) return stopVoice();
    setError(null);
    setBusy(true);
    try {
      if (!(await playFavoriteVoice(f))) setGone(true);
    } catch (e) {
      setError(e instanceof ApiError ? errorOf(a, e) : a.voicePlayFailed);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="ch-voice">
      <button type="button" className="ch-voice-btn" aria-label={on ? a.voicePause : a.voicePlay} aria-pressed={on} disabled={busy} onClick={() => void toggle()}>
        {on ? <Pause size={18} /> : <Play size={18} />}
      </button>
      <span className="ch-voice-label">{a.voiceMessage}</span>
      <span className="ch-voice-time">{formatDuration(f.ms ?? 0)}</span>
      {error && (
        <span className="ch-bad ch-hint" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
