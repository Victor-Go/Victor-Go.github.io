import { useState } from "react";
import { ApiError, removeContact } from "../client";
import { errorText } from "../i18nApp";
import { PATH, go } from "../route";
import type { Contact } from "../store";
import { useLang } from "../useChat";
import { Avatar, Modal } from "./ui";

/** The other person of a 1:1 chat: who they are, and the way to remove them (which removes the chat for both of you). */
export function ContactInfo({ contact, onClose }: { contact: Contact; onClose: () => void }) {
  const { a } = useLang();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (busy || !window.confirm(a.confirmRemoveContact)) return;
    setBusy(true);
    setError(null);
    try {
      await removeContact(contact.userId);
      go(PATH.home);
      onClose();
    } catch (e) {
      setError(errorText(a, e instanceof ApiError ? e.code : "internal"));
      setBusy(false);
    }
  };

  return (
    <Modal title={`@${contact.handle}`} onClose={onClose} closeLabel={a.close}>
      {error && <div className="ch-notice">{error}</div>}
      <div className="ch-row">
        <Avatar userId={contact.userId} size={48} admin={contact.role === "admin"} />
        <div className="ch-row-text">
          <div className="ch-row-title">
            @{contact.handle} {contact.role === "admin" && <span className="ch-admin">{a.adminBadge}</span>}
          </div>
        </div>
      </div>
      <div className="ch-actions-col">
        <button type="button" className="ch-danger" disabled={busy} onClick={() => void remove()}>
          {a.removeContact}
        </button>
      </div>
    </Modal>
  );
}
