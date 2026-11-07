import { useMemo, useState } from "react";
import { UserPlus, Users } from "lucide-react";
import { acceptRequest, createGroup, declineRequest, requestContact, ApiError, type Progress } from "../client";
import { errorText } from "../i18nApp";
import { PATH, go } from "../route";
import { useChat } from "../store";
import { useLang } from "../useChat";
import { checkHandle } from "../validation";
import { HandleField } from "./HandleField";
import { NotifyPrompt } from "./NotifyPrompt";
import { NO_AUTOFILL } from "./noAutofill";
import { Avatar, Modal, Steps } from "./ui";
import { onEnter } from "../keys";

function AddContactDialog({ onClose }: { onClose: () => void }) {
  const { m, a } = useLang();
  const [handle, setHandle] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const problem = handle ? checkHandle(handle) : null;
  const ready = !!handle && !problem && !progress;
  const send = async () => {
    if (!ready) return;
    setMessage(null);
    setProgress({ step: "pow", fraction: 0 });
    try {
      await requestContact(handle, setProgress);
      setMessage({ ok: true, text: a.addContactDone });
      setHandle("");
    } catch (e) {
      const reason = e instanceof ApiError && e.code === "conflict" ? String(e.extra.reason ?? "") : "";
      setMessage({ ok: false, text: a.addContactConflict[reason] ?? errorText(a, e instanceof ApiError ? e.code : "internal") });
    } finally {
      setProgress(null);
    }
  };
  return (
    <Modal title={a.addContactTitle} onClose={onClose} closeLabel={a.close}>
      <p className="ch-hint">{a.addContactHint}</p>
      <HandleField
        label={m.handle}
        hint={m.handleHint}
        problem={problem ? (m.handleProblem[problem as keyof typeof m.handleProblem] ?? null) : null}
        value={handle}
        onChange={(v) => {
          setMessage(null);
          setHandle(v);
        }}
        onEnter={() => void send()}
        autoFocus
      />
      <Steps progress={progress} m={m} />
      {message && <div className={message.ok ? "ch-notice ch-ok" : "ch-notice"}>{message.text}</div>}
      <button type="button" className="ch-primary" disabled={!ready} onClick={() => void send()}>
        {progress ? a.working : a.addContactSubmit}
      </button>
    </Modal>
  );
}

/** Only the administrator creates groups; members are invited by name from the group's info panel. */
function NewGroupDialog({ onClose }: { onClose: () => void }) {
  const { a } = useLang();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await createGroup(name.trim());
      onClose();
    } catch (e) {
      setError(errorText(a, e instanceof ApiError ? e.code : "internal"));
      setBusy(false);
    }
  };
  return (
    <Modal title={a.newGroup} onClose={onClose} closeLabel={a.close}>
      <label className="ch-field">
        <span className="ch-label">{a.groupName}</span>
        <input
          className="ch-input"
          {...NO_AUTOFILL}
          value={name}
          maxLength={40}
          autoFocus
          onChange={(e) => {
            setError(null);
            setName(e.target.value);
          }}
          onKeyDown={onEnter(() => void create())}
        />
      </label>
      <p className="ch-hint">{a.newGroupHint}</p>
      {error && <div className="ch-notice">{error}</div>}
      <button type="button" className="ch-primary" disabled={!name.trim() || busy} onClick={() => void create()}>
        {busy ? a.working : a.create}
      </button>
    </Modal>
  );
}

export function ContactsPane() {
  const { a } = useLang();
  const { contacts: contactList, groups: groupList, requests, unread, mentions, activeConv, me, lastActive } = useChat();
  // Most recently used first; conversations with nothing known yet keep the server's order after them (the sort is stable).
  const contacts = useMemo(() => [...contactList].sort((x, y) => (lastActive[y.convId] ?? 0) - (lastActive[x.convId] ?? 0)), [contactList, lastActive]);
  const groups = useMemo(() => [...groupList].sort((x, y) => (lastActive[y.id] ?? 0) - (lastActive[x.id] ?? 0)), [groupList, lastActive]);
  const [dialog, setDialog] = useState<"add" | "group" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const isAdmin = me?.role === "admin";
  // One answer at a time: both buttons stay disabled until the server has replied, so a request cannot be accepted or declined twice.
  const answer = (id: string, fn: (id: string) => Promise<void>) => {
    if (busy !== null) return;
    setBusy(id);
    void fn(id)
      .catch(() => {})
      .finally(() => setBusy(null));
  };
  const row = (id: string, userId: string, title: string, sub?: string, admin = false, group = false) => (
    <li key={id}>
      <button type="button" className={"ch-row ch-row-btn" + (activeConv === id ? " ch-active" : "")} onClick={() => go(group ? PATH.group : PATH.conversation, id)}>
        <Avatar userId={userId} admin={admin} />
        <div className="ch-row-text">
          <div className="ch-row-title">{title}</div>
          {sub && <div className="ch-hint">{sub}</div>}
        </div>
        {(unread[id] ?? 0) > 0 && (
          <span className={"ch-badge" + (mentions[id] ? " ch-mention" : "")}>
            {unread[id] > 99 ? "99+" : unread[id]}
          </span>
        )}
      </button>
    </li>
  );
  return (
    <aside className="ch-list">
      <header className="ch-list-head">
        <h1>{a.tabContacts}</h1>
        <span>
          <button type="button" className="ch-icon" aria-label={a.addContact} onClick={() => setDialog("add")}>
            <UserPlus size={20} />
          </button>
          {isAdmin && (
            <button type="button" className="ch-icon" aria-label={a.newGroup} onClick={() => setDialog("group")}>
              <Users size={20} />
            </button>
          )}
        </span>
      </header>
      <NotifyPrompt />
      <div className="ch-scroll">
        {requests.length > 0 && (
          <section>
            <h3 className="ch-section">{a.requests}</h3>
            <ul className="ch-list-plain">
              {requests.map((r) => (
                <li key={r.id} className="ch-row">
                  <Avatar userId={r.user.userId} admin={r.user.role === "admin"} />
                  <div className="ch-row-text">
                    <div className="ch-row-title">@{r.user.handle}</div>
                    <div className="ch-hint">{r.direction === "in" ? a.incoming : a.outgoing}</div>
                  </div>
                  {r.direction === "in" && (
                    <span className="ch-actions">
                      <button type="button" className="ch-primary ch-small" disabled={busy !== null} aria-busy={busy === r.id} onClick={() => answer(r.id, acceptRequest)}>
                        {busy === r.id ? a.working : a.accept}
                      </button>
                      <button type="button" className="ch-secondary ch-small" disabled={busy !== null} onClick={() => answer(r.id, declineRequest)}>
                        {a.decline}
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
        {groups.length > 0 && (
          <section>
            <h3 className="ch-section">{a.groups}</h3>
            <ul className="ch-list-plain">{groups.map((g) => row(g.id, g.id, g.name, a.memberCount(g.members.length), false, true))}</ul>
          </section>
        )}
        <section>
          <h3 className="ch-section">{a.contacts}</h3>
          {contacts.length === 0 && <p className="ch-hint ch-pad">{a.noContacts}</p>}
          <ul className="ch-list-plain">{contacts.map((c) => row(c.convId, c.userId, `@${c.handle}`, c.deleted ? a.deletedTag : c.key ? undefined : a.keyMissing, c.role === "admin"))}</ul>
        </section>
      </div>
      {dialog === "add" && <AddContactDialog onClose={() => setDialog(null)} />}
      {dialog === "group" && <NewGroupDialog onClose={() => setDialog(null)} />}
    </aside>
  );
}
