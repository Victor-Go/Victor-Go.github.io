import { useMemo, useState } from "react";
import { UserPlus, Users } from "lucide-react";
import { acceptRequest, createGroup, declineRequest, requestContact, type Progress } from "../client";
import { errorOf } from "../i18nApp";
import { PATH, go } from "../route";
import { useCan, useChat } from "../store";
import { useLang } from "../useChat";
import { checkHandle } from "../validation";
import { HandleField } from "./HandleField";
import { NotifyPrompt } from "./NotifyPrompt";
import { NO_AUTOFILL } from "./noAutofill";
import { Avatar, Modal, Steps, TitleBadge } from "./ui";
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
      setMessage({ ok: false, text: errorOf(a, e) });
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

/**
 * With contacts blocked the server still accepts a request to (or from) an administrator and refuses everybody else, so this lists the
 * administrators the person is not already in touch with: a tap sends the request the same way as the normal flow (same work, same errors).
 */
function AddAdminDialog({ onClose }: { onClose: () => void }) {
  const { m, a } = useLang();
  const me = useChat((s) => s.me);
  const adminList = useChat((s) => s.adminList);
  const contacts = useChat((s) => s.contacts);
  const requests = useChat((s) => s.requests);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const taken = new Set([me?.userId, ...contacts.map((c) => c.userId), ...requests.map((r) => r.user.userId)]);
  const candidates = adminList.filter((x) => !taken.has(x.userId));
  const send = async (handle: string) => {
    if (progress) return;
    setMessage(null);
    setProgress({ step: "pow", fraction: 0 });
    try {
      await requestContact(handle, setProgress);
      setMessage({ ok: true, text: a.addContactDone });
    } catch (e) {
      setMessage({ ok: false, text: errorOf(a, e) });
    } finally {
      setProgress(null);
    }
  };
  return (
    <Modal title={a.addAdminTitle} onClose={onClose} closeLabel={a.close}>
      <p className="ch-hint">{a.addAdminHint}</p>
      {candidates.length === 0 ? (
        <p className="ch-hint">{a.addAdminNone}</p>
      ) : (
        <ul className="ch-list-plain">
          {candidates.map((x) => (
            <li key={x.userId}>
              <button type="button" className="ch-row ch-row-btn" disabled={progress !== null} onClick={() => void send(x.handle)}>
                <Avatar userId={x.userId} admin />
                <div className="ch-row-text">
                  <div className="ch-row-title">
                    @{x.handle} <TitleBadge userId={x.userId} role="admin" />
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Steps progress={progress} m={m} />
      {message && <div className={message.ok ? "ch-notice ch-ok" : "ch-notice"}>{message.text}</div>}
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
      setError(errorOf(a, e));
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
  const { contacts: contactList, groups: groupList, requests, unread, mentions, activeConv, lastActive, official, account, adminList, me } = useChat();
  // Most recently used first; conversations with nothing known yet keep the server's order after them (the sort is stable).
  const contacts = useMemo(() => [...contactList].sort((x, y) => (lastActive[y.convId] ?? 0) - (lastActive[x.convId] ?? 0)), [contactList, lastActive]);
  const groups = useMemo(() => [...groupList].sort((x, y) => (lastActive[y.id] ?? 0) - (lastActive[x.id] ?? 0)), [groupList, lastActive]);
  const [dialog, setDialog] = useState<"add" | "admins" | "group" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const canCreateGroup = useCan("groups.create");
  // One answer at a time: both buttons stay disabled until the server has replied, so a request cannot be accepted or declined twice.
  const answer = (id: string, fn: (id: string) => Promise<void>) => {
    if (busy !== null) return;
    setBusy(id);
    setAnswerError(null);
    void fn(id)
      .catch((e) => setAnswerError(errorOf(a, e)))
      .finally(() => setBusy(null));
  };
  const row = (id: string, userId: string, title: string, sub?: string, admin = false, group = false, badge = admin) => (
    <li key={id}>
      <button type="button" className={"ch-row ch-row-btn" + (activeConv === id ? " ch-active" : "")} onClick={() => go(group ? PATH.group : PATH.conversation, id)}>
        <Avatar userId={userId} admin={admin} />
        <div className="ch-row-text">
          <div className="ch-row-title">
            {title}
            {badge && (
              <>
                {" "}
                <TitleBadge userId={userId} role="admin" />
              </>
            )}
          </div>
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
          {/* Blocked: the same entry opens the administrators-only list (the server lets those through). */}
          <button type="button" className="ch-icon" aria-label={account.canAddContacts ? a.addContact : a.addAdminTitle} onClick={() => setDialog(account.canAddContacts ? "add" : "admins")}>
            <UserPlus size={20} />
          </button>
          {canCreateGroup && (
            <button type="button" className="ch-icon" aria-label={a.newGroup} onClick={() => setDialog("group")}>
              <Users size={20} />
            </button>
          )}
        </span>
      </header>
      <NotifyPrompt />
      <div className="ch-scroll">
        {official && (
          // Pinned: the system's own read-only conversation stays above everything else.
          <ul className="ch-list-plain ch-pinned">{row(official, "official", a.officialTitle, undefined, true, false, false)}</ul>
        )}
        {!account.canAddContacts && (
          <p className="ch-hint ch-pad" role="status">
            {account.globalContactsBlocked ? a.contactsOffGlobal : a.contactsOffSelf}
            {adminList.some((x) => x.userId !== me?.userId) && ` ${a.contactsAdminsStill}`}
          </p>
        )}
        {requests.length > 0 && (
          <section>
            <h3 className="ch-section">{a.requests}</h3>
            {answerError && <div className="ch-notice" role="alert">{answerError}</div>}
            <ul className="ch-list-plain">
              {requests.map((r) => (
                <li key={r.id} className="ch-row">
                  <Avatar userId={r.user.userId} admin={r.user.role === "admin"} />
                  <div className="ch-row-text">
                    <div className="ch-row-title">
                      @{r.user.handle} <TitleBadge userId={r.user.userId} role={r.user.role} />
                    </div>
                    <div className="ch-hint">{r.direction === "in" ? (r.viaCard ? a.incomingViaCard : a.incoming) : a.outgoing}</div>
                  </div>
                  {r.direction === "in" && (
                    <span className="ch-actions">
                      {/* Whatever the switches say, a request made with a contact card or one from an administrator (by role, not title) can be accepted; any other only while adding contacts is allowed. */}
                      {(account.canAddContacts || r.viaCard || r.user.role === "admin") && (
                        <button type="button" className="ch-primary ch-small" disabled={busy !== null} aria-busy={busy === r.id} onClick={() => answer(r.id, acceptRequest)}>
                          {busy === r.id ? a.working : a.accept}
                        </button>
                      )}
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
      {dialog === "admins" && <AddAdminDialog onClose={() => setDialog(null)} />}
      {dialog === "group" && <NewGroupDialog onClose={() => setDialog(null)} />}
    </aside>
  );
}
