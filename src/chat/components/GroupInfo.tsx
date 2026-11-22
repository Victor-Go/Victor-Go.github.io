import { useState } from "react";
import { acceptOwnership, deleteGroup, inviteToGroup, kickMember, leaveGroup, muteGroup, rekeyGroup, takeOverGroup, transferGroup } from "../client";
import { errorOf } from "../i18nApp";
import { PATH, go } from "../route";
import { GROUP_MAX, contactLabel, useCan, useChat, type Group } from "../store";
import { useLang } from "../useChat";
import { checkHandle } from "../validation";
import { HandleField } from "./HandleField";
import { Avatar, ConfirmModal, Modal, TitleBadge } from "./ui";

export function GroupInfo({ group, onClose }: { group: Group; onClose: () => void }) {
  const { m, a } = useLang();
  const me = useChat((s) => s.me)!;
  const contacts = useChat((s) => s.contacts);
  const [invite, setInvite] = useState("");
  const [ok, setOk] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [transferTo, setTransferTo] = useState("");
  const [inviting, setInviting] = useState(false);
  const [confirm, setConfirm] = useState<"takeOver" | "delete" | null>(null);
  const [kicking, setKicking] = useState<{ userId: string; handle: string } | null>(null);
  const canDeleteAny = useCan("groups.delete_any");
  const canMuteAny = useCan("groups.mute_any");
  const canTakeOver = useCan("groups.take_over");
  const isOwner = group.ownerId === me.userId;
  const canMute = isOwner || canMuteAny;
  const mutedUsers = group.mutedUsers ?? [];
  const offered = group.pendingOwner?.userId === me.userId;

  const run = async (fn: () => Promise<void>, closeAfter = false) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (closeAfter) {
        go(PATH.home);
        onClose();
      }
    } catch (e) {
      setError(errorOf(a, e));
    } finally {
      setBusy(false);
    }
  };

  const sendInvite = () => {
    if (busy || !invite || checkHandle(invite) || group.members.length >= Math.min(GROUP_MAX, group.max)) return;
    const name = invite;
    setInviting(true);
    void run(async () => {
      try {
        await inviteToGroup(group.id, name);
        setInvite("");
        setOk(a.invited(name));
      } finally {
        setInviting(false);
      }
    });
  };

  return (
    <Modal title={group.name} onClose={onClose} closeLabel={a.close}>
      {error && <div className="ch-notice">{error}</div>}
      {offered && (
        <div className="ch-callout">
          <p>{a.ownerOffer}</p>
          <button type="button" className="ch-primary" disabled={busy} onClick={() => void run(() => acceptOwnership(group.id))}>
            {a.acceptOwner}
          </button>
        </div>
      )}
      {isOwner && group.needsRekey && (
        <div className="ch-callout">
          <p>{a.needsRekey}</p>
          <button type="button" className="ch-primary" disabled={busy} onClick={() => void run(() => rekeyGroup(group.id))}>
            {a.rekey}
          </button>
        </div>
      )}
      {isOwner && (
        <section>
          <h3 className="ch-section">{a.inviteMember}</h3>
          <HandleField
            label={m.handle}
            hint={a.inviteHint}
            problem={invite && checkHandle(invite) ? (m.handleProblem[checkHandle(invite) as keyof typeof m.handleProblem] ?? null) : null}
            value={invite}
            onChange={(v) => {
              setOk(null);
              setError(null);
              setInvite(v);
            }}
            onEnter={() => void sendInvite()}
          />
          {ok && (
            <div className="ch-notice ch-ok ch-spaced" role="status">
              {ok}
            </div>
          )}
          <button
            type="button"
            className="ch-primary ch-btn-icon"
            aria-busy={inviting}
            disabled={busy || !invite || !!checkHandle(invite) || group.members.length >= Math.min(GROUP_MAX, group.max)}
            onClick={() => void sendInvite()}
          >
            {inviting && <span className="ch-spinner" aria-hidden="true" />}
            {inviting ? a.inviting : a.invite}
          </button>
        </section>
      )}
      <section>
        <h3 className="ch-section">{a.members(group.members.length, Math.min(GROUP_MAX, group.max))}</h3>
        <ul className="ch-list-plain">
          {group.members.map((mem) => (
            <li key={mem.userId} className="ch-row">
              <Avatar userId={mem.userId} size={32} admin={mem.role === "admin"} />
              <div className="ch-row-text ch-row-title">
                {contactLabel(contacts.find((c) => c.userId === mem.userId) ?? mem)} {mem.userId === group.ownerId && <span className="ch-admin">{a.owner}</span>}
                <TitleBadge userId={mem.userId} role={mem.role} />
                {mem.role !== "admin" && mem.userId !== group.ownerId && mutedUsers.includes(mem.userId) && <span className="ch-admin ch-muted-badge">{a.mutedBadge}</span>}
              </div>
              {canMute && mem.userId !== group.ownerId && mem.role !== "admin" && (
                <button type="button" className="ch-secondary ch-small" disabled={busy} onClick={() => void run(() => muteGroup(group.id, !mutedUsers.includes(mem.userId), mem.userId))}>
                  {mutedUsers.includes(mem.userId) ? a.unmuteMember : a.muteMember}
                </button>
              )}
              {isOwner && mem.userId !== me.userId && (
                <button type="button" className="ch-secondary ch-small" disabled={busy} onClick={() => setKicking({ userId: mem.userId, handle: mem.handle })}>
                  {a.kick}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
      {canMute && (
        <section className="ch-row-form">
          <span className="ch-hint ch-grow">{a.muteAllHint}</span>
          <button type="button" className="ch-secondary" disabled={busy} onClick={() => void run(() => muteGroup(group.id, !group.muted))}>
            {group.muted ? a.unmuteAll : a.muteAll}
          </button>
        </section>
      )}
      {isOwner && group.members.length > 1 && (
        <section className="ch-row-form">
          <select className="ch-input" value={transferTo} aria-label={a.transferTo} onChange={(e) => setTransferTo(e.target.value)}>
            <option value="">{a.transferTo}…</option>
            {group.members.filter((x) => x.userId !== me.userId).map((x) => (
              <option key={x.userId} value={x.userId}>
                @{x.handle}
              </option>
            ))}
          </select>
          <button type="button" className="ch-secondary" disabled={busy || !transferTo} onClick={() => void run(() => transferGroup(group.id, transferTo))}>
            {a.transfer}
          </button>
        </section>
      )}
      <div className="ch-actions-col">
        {!isOwner && (
          <button type="button" className="ch-secondary" disabled={busy} onClick={() => void run(() => leaveGroup(group.id), true)}>
            {a.leave}
          </button>
        )}
        {!isOwner && canTakeOver && (
          <button
            type="button"
            className="ch-secondary"
            disabled={busy}
            onClick={() => setConfirm("takeOver")}
          >
            {a.takeOver}
          </button>
        )}
        {(isOwner || canDeleteAny) && (
          <button
            type="button"
            className="ch-danger"
            disabled={busy}
            onClick={() => setConfirm("delete")}
          >
            {a.deleteGroup}
          </button>
        )}
      </div>
      {kicking && (
        <ConfirmModal
          title={a.kick}
          confirmLabel={a.kick}
          cancelLabel={a.cancel}
          closeLabel={a.close}
          danger
          busy={busy}
          onConfirm={() => {
            const who = kicking;
            setKicking(null);
            void run(() => kickMember(group.id, who.userId));
          }}
          onCancel={() => setKicking(null)}
        >
          <p>{a.confirmKick(kicking.handle)}</p>
        </ConfirmModal>
      )}
      {confirm && (
        <ConfirmModal
          title={confirm === "delete" ? a.deleteGroup : a.takeOver}
          confirmLabel={confirm === "delete" ? a.deleteGroup : a.takeOver}
          cancelLabel={a.cancel}
          closeLabel={a.close}
          danger={confirm === "delete"}
          busy={busy}
          onConfirm={() => {
            const which = confirm;
            setConfirm(null);
            void (which === "delete" ? run(() => deleteGroup(group.id), true) : run(() => takeOverGroup(group.id)));
          }}
          onCancel={() => setConfirm(null)}
        >
          <p>{confirm === "delete" ? a.confirmDeleteGroup : a.confirmTakeOver}</p>
        </ConfirmModal>
      )}
    </Modal>
  );
}
