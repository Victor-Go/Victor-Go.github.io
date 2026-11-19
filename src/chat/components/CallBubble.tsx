import { Phone, PhoneMissed, PhoneOff } from "lucide-react";
import type { Msg } from "../store";
import { useLang } from "../useChat";

/** mm:ss, or h:mm:ss from an hour on. */
export function talkTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
}

/**
 * The record of a voice call in the chat. The caller's client wrote it, so the same record reads differently on the two sides: a call nobody took up is
 * a missed call for the person who was rung, and "no answer" or "cancelled" for the one who rang. Whether the other person was online never shows.
 */
export function CallBubble({ m }: { m: Msg }) {
  const { a } = useLang();
  if (m.payload?.k !== "call") return null;
  const { outcome, sec } = m.payload.call;
  const mine = m.mine;
  const missed = !mine && (outcome === "noanswer" || outcome === "cancelled");
  const text =
    outcome === "answered"
      ? a.callRecord.answered(talkTime(sec))
      : outcome === "failed"
        ? a.callRecord.failed
        : outcome === "declined"
          ? mine
            ? a.callRecord.declinedByThem
            : a.callRecord.declinedByMe
          : missed
          ? a.callRecord.missed
          : outcome === "cancelled"
            ? a.callRecord.cancelled
            : a.callRecord.noAnswer;
  const Icon = outcome === "answered" ? Phone : missed ? PhoneMissed : PhoneOff;
  return (
    <div className={"ch-callrec" + (missed ? " ch-bad" : "")}>
      <Icon size={18} aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}
