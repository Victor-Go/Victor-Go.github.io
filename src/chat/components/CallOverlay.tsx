import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Lock, Mic, MicOff, Phone, PhoneOff } from "lucide-react";
import { canChooseOutput, keepScreenAwake, listOutputs, onOutputsChange, sendOutputTo, type Output } from "../callDevice";
import { answerCall, declineCall, hangUpCall, setCallMuted } from "../client";
import { contactLabel, useChat } from "../store";
import { useLang } from "../useChat";
import { Avatar } from "./ui";

/** How long the lock cover must be pressed to let go. */
export const HOLD_MS = 3000;

/** mm:ss since the audio came up. */
function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const sec = Math.max(0, Math.floor((now - since) / 1000));
  return <>{`${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`}</>;
}

/**
 * The voice call on screen: ringing (answer or decline), calling, connecting, in the call (mute, hang up) and, for a moment, how it ended. It is
 * drawn outside #root so that the privacy cover (which blurs #root and ignores taps there) can never hide or block the way to hang up.
 * The other person's audio plays from a hidden <audio> element.
 */
export function CallOverlay() {
  const { a } = useLang();
  const call = useChat((s) => s.call);
  const who = useChat((s) => {
    const c = s.contacts.find((x) => x.userId === s.call?.userId);
    return c ? contactLabel(c) : "";
  });
  const audio = useRef<HTMLAudioElement>(null);
  const remote = call?.remote ?? null;
  // From answering until the end: the screen stays awake, the sound output can be chosen, and the screen can be locked against stray touches.
  const live = call?.phase === "connecting" || call?.phase === "active";
  const [locked, setLocked] = useState(false);
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [outputId, setOutputId] = useState("");
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // True while a finger is held on the lock cover: the ring fills for HOLD_MS, and only a press that lasts that long unlocks.
  const [holding, setHolding] = useState(false);
  const stopHold = () => {
    clearTimeout(holdTimer.current);
    setHolding(false);
  };
  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    el.srcObject = remote;
    if (remote) void el.play().catch(() => {});
  }, [remote]);
  useEffect(() => {
    if (!live) {
      setLocked(false);
      return;
    }
    const release = keepScreenAwake();
    let gone = false;
    const refresh = () => void listOutputs().then((list) => !gone && setOutputs(list));
    refresh();
    const stop = onOutputsChange(refresh);
    return () => {
      gone = true;
      release();
      stop();
    };
  }, [live]);
  useEffect(() => {
    if (outputId && audio.current) void sendOutputTo(audio.current, outputId);
  }, [outputId, remote]);
  useEffect(() => () => clearTimeout(holdTimer.current), []);
  if (!call) return null;

  const status =
    call.phase === "ringing"
      ? a.call.incoming
      : call.phase === "calling"
        ? a.call.calling
        : call.phase === "connecting"
          ? a.call.connecting
          : call.phase === "active" && call.startedAt !== null
            ? <Elapsed since={call.startedAt} />
            : call.phase === "ended" && call.reason
              ? a.call.reasons[call.reason]
              : "";

  return createPortal(
    <div className="ch-call" role="dialog" aria-modal="false" aria-label={a.call.title} data-phase={call.phase}>
      <audio ref={audio} autoPlay playsInline />
      {locked && live && (
        <div
          className="ch-call-lock"
          role="button"
          tabIndex={0}
          aria-label={a.call.unlockHint}
          onPointerDown={() => {
            clearTimeout(holdTimer.current);
            setHolding(true);
            holdTimer.current = setTimeout(() => {
              setHolding(false);
              setLocked(false);
            }, HOLD_MS);
          }}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
          onPointerCancel={stopHold}
        >
          <div className="ch-call-ring" data-holding={holding} style={{ "--hold": `${HOLD_MS}ms` } as React.CSSProperties}>
            <svg className="ch-call-ring-svg" viewBox="0 0 44 44" width="72" height="72" aria-hidden="true">
              <circle className="ch-call-ring-track" cx="22" cy="22" r="20" />
              <circle className="ch-call-ring-fill" cx="22" cy="22" r="20" pathLength="100" />
            </svg>
            <Lock size={28} />
          </div>
          <span>{a.call.lockedHint}</span>
          <span>{a.call.unlockHint}</span>
        </div>
      )}
      <Avatar userId={call.userId} size={64} />
      <div className="ch-call-who">{who}</div>
      <div className="ch-call-status" role="status" aria-live="assertive">
        {status}
      </div>
      {live && call.net && (
        <div className="ch-call-net" data-flowing={call.net.flowing}>
          {call.net.path === "none" ? `${a.call.pathNone} (${call.net.ice})` : `${call.net.path === "relay" ? a.call.pathRelay : a.call.pathDirect} · ${call.net.flowing ? a.call.hearing : a.call.silent}`}
        </div>
      )}
      {live && canChooseOutput() && outputs.length >= 2 && (
        <select className="ch-call-select" aria-label={a.call.output} value={outputId} onChange={(e) => setOutputId(e.target.value)}>
          <option value="">{a.call.output}</option>
          {outputs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      )}
      <div className="ch-call-actions">
        {call.phase === "ringing" && (
          <>
            <button type="button" className="ch-call-btn ch-call-decline" aria-label={a.call.decline} onClick={declineCall}>
              <PhoneOff size={24} />
            </button>
            <button type="button" className="ch-call-btn ch-call-accept" aria-label={a.call.accept} onClick={() => void answerCall()}>
              <Phone size={24} />
            </button>
          </>
        )}
        {(call.phase === "connecting" || call.phase === "active") && (
          <button type="button" className="ch-call-btn" aria-label={call.muted ? a.call.unmute : a.call.mute} aria-pressed={call.muted} onClick={() => setCallMuted(!call.muted)}>
            {call.muted ? <MicOff size={24} /> : <Mic size={24} />}
          </button>
        )}
        {live && (
          <button type="button" className="ch-call-btn" aria-label={a.call.lock} onClick={() => setLocked(true)}>
            <Lock size={24} />
          </button>
        )}
        {(call.phase === "calling" || call.phase === "connecting" || call.phase === "active") && (
          <button type="button" className="ch-call-btn ch-call-decline" aria-label={a.call.hangUp} onClick={hangUpCall}>
            <PhoneOff size={24} />
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
