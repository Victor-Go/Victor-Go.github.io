import { useState } from "react";
import { markAdminAction } from "../adminLock";
import { ApiError, lookupUser, rawApi, type Progress } from "../client";
import { errorOf } from "../i18nApp";
import { PATH, go } from "../route";
import { useLang } from "../useChat";
import { checkHandle } from "../validation";
import { HandleField } from "./HandleField";
import { Modal, Steps } from "./ui";

interface Person {
  userId: string;
  handle: string;
}

/**
 * The administrator gives `recipient` a contact card of someone else. Like adding a contact, the person on the card is named exactly and looked up
 * with the usual work (`POST /users/lookup`); there is no list of candidates. Used from the management page and from a contact's info panel.
 * `onLocked`: what to do when the server says the management lock is closed (the management page puts its lock screen up); without it the modal
 * tells the administrator to unlock management first.
 */
export function SendCardModal({ recipient, onClose, onLocked }: { recipient: Person; onClose: () => void; onLocked?: () => void }) {
  const { m, a } = useLang();
  const [handle, setHandle] = useState("");
  const [days, setDays] = useState(3);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const problem = handle ? checkHandle(handle) : null;
  const ready = !!handle && !problem && !progress;

  const send = async () => {
    if (!ready) return;
    setError(null);
    setLocked(false);
    setProgress({ step: "pow", fraction: 0 });
    try {
      const who = await lookupUser(handle, setProgress);
      setProgress({ step: "server" });
      // The person on the card is neither the recipient nor an administrator (the server refuses both too).
      if (who.userId === recipient.userId || who.role === "admin") throw new ApiError(400, "bad_request");
      await rawApi().post("/admin/cards", { recipientId: recipient.userId, subjectId: who.userId, expiresInDays: days });
      markAdminAction();
      setDone(a.manage.sendCardDone(recipient.handle, who.handle ?? handle));
    } catch (e) {
      if (e instanceof ApiError && e.code === "stepup_required") {
        if (onLocked) onLocked();
        else setLocked(true);
      } else setError(errorOf(a, e));
    } finally {
      setProgress(null);
    }
  };

  return (
    <Modal title={a.manage.sendCard} onClose={onClose} closeLabel={a.close}>
      <p>{a.manage.sendCardTo(recipient.handle)}</p>
      {done ? (
        <div className="ch-notice ch-ok" role="status">
          {done}
        </div>
      ) : (
        <>
          <HandleField
            label={a.manage.sendCardFind}
            hint={m.handleHint}
            problem={problem ? (m.handleProblem[problem as keyof typeof m.handleProblem] ?? null) : null}
            value={handle}
            onChange={(v) => {
              setError(null);
              setHandle(v);
            }}
            onEnter={() => void send()}
            autoFocus
          />
          <label className="ch-field">
            <span className="ch-label">{a.manage.expiresInDays}</span>
            <input
              className="ch-input"
              type="number"
              min={1}
              max={30}
              value={days}
              aria-label={a.manage.expiresInDays}
              onChange={(e) => setDays(Math.min(30, Math.max(1, Math.floor(Number(e.target.value)) || 1)))}
            />
          </label>
          <Steps progress={progress} m={m} />
          {locked && (
            <div className="ch-notice" role="alert">
              {a.manage.sendCardLocked}
              <button
                type="button"
                className="ch-secondary ch-small"
                onClick={() => {
                  onClose();
                  go(PATH.management);
                }}
              >
                {a.manage.sendCardOpenManagement}
              </button>
            </div>
          )}
          {error && <div className="ch-notice">{error}</div>}
          <button type="button" className="ch-primary" disabled={!ready} onClick={() => void send()}>
            {progress ? a.working : a.manage.sendCardSend}
          </button>
        </>
      )}
    </Modal>
  );
}
