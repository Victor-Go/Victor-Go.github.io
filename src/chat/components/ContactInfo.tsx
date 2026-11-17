import { useState } from "react";
import { ApiError } from "../net/api";
import { refreshContacts, removeContact, setContactNick } from "../client";
import { errorOf } from "../i18nApp";
import { PATH, go } from "../route";
import { contactLabel, type Contact } from "../store";
import { NICK_MAX, cleanNick } from "../validation";
import { useLang } from "../useChat";
import { useCan } from "../store";
import { SendCardModal } from "./SendCardModal";
import { Avatar, Modal, TitleBadge } from "./ui";

/** The other person of a 1:1 chat: who they are, and the way to remove them (which removes the chat for both of you). */
export function ContactInfo({ contact, onClose }: { contact: Contact; onClose: () => void }) {
  const { a } = useLang();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const canSendCard = useCan("cards");
  const [nick, setNick] = useState(contact.nick ?? "");
  const nickChanged = cleanNick(nick) !== (contact.nick ?? "");

  const saveNick = async () => {
    if (busy || !nickChanged) return;
    setBusy(true);
    setError(null);
    try {
      await setContactNick(contact.userId, nick);
      setNick(cleanNick(nick));
    } catch (e) {
      setError(errorOf(a, e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy || !window.confirm(a.confirmRemoveContact)) return;
    setBusy(true);
    setError(null);
    try {
      await removeContact(contact.userId);
      go(PATH.home);
      onClose();
    } catch (e) {
      setError(errorOf(a, e));
      setBusy(false);
      // Already gone on the server (the other person removed it first): bring the list up to date.
      if (e instanceof ApiError && e.extra.reason === "no_contact") void refreshContacts().catch(() => {});
    }
  };

  return (
    <Modal title={contactLabel(contact)} onClose={onClose} closeLabel={a.close}>
      {error && <div className="ch-notice">{error}</div>}
      <div className="ch-row">
        <Avatar userId={contact.userId} size={48} admin={contact.role === "admin"} />
        <div className="ch-row-text">
          <div className="ch-row-title">
            {contactLabel(contact)} <TitleBadge userId={contact.userId} role={contact.role} />
          </div>
        </div>
      </div>
      {contact.key && !contact.deleted && (
        <label className="ch-field">
          <span className="ch-label">{a.nickLabel}</span>
          <input
            className="ch-input"
            value={nick}
            maxLength={NICK_MAX * 2}
            placeholder={a.nickPlaceholder(NICK_MAX)}
            disabled={busy}
            onChange={(e) => setNick(Array.from(e.target.value).slice(0, NICK_MAX).join(""))}
            onKeyDown={(e) => e.key === "Enter" && void saveNick()}
          />
          <button type="button" className="ch-secondary" disabled={busy || !nickChanged} onClick={() => void saveNick()}>
            {a.saveNick}
          </button>
        </label>
      )}
      <div className="ch-actions-col">
        {canSendCard && contact.role !== "admin" && (
          <button type="button" className="ch-secondary" disabled={busy} onClick={() => setCardOpen(true)}>
            {a.manage.sendCard}
          </button>
        )}
        <button type="button" className="ch-danger" disabled={busy} onClick={() => void remove()}>
          {a.removeContact}
        </button>
      </div>
      {cardOpen && <SendCardModal recipient={contact} onClose={() => setCardOpen(false)} />}
    </Modal>
  );
}
