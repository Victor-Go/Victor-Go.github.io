import { useState } from "react";
import { ApiError } from "../net/api";
import { refreshContacts, removeContact } from "../client";
import { errorOf } from "../i18nApp";
import { PATH, go } from "../route";
import type { Contact } from "../store";
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
    <Modal title={`@${contact.handle}`} onClose={onClose} closeLabel={a.close}>
      {error && <div className="ch-notice">{error}</div>}
      <div className="ch-row">
        <Avatar userId={contact.userId} size={48} admin={contact.role === "admin"} />
        <div className="ch-row-text">
          <div className="ch-row-title">
            @{contact.handle} <TitleBadge userId={contact.userId} role={contact.role} />
          </div>
        </div>
      </div>
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
