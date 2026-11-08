import { useState } from "react";
import { OFFICIAL_ID } from "../avatar";
import { ApiError, requestViaCard, type Progress } from "../client";
import { formatClock, formatDay } from "../format";
import { errorOf } from "../i18nApp";
import { cardStatus, parseCard, parseDeclined, parseRemoved } from "../official";
import { useChat, type Msg } from "../store";
import { useLang } from "../useChat";
import { Avatar, Steps } from "./ui";

/** One message of the read-only official conversation: a full-width system card, never a bubble (nothing a person writes can imitate it). */
export function OfficialMessage({ m, selecting }: { m: Msg; selecting: boolean }) {
  const { lang, a, m: texts } = useLang();
  const skew = useChat((s) => s.clockSkew);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);
  const [note, setNote] = useState(false);
  const when = (t: number) => `${formatDay(t, Date.now(), lang, { today: a.today, yesterday: a.yesterday })} ${formatClock(t, lang)}`;

  if (m.kind === "contact_removed") {
    const r = parseRemoved(m.data);
    return (
      <div className="ch-system" role="note" data-official="contact_removed">
        <Avatar userId={OFFICIAL_ID} size={18} />
        <strong>{r ? a.officialRemoved(r.handle, r.reason) : a.officialUnknown}</strong>
        <span>{formatClock(m.time, lang)}</span>
      </div>
    );
  }

  if (m.kind === "contact_declined") {
    const d = parseDeclined(m.data);
    return (
      <div className="ch-system" role="note" data-official="contact_declined">
        <Avatar userId={OFFICIAL_ID} size={18} />
        <strong>{d ? a.officialDeclined(d.handle) : a.officialUnknown}</strong>
        <span>{formatClock(m.time, lang)}</span>
      </div>
    );
  }

  if (m.kind === "card") {
    const card = parseCard(m.data);
    if (!card) {
      return (
        <div className="ch-system" role="note" data-official="unknown">
          <strong>{a.officialUnknown}</strong>
        </div>
      );
    }
    const status = cardStatus(card, Date.now(), skew);
    const tap = async () => {
      if (progress || asked || status !== "active") return;
      setError(null);
      setProgress({ step: "pow", fraction: 0 });
      try {
        await requestViaCard(m, setProgress);
        setAsked(true);
      } catch (e) {
        const reason = e instanceof ApiError && typeof e.extra.reason === "string" ? e.extra.reason : "";
        // The card is dead, and the card itself now says why; the prompt says it plainly. Nothing in red, and no button that still seems to work.
        if (e instanceof ApiError && ((e.status === 409 && reason === "already_contacts") || (e.status === 403 && reason in a.cardRevoked))) {
          setError(reason === "already_contacts" ? a.cardAlreadyContacts : (a.cardRevoked[reason] ?? errorOf(a, e)));
          setNote(true);
        } else setError(errorOf(a, e));
      } finally {
        setProgress(null);
      }
    };
    return (
      <div className="ch-system ch-card" role="note" data-official="card" data-state={status}>
        <Avatar userId={OFFICIAL_ID} size={18} />
        <strong>{a.cardTitle}</strong>
        <span className="ch-card-who">{a.cardFor(card.subjectHandle)}</span>
        <span>{status === "active" ? a.cardExpires(when(card.expiresAt)) : status === "revoked" ? (a.cardRevoked[card.reason] ?? a.cardState.revoked) : a.cardState[status]}</span>
        <Steps progress={progress} m={texts} />
        {error && (
          <span className={(note ? "" : "ch-bad ") + "ch-hint"} role="alert">
            {error}
          </span>
        )}
        {status === "active" && (
          <button type="button" className="ch-primary ch-small" disabled={!!progress || asked || selecting} onClick={() => void tap()}>
            {progress ? a.working : asked ? a.addContactDone : a.cardUse}
          </button>
        )}
        <span>{formatClock(m.time, lang)}</span>
      </div>
    );
  }

  return (
    <div className="ch-system" role="note" data-official="unknown">
      <strong>{a.officialUnknown}</strong>
      <span>{formatClock(m.time, lang)}</span>
    </div>
  );
}
