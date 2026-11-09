import { useCallback, useEffect, useState } from "react";
import { Activity, Contact, KeyRound, Lock, ScrollText, SlidersHorizontal, Ticket, Timer, Users } from "lucide-react";
import { ADMIN_LOCK_MS, lockAdmin, markAdminAction, unlockedNow, useAdminLock } from "../adminLock";
import { ApiError, adminDeleteUser, rawApi, unlockAdmin, wipeEverything, type Progress } from "../client";
import { formatBytes, formatClock, formatDay } from "../format";
import { errorOf } from "../i18nApp";
import { onEnter } from "../keys";
import { PATH, go as navigate, useLocation } from "../route";
import { GROUP_MAX, useChat } from "../store";
import { useLang } from "../useChat";
import { Alert, ErrorBanner, FormRow, Group, Icon, Page, Row, SwitchRow } from "./ios";
import { NO_AUTOFILL } from "./noAutofill";
import { Secret } from "./Secret";
import { SendCardModal } from "./SendCardModal";
import { Avatar, Loading, Steps } from "./ui";

const PAGE_SIZE = 20;

interface AdminUser {
  userId: string;
  handle: string;
  role: string;
  createdAt: number;
  lastLoginAt: number;
  lastActiveAt: number;
  ips: { ip: string; at: number }[];
  loginCount: number;
  failedCount: number;
  suspended: boolean;
  /** Bytes of files (voice messages and pictures) uploaded this (UTC) month. */
  fileBytes?: number;
  /** Messages sent this (UTC) month, and the monthly limit (null for the administrator); absent from an older server. */
  messageCount?: number;
  messageLimit?: number | null;
  /** This account may not add or be added as a contact (the administrator is exempt). */
  contactsBlocked?: boolean;
}
interface Invite {
  id: string;
  note: string;
  createdAt: number;
  /** Every invite expires (protocol 2). */
  expiresAt: number;
  /** The account that registers with it starts with contacts blocked. */
  contactsBlocked?: boolean;
  /** Present until the invite is used. */
  code?: string;
  uses: { userId: string; handle: string; at: number }[];
}
interface Config {
  inviteRequired: boolean;
  registrationOpen: boolean;
  fileEnabled: boolean;
  groupMax: number;
  retentionDays: number;
  favoriteMax: number;
  /** MB of voice and images one person may upload per UTC month (1 to 256; the administrator has no limit). */
  fileMonthlyMB: number;
  /** Nobody (but the administrator) may add or be added as a contact. */
  globalContactsBlocked: boolean;
}

/** An active contact card, as the administrator lists it. */
interface AdminCard {
  id: string;
  recipientId: string;
  recipientHandle: string;
  subjectId: string;
  subjectHandle: string;
  createdAt: number;
  expiresAt: number;
}
interface Status {
  version: string;
  users: number;
  online: number;
  groups: number;
  counters: { messages: number; fileBytes: number; errors: Record<string, number> };
  recentErrors: { at: number; status: number; code: string; method: string; path: string }[];
}

interface Job {
  name: string;
  lastRunAt: number;
  lastOk: boolean | null;
  attempts: number;
  error: string;
}

type View = { k: "root" } | { k: "jobs" } | { k: "epochs" } | { k: "wipe"; scope: "messages" | "favorites" } | { k: "wipeAll" } | { k: "users" } | { k: "user"; user: AdminUser } | { k: "invites" } | { k: "cards" } | { k: "config" } | { k: "status" } | { k: "audit" };

/** Each screen has its own address (so the back gesture works); the selected user rides along in memory, never in the address. */
function addressOf(v: View): { path: string; payload?: unknown } {
  switch (v.k) {
    case "users":
    case "invites":
    case "cards":
    case "config":
    case "epochs":
    case "jobs":
    case "status":
    case "audit":
      return { path: PATH.managementPage(v.k) };
    case "user":
      return { path: PATH.managementPage("users/user"), payload: v.user };
    case "wipe":
      return { path: PATH.managementPage(v.scope === "messages" ? "epochs/wipe-messages" : "epochs/wipe-favourites") };
    case "wipeAll":
      return { path: PATH.managementPage("config/wipe-all") };
    default:
      return { path: PATH.management };
  }
}

function viewAt(path: string, payload: unknown): View {
  const name = path.startsWith(PATH.management) ? path.slice(PATH.management.length).replace(/\/$/, "") : "";
  switch (name) {
    case "users":
    case "invites":
    case "cards":
    case "config":
    case "epochs":
    case "jobs":
    case "status":
    case "audit":
      return { k: name };
    case "users/user":
      return payload ? { k: "user", user: payload as AdminUser } : { k: "users" };
    case "epochs/wipe-messages":
      return { k: "wipe", scope: "messages" };
    case "epochs/wipe-favourites":
      return { k: "wipe", scope: "favorites" };
    case "config/wipe-all":
      return { k: "wipeAll" };
    default:
      return { k: "root" };
  }
}

/** Date and time in the device's time zone: "Today 14:05", or the full date for older days. */
function useWhen(): (t: number) => string {
  const { lang, a } = useLang();
  return (t) => (t ? `${formatDay(t, Date.now(), lang, { today: a.today, yesterday: a.yesterday })} ${formatClock(t, lang)}` : "–");
}

/** Runs an admin call. A "locked" answer from the server puts the page back behind the lock, with no error text. */
function useAdmin() {
  const { a } = useLang();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  // true once the first call of the page has finished (answer or error): until then the page shows the spinner instead of an empty list
  const [loaded, setLoaded] = useState(false);
  const run = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | null> => {
      setError(null);
      setPending((n) => n + 1);
      try {
        const r = await fn();
        markAdminAction();
        return r;
      } catch (e) {
        if (e instanceof ApiError && e.code === "stepup_required") lockAdmin();
        else setError(errorOf(a, e));
        return null;
      } finally {
        setPending((n) => n - 1);
        setLoaded(true);
      }
    },
    [a],
  );
  return { error, run, busy: pending > 0, loaded };
}

function Pager({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  const { a } = useLang();
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <Group>
      <div className="ios-pager">
        <button type="button" disabled={page === 0} onClick={() => onChange(page - 1)}>
          {a.manage.prev}
        </button>
        <span>
          {pages > 1 ? `${a.manage.page(page + 1, pages)} · ` : ""}
          {a.manage.total(total)}
        </span>
        <button type="button" disabled={page + 1 >= pages} onClick={() => onChange(page + 1)}>
          {a.manage.next}
        </button>
      </div>
    </Group>
  );
}

function LockScreen() {
  const { m, a } = useLang();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await unlockAdmin(password, setProgress);
      setPassword("");
      unlockedNow();
    } catch (e) {
      setError(e instanceof ApiError && e.code === "unauthorized" ? a.manage.unlockWrong : errorOf(a, e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };
  return (
    <div className="ios-lock">
      <Group header={a.manage.locked} footer={a.manage.lockedHint}>
        <FormRow>
          <Secret
            label={m.password}
            value={password}
            onChange={(v) => {
              setError(null);
              setPassword(v);
            }}
            showLabel={m.show}
            hideLabel={m.hide}
            countLabel={m.chars}
            onEnter={() => void submit()}
          />
        </FormRow>
      </Group>
      <Steps progress={progress} m={m} />
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <Group>
        <Row title={busy ? a.working : a.manage.unlock} center onClick={() => void submit()} disabled={!password || busy} />
      </Group>
    </div>
  );
}

function UsersView({ go }: { go: (v: View) => void }) {
  const { a } = useLang();
  const when = useWhen();
  const { error, run, busy, loaded } = useAdmin();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  useEffect(() => {
    void run(() => rawApi().get<{ users: AdminUser[]; total: number }>(`/admin/users?q=${encodeURIComponent(q)}&offset=${page * PAGE_SIZE}&limit=${PAGE_SIZE}`)).then((r) => {
      if (!r) return;
      setUsers(r.users);
      setTotal(r.total);
    });
  }, [q, page, run]);
  return (
    <Page title={a.manage.users} onBack={() => go({ k: "root" })} backLabel={a.manage.title}>
      <Loading busy={busy} first={!loaded} label={a.loading} />
      <input
        className="ios-search"
        {...NO_AUTOFILL}
        placeholder={a.manage.search}
        aria-label={a.manage.search}
        value={q}
        onChange={(e) => {
          setPage(0);
          setQ(e.target.value.replace(/[^A-Za-z0-9_-]/g, ""));
        }}
      />
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <Group>
        {users.map((u) => (
          <Row
            key={u.userId}
            icon={<Avatar userId={u.userId} size={30} admin={u.role === "admin"} />}
            title={
              <>
                @{u.handle} {u.role === "admin" && <span className="ch-admin">{a.adminBadge}</span>} {u.suspended && <span className="ios-destructive">⏸</span>} {u.contactsBlocked && <span className="ch-admin">{a.manage.contactsBlockedTag}</span>}
              </>
            }
            subtitle={`${a.manage.lastLogin}: ${when(u.lastLoginAt)} · ${a.manage.loginsCount(u.loginCount)}${u.messageCount === undefined ? "" : ` · ${a.manage.messageSummary(u.messageCount, u.messageLimit ?? null)}`}${u.fileBytes ? ` · ${a.manage.fileSummary(formatBytes(u.fileBytes))}` : ""}`}
            chevron
            onClick={() => go({ k: "user", user: u })}
          />
        ))}
      </Group>
      <Pager page={page} total={total} onChange={setPage} />
    </Page>
  );
}

function UserView({ user, go }: { user: AdminUser; go: (v: View) => void }) {
  const { a } = useLang();
  const when = useWhen();
  const { error, run, busy } = useAdmin();
  const done = (fn: () => Promise<unknown>) => void run(fn).then((r) => r !== null && go({ k: "users" }));
  const [blocked, setBlocked] = useState(user.contactsBlocked === true);
  const [cardOpen, setCardOpen] = useState(false);
  const setContactsBlocked = (next: boolean) => {
    void run(() => rawApi().post(`/admin/users/${user.userId}/contacts-blocked`, { blocked: next })).then((r) => r !== null && setBlocked(next));
  };
  return (
    <Page title={`@${user.handle}`} onBack={() => go({ k: "users" })} backLabel={a.manage.users}>
      <Loading busy={busy} first={false} label={a.loading} />
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <Group>
        <Row title={a.manage.registeredAt} value={when(user.createdAt)} />
        <Row title={a.manage.lastLogin} value={when(user.lastLoginAt)} />
        <Row title={a.manage.logins} value={user.loginCount} />
        <Row title={a.manage.failures} value={user.failedCount} />
        {user.messageCount !== undefined && <Row title={a.manage.messageCountMonth} value={a.usageValue(user.messageCount, user.messageLimit ?? null)} />}
        <Row title={a.manage.fileBytesMonth} value={formatBytes(user.fileBytes ?? 0)} />
        <Row title={a.manage.state} value={user.suspended ? a.manage.suspendedState : a.manage.activeState} />
      </Group>
      <Group header={a.manage.ips}>
        {user.ips.length === 0 && <Row title="–" />}
        {user.ips.map((x) => (
          <Row key={x.ip} title={<span className="ios-mono">{x.ip}</span>} value={when(x.at)} />
        ))}
      </Group>
      {user.role !== "admin" && (
        <>
          <Group>
            <Row disabled={busy} title={a.manage.sendCard} chevron onClick={() => setCardOpen(true)} />
          </Group>
          <Group footer={a.manage.contactsBlockedHint}>
            <SwitchRow title={a.manage.contactsBlocked} checked={blocked} onChange={setContactsBlocked} />
          </Group>
          <Group>
            <Row disabled={busy} title={a.manage.resetFailures} onClick={() => done(() => rawApi().post(`/admin/users/${user.userId}/reset-failures`))} />
            <Row disabled={busy} title={a.manage.forceLogout} onClick={() => done(() => rawApi().post(`/admin/users/${user.userId}/logout`))} />
            <Row disabled={busy} title={user.suspended ? a.manage.unsuspend : a.manage.suspend} onClick={() => done(() => rawApi().post(`/admin/users/${user.userId}/suspend`, { suspended: !user.suspended }))} />
          </Group>
          <Group>
            <Row
              title={a.manage.delete}
              center
              destructive
              disabled={busy}
              onClick={() => {
                if (window.prompt(a.manage.confirmDelete(user.handle)) === user.handle) done(() => adminDeleteUser(user.userId, user.handle));
              }}
            />
          </Group>
        </>
      )}
      {cardOpen && <SendCardModal recipient={user} onClose={() => setCardOpen(false)} onLocked={lockAdmin} />}
    </Page>
  );
}

function InvitesView({ go }: { go: (v: View) => void }) {
  const { a } = useLang();
  const when = useWhen();
  const { error, run, busy, loaded } = useAdmin();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [note, setNote] = useState("");
  const [days, setDays] = useState(7);
  const [blocked, setBlocked] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const load = useCallback(() => run(() => rawApi().get<{ invites: Invite[] }>("/admin/invites")).then((r) => r && setInvites(r.invites.slice().sort((x, y) => y.createdAt - x.createdAt))), [run]);
  useEffect(() => {
    void load();
  }, [load]);
  const create = async () => {
    const r = await run(() => rawApi().post("/admin/invites", { note, expiresInDays: days, contactsBlocked: blocked }));
    if (r) {
      setNote("");
      setBlocked(false);
      void load();
    }
  };
  const copy = (code: string) => {
    void navigator.clipboard
      ?.writeText(code)
      .then(() => {
        setCopied(code);
        setTimeout(() => setCopied((c) => (c === code ? null : c)), 1500);
      })
      .catch(() => {});
  };
  return (
    <Page title={a.manage.invites} onBack={() => go({ k: "root" })} backLabel={a.manage.title}>
      <Loading busy={busy} first={!loaded} label={a.loading} />
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <Group header={a.manage.newInvite} footer={a.manage.invitesNote}>
        <Row title={a.manage.note}>
          <input className="ios-field" {...NO_AUTOFILL} value={note} maxLength={80} aria-label={a.manage.note} onChange={(e) => setNote(e.target.value)} onKeyDown={onEnter(() => void create())} />
        </Row>
        <Row title={a.manage.expiresInDays}>
          <input
            className="ios-field"
            type="number"
            min={1}
            max={30}
            value={days}
            aria-label={a.manage.expiresInDays}
            onChange={(e) => setDays(Math.min(30, Math.max(1, Math.floor(Number(e.target.value)) || 1)))}
            onKeyDown={onEnter(() => void create())}
          />
        </Row>
        <SwitchRow title={a.manage.inviteContactsBlocked} checked={blocked} onChange={setBlocked} />
        <Row title={a.manage.createInvite} center onClick={() => create()} />
      </Group>
      {invites.length > 0 && (
        <Group header={a.manage.invites}>
          {invites.map((i) => (
            <div key={i.id} className="ios-form ios-invite">
              <div className="ios-invite-note">{i.note || "–"}</div>
              {i.code ? (
                <div className="ios-mono">{i.code}</div>
              ) : (
                <div className="ios-sub">
                  {a.manage.uses}: {i.uses.map((u) => `@${u.handle} (${a.manage.registeredAt} ${when(u.at)})`).join(", ")}
                </div>
              )}
              <div className="ios-sub">
                {a.manage.created}: {when(i.createdAt)} · {a.manage.expires}: {when(i.expiresAt)}
              </div>
              {i.contactsBlocked && <div className="ios-sub">{a.manage.inviteContactsBlockedTag}</div>}
              {i.code && (
                <div className="ios-actions">
                  <button type="button" className="ios-link" onClick={() => copy(i.code!)}>
                    {copied === i.code ? a.manage.copied : a.manage.copy}
                  </button>
                  <button type="button" className="ios-link ios-destructive" disabled={busy} onClick={() => void run(() => rawApi().post(`/admin/invites/${i.id}/revoke`)).then(load)}>
                    {a.manage.revoke}
                  </button>
                </div>
              )}
            </div>
          ))}
        </Group>
      )}
    </Page>
  );
}

/** The user with exactly this handle, found through the admin search (the card endpoints take ids). */
async function findUserId(handle: string, reason: "recipient" | "subject"): Promise<string> {
  const h = handle.replace(/^@/, "").trim();
  const r = await rawApi().get<{ users: AdminUser[] }>(`/admin/users?q=${encodeURIComponent(h)}&offset=0&limit=${PAGE_SIZE}`);
  const hit = r.users.find((u) => u.handle.toLowerCase() === h.toLowerCase());
  if (!hit) throw new ApiError(404, "not_found", { reason });
  return hit.userId;
}

function CardsView({ go }: { go: (v: View) => void }) {
  const { a } = useLang();
  const when = useWhen();
  const { error, run, busy, loaded } = useAdmin();
  const [cards, setCards] = useState<AdminCard[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [days, setDays] = useState(3);
  const load = useCallback(
    () =>
      run(() => rawApi().get<{ total: number; cards: AdminCard[] }>(`/admin/cards?offset=${page * PAGE_SIZE}&limit=${PAGE_SIZE}`)).then((r) => {
        if (!r) return;
        setCards(r.cards);
        setTotal(r.total);
      }),
    [run, page],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const clean = (v: string) => v.replace(/[^A-Za-z0-9_-]/g, "");
  const ready = recipient !== "" && subject !== "" && !busy;
  const issue = async () => {
    if (!ready) return;
    const r = await run(async () =>
      rawApi().post("/admin/cards", { recipientId: await findUserId(recipient, "recipient"), subjectId: await findUserId(subject, "subject"), expiresInDays: days }),
    );
    if (r) {
      setRecipient("");
      setSubject("");
      void load();
    }
  };
  return (
    <Page title={a.manage.cards} onBack={() => go({ k: "root" })} backLabel={a.manage.title}>
      <Loading busy={busy} first={!loaded} label={a.loading} />
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <Group header={a.manage.newCard} footer={a.manage.cardsNote}>
        <Row title={a.manage.cardRecipient}>
          <input className="ios-field" {...NO_AUTOFILL} value={recipient} maxLength={33} aria-label={a.manage.cardRecipient} onChange={(e) => setRecipient(clean(e.target.value))} />
        </Row>
        <Row title={a.manage.cardSubject}>
          <input className="ios-field" {...NO_AUTOFILL} value={subject} maxLength={33} aria-label={a.manage.cardSubject} onChange={(e) => setSubject(clean(e.target.value))} onKeyDown={onEnter(() => void issue())} />
        </Row>
        <Row title={a.manage.expiresInDays}>
          <input
            className="ios-field"
            type="number"
            min={1}
            max={30}
            value={days}
            aria-label={a.manage.expiresInDays}
            onChange={(e) => setDays(Math.min(30, Math.max(1, Math.floor(Number(e.target.value)) || 1)))}
            onKeyDown={onEnter(() => void issue())}
          />
        </Row>
        <Row title={a.manage.issueCard} center disabled={!ready} onClick={() => void issue()} />
      </Group>
      <Group header={a.manage.activeCards}>
        {cards.length === 0 && <Row title={a.manage.empty} />}
        {cards.map((c) => (
          <div key={c.id} className="ios-form ios-invite">
            <div className="ios-invite-note">{a.manage.cardLine(c.subjectHandle, c.recipientHandle)}</div>
            <div className="ios-sub">
              {a.manage.created}: {when(c.createdAt)} · {a.manage.expires}: {when(c.expiresAt)}
            </div>
            <div className="ios-actions">
              <button type="button" className="ios-link ios-destructive" disabled={busy} onClick={() => void run(() => rawApi().post(`/admin/cards/${c.id}/revoke`)).then(load)}>
                {a.manage.revoke}
              </button>
            </div>
          </div>
        ))}
      </Group>
      <Pager page={page} total={total} onChange={setPage} />
    </Page>
  );
}

/**
 * A whole-number setting. It is applied when the field loses focus (or on Enter), not on every keystroke; it is then shown in its
 * canonical form (050 becomes 50) and kept inside its range. An empty or non-numeric entry puts the old value back.
 */
function NumberField({ value, min, max, label, onCommit }: { value: number; min: number; max: number; label: string; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = Number.parseInt(text.replace(/\D/g, ""), 10);
    const next = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : value;
    setText(String(next));
    if (next !== value) onCommit(next);
  };
  return (
    <input
      className="ios-field"
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={text}
      aria-label={label}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

function configRows(cfg: Config, m: ReturnType<typeof useLang>["a"]["manage"]): [string, string][] {
  const sw = (on: boolean) => (on ? m.switchOn : m.switchOff);
  return [
    [m.registrationOpen, sw(cfg.registrationOpen)],
    [m.inviteRequired, sw(cfg.inviteRequired)],
    [m.globalContactsBlocked, sw(cfg.globalContactsBlocked === true)],
    [m.fileEnabled, sw(cfg.fileEnabled)],
    [m.groupMax, String(cfg.groupMax)],
    [m.retentionDays, String(cfg.retentionDays)],
    [m.favoriteMax, String(cfg.favoriteMax)],
    [m.fileMonthlyMB, String(cfg.fileMonthlyMB >= 1 ? cfg.fileMonthlyMB : 100)],
  ];
}

/** Tells which settings a save changed and what they are now (the values the server answered with). */
function ConfigSavedDialog({ changes, onClose }: { changes: [string, string][]; onClose: () => void }) {
  const { a } = useLang();
  return <Alert title={a.manage.configSaved} rows={changes} buttonLabel={a.close} onClose={onClose} />;
}

function ConfigView({ go }: { go: (v: View) => void }) {
  const { a } = useLang();
  const { error, run, busy, loaded } = useAdmin();
  const [cfg, setCfg] = useState<Config | null>(null);
  // the settings a save changed, as the server answered: shown in a dialog until it is closed
  const [saved, setSaved] = useState<[string, string][] | null>(null);
  useEffect(() => {
    void run(() => rawApi().get<Config>("/admin/config")).then((c) => c && setCfg(c));
  }, [run]);
  const save = async (next: Config) => {
    const before = configRows(cfg ?? next, a.manage);
    setCfg(next);
    const r = await run(() => rawApi().put<Config>("/admin/config", next));
    if (r) {
      setCfg(r);
      const changes = configRows(r, a.manage).filter(([label, value]) => before.find(([l]) => l === label)?.[1] !== value);
      if (changes.length > 0) setSaved(changes);
    }
  };
  return (
    <Page title={a.manage.config} onBack={() => go({ k: "root" })} backLabel={a.manage.title}>
      <Loading busy={busy} first={!loaded} label={a.loading} />
      {saved && <ConfigSavedDialog changes={saved} onClose={() => setSaved(null)} />}
      {error && <ErrorBanner>{error}</ErrorBanner>}
      {cfg && (
        <>
          <Group footer={a.manage.registrationHint}>
            <SwitchRow title={a.manage.registrationOpen} checked={cfg.registrationOpen} onChange={(v) => save({ ...cfg, registrationOpen: v })} />
          </Group>
          <Group footer={a.manage.inviteRequiredHint}>
            <SwitchRow title={a.manage.inviteRequired} checked={cfg.inviteRequired} onChange={(v) => save({ ...cfg, inviteRequired: v })} />
          </Group>
          <Group footer={a.manage.globalContactsBlockedHint}>
            <SwitchRow title={a.manage.globalContactsBlocked} checked={cfg.globalContactsBlocked === true} onChange={(v) => save({ ...cfg, globalContactsBlocked: v })} />
          </Group>
          <Group>
            <SwitchRow title={a.manage.fileEnabled} checked={cfg.fileEnabled} onChange={(v) => save({ ...cfg, fileEnabled: v })} />
          </Group>
          <Group>
            <Row title={a.manage.groupMax}>
              <NumberField value={Math.min(GROUP_MAX, cfg.groupMax)} min={2} max={GROUP_MAX} label={a.manage.groupMax} onCommit={(n) => void save({ ...cfg, groupMax: n })} />
            </Row>
            <Row title={a.manage.retentionDays}>
              <NumberField value={cfg.retentionDays} min={1} max={30} label={a.manage.retentionDays} onCommit={(n) => void save({ ...cfg, retentionDays: n })} />
            </Row>
            <Row title={a.manage.favoriteMax}>
              <NumberField value={cfg.favoriteMax} min={0} max={500} label={a.manage.favoriteMax} onCommit={(n) => void save({ ...cfg, favoriteMax: n })} />
            </Row>
            <Row title={a.manage.fileMonthlyMB}>
              <NumberField value={cfg.fileMonthlyMB >= 1 ? cfg.fileMonthlyMB : 100} min={1} max={256} label={a.manage.fileMonthlyMB} onCommit={(n) => void save({ ...cfg, fileMonthlyMB: n })} />
            </Row>
          </Group>
          <Group>
            <Row title={a.manage.wipeAll} destructive chevron onClick={() => go({ k: "wipeAll" })} />
          </Group>
        </>
      )}
    </Page>
  );
}

function WipeView({ scope, go }: { scope: "messages" | "favorites"; go: (v: View) => void }) {
  const { a } = useLang();
  const { error, run, busy } = useAdmin();
  const [word, setWord] = useState("");
  const title = scope === "messages" ? a.manage.wipeMessages : a.manage.wipeFavorites;
  const wipe = () => {
    if (word === "WIPE") void run(() => rawApi().post("/admin/wipe", { confirm: "WIPE", scope })).then((r) => r !== null && go({ k: "epochs" }));
  };
  return (
    <Page title={title} onBack={() => go({ k: "epochs" })} backLabel={a.manage.epochs}>
      <Loading busy={busy} label={a.loading} />
      <Group footer={scope === "messages" ? a.manage.wipeMessagesHint : a.manage.wipeFavoritesHint}>
        <FormRow>
          <input className="ch-input" {...NO_AUTOFILL} value={word} aria-label={title} onChange={(e) => setWord(e.target.value)} onKeyDown={onEnter(wipe)} />
        </FormRow>
      </Group>
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <Group>
        <Row title={title} center destructive disabled={word !== "WIPE"} onClick={wipe} />
      </Group>
    </Page>
  );
}

interface EpochRows {
  retentionDays: number;
  messages: { id: number; createdAt: number; expiresAt: number; current: boolean; replacement: boolean }[];
  favorites: { id: number; createdAt: number; current: boolean }[];
}

/** The keys that make messages and favourites readable. Destroying one is how things are erased for good. */
function EpochsView({ go }: { go: (v: View) => void }) {
  const { a } = useLang();
  const when = useWhen();
  const { error, run, busy, loaded } = useAdmin();
  const [rows, setRows] = useState<EpochRows | null>(null);
  const load = useCallback(() => run(() => rawApi().get<EpochRows>("/admin/epochs")).then((r) => r && setRows(r)), [run]);
  useEffect(() => {
    void load();
  }, [load]);
  const act = (fn: () => Promise<unknown>) => void run(fn).then(load);
  const destroy = (what: string, fn: () => Promise<unknown>) => {
    if (window.confirm(a.manage.confirmDestroy(what))) act(fn);
  };
  return (
    <Page title={a.manage.epochs} onBack={() => go({ k: "root" })} backLabel={a.manage.title}>
      <Loading busy={busy} first={!loaded} label={a.loading} />
      {error && <ErrorBanner>{error}</ErrorBanner>}
      {rows && (
        <>
          <Group header={a.manage.messageEpochs} footer={a.manage.messageEpochsNote(rows.retentionDays)}>
            {rows.messages.map((e) => (
              <div key={e.id} className="ios-form ios-invite">
                <div className="ios-invite-note">
                  #{e.id} {e.current && <span className="ch-admin">{a.manage.current}</span>} {e.replacement && <span className="ch-admin">{a.manage.replacementTag}</span>}
                </div>
                <div className="ios-sub">
                  {a.manage.created}: {when(e.createdAt)} · {a.manage.destroyOn}: {when(e.expiresAt)}
                </div>
                <div className="ios-actions">
                  {e.current ? (
                    <button type="button" className="ios-link" disabled={busy} onClick={() => act(() => rawApi().post(`/admin/epochs/${e.id}/prepare`))}>
                      {a.manage.prepare}
                    </button>
                  ) : (
                    <button type="button" className="ios-link ios-destructive" disabled={busy} onClick={() => destroy(`#${e.id}`, () => rawApi().post(`/admin/epochs/${e.id}/revoke`))}>
                      {a.manage.destroy}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </Group>
          <Group header={a.manage.favEpochs} footer={a.manage.favEpochsNote}>
            {rows.favorites.map((e) => (
              <div key={e.id} className="ios-form ios-invite">
                <div className="ios-invite-note">
                  #{e.id} {e.current && <span className="ch-admin">{a.manage.current}</span>}
                </div>
                <div className="ios-sub">
                  {a.manage.created}: {when(e.createdAt)}
                </div>
                <div className="ios-actions">
                  <button type="button" className="ios-link ios-destructive" disabled={busy} onClick={() => destroy(`#${e.id}`, () => rawApi().post(`/admin/fav-epochs/${e.id}/revoke`))}>
                    {a.manage.destroy}
                  </button>
                </div>
              </div>
            ))}
            <Row disabled={busy} title={a.manage.newFavEpoch} center onClick={() => act(() => rawApi().post("/admin/fav-epochs/new"))} />
          </Group>
          <Group>
            <Row title={a.manage.wipeMessages} destructive chevron onClick={() => go({ k: "wipe", scope: "messages" })} />
            <Row title={a.manage.wipeFavorites} destructive chevron onClick={() => go({ k: "wipe", scope: "favorites" })} />
          </Group>
        </>
      )}
    </Page>
  );
}

function WipeAllView({ go }: { go: (v: View) => void }) {
  const { m, a } = useLang();
  const [word, setWord] = useState("");
  const [password, setPassword] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ready = word === a.manage.wipeAllWord && !!password && !progress;
  const wipe = () => {
    if (!ready) return;
    setError(null);
    setProgress({ step: "derive" });
    // On success every session is gone, this one included, and the page returns to the sign-in by itself.
    void wipeEverything(password, setProgress).catch((e) => {
      setProgress(null);
      setError(e instanceof ApiError && e.code === "unauthorized" ? a.manage.unlockWrong : errorOf(a, e));
    });
  };
  return (
    <Page title={a.manage.wipeAll} onBack={() => go({ k: "config" })} backLabel={a.manage.config}>
      <Group footer={a.manage.wipeAllHint}>
        <FormRow>
          <input className="ch-input" {...NO_AUTOFILL} value={word} aria-label={a.manage.wipeAll} onChange={(e) => setWord(e.target.value)} />
        </FormRow>
        <FormRow>
          <Secret label={m.password} value={password} onChange={setPassword} showLabel={m.show} hideLabel={m.hide} countLabel={m.chars} onEnter={wipe} />
        </FormRow>
      </Group>
      <Steps progress={progress} m={m} />
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <Group>
        <Row title={progress ? a.working : a.manage.wipeAll} center destructive disabled={!ready} onClick={wipe} />
      </Group>
    </Page>
  );
}

function JobsView({ go }: { go: (v: View) => void }) {
  const { a } = useLang();
  const when = useWhen();
  const { error, run, busy, loaded } = useAdmin();
  const [jobs, setJobs] = useState<Job[]>([]);
  const load = useCallback(() => run(() => rawApi().get<{ jobs: Job[] }>("/admin/jobs")).then((r) => r && setJobs(r.jobs)), [run]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <Page title={a.manage.jobs} onBack={() => go({ k: "root" })} backLabel={a.manage.title}>
      <Loading busy={busy} first={!loaded} label={a.loading} />
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <Group footer={a.manage.jobsNote}>
        {jobs.map((j) => (
          <div key={j.name} className="ios-form ios-invite">
            <div className="ios-invite-note">{a.manage.jobNames[j.name] ?? j.name}</div>
            <div className={"ios-sub" + (j.lastOk === false ? " ios-destructive" : "")}>
              {j.lastOk === null ? a.manage.never : j.lastOk ? a.manage.jobOk : a.manage.jobFailed(j.attempts)}
              {j.lastRunAt ? ` · ${a.manage.lastRun}: ${when(j.lastRunAt)}` : ""}
            </div>
            {j.error && <div className="ios-sub ios-destructive">{j.error}</div>}
            <div className="ios-actions">
              <button type="button" className="ios-link" disabled={busy} onClick={() => void run(() => rawApi().post(`/admin/jobs/${j.name}/run`)).then(load)}>
                {a.manage.runNow}
              </button>
            </div>
          </div>
        ))}
      </Group>
    </Page>
  );
}

function StatusView({ go }: { go: (v: View) => void }) {
  const { a } = useLang();
  const when = useWhen();
  const { error, run, busy, loaded } = useAdmin();
  const [s, setS] = useState<Status | null>(null);
  useEffect(() => {
    void run(() => rawApi().get<Status>("/admin/status")).then((r) => r && setS(r));
  }, [run]);
  return (
    <Page title={a.manage.status} onBack={() => go({ k: "root" })} backLabel={a.manage.title}>
      <Loading busy={busy} first={!loaded} label={a.loading} />
      {error && <ErrorBanner>{error}</ErrorBanner>}
      {s && (
        <>
          <Group>
            <Row title={a.manage.version} value={s.version} />
            <Row title={a.manage.users_} value={s.users} />
            <Row title={a.manage.online} value={s.online} />
            <Row title={a.groups} value={s.groups} />
            <Row title={a.manage.messages} value={s.counters.messages} />
            <Row title={a.manage.fileBytes} value={formatBytes(s.counters.fileBytes)} />
            <Row
              title={a.manage.errors}
              value={
                Object.entries(s.counters.errors)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(", ") || a.manage.empty
              }
            />
          </Group>
          <Group header={a.manage.recentErrors} footer={a.manage.recentErrorsNote}>
            {s.recentErrors.length === 0 && <Row title={a.manage.empty} />}
            {s.recentErrors.map((e, i) => (
              <Row key={i} title={`${e.status} ${e.code}`} subtitle={`${e.method} ${e.path}`} value={when(e.at)} />
            ))}
          </Group>
        </>
      )}
    </Page>
  );
}

function AuditView({ go }: { go: (v: View) => void }) {
  const { a } = useLang();
  const when = useWhen();
  const { error, run, busy, loaded } = useAdmin();
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<{ at: number; actor: string; action: string; target: string }[]>([]);
  const [total, setTotal] = useState(0);
  useEffect(() => {
    void run(() => rawApi().get<{ audit: typeof rows; total: number }>(`/admin/audit?offset=${page * PAGE_SIZE}&limit=${PAGE_SIZE}`)).then((r) => {
      if (!r) return;
      setRows(r.audit);
      setTotal(r.total);
    });
  }, [page, run]);
  return (
    <Page title={a.manage.audit} onBack={() => go({ k: "root" })} backLabel={a.manage.title}>
      <Loading busy={busy} first={!loaded} label={a.loading} />
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <Group>
        {loaded && rows.length === 0 && <Row title={a.manage.empty} />}
        {rows.map((r, i) => (
          <Row key={i} title={`${r.action}${r.target ? ` · ${r.target}` : ""}`} subtitle={`@${r.actor}`} value={when(r.at)} />
        ))}
      </Group>
      <Pager page={page} total={total} onChange={setPage} />
    </Page>
  );
}

/** Management as an iOS-style stack: a list of sections, each a page, behind a password lock that closes after five idle minutes. */
export function ManagementPage() {
  const { a } = useLang();
  const me = useChat((s) => s.me);
  const locked = useAdminLock((s) => s.locked);
  const loc = useLocation();
  const view = viewAt(loc.path, loc.payload);
  const setView = (v: View) => {
    const { path, payload } = addressOf(v);
    navigate(path, payload);
  };
  // Mirrors the server's rule; a wrong guess here only shows the lock screen early or late, the server decides.
  useEffect(() => {
    const timer = setInterval(() => {
      if (Date.now() - useAdminLock.getState().last > ADMIN_LOCK_MS) lockAdmin();
    }, 5000);
    return () => clearInterval(timer);
  }, []);
  if (me?.role !== "admin") {
    return (
      <Page title={a.manage.title}>
        <Group>
          <Row title={a.manage.notAdmin} />
        </Group>
      </Page>
    );
  }
  if (locked) {
    return (
      <Page title={a.manage.title}>
        <LockScreen />
      </Page>
    );
  }
  switch (view.k) {
    case "users":
      return <UsersView go={setView} />;
    case "user":
      return <UserView user={view.user} go={setView} />;
    case "invites":
      return <InvitesView go={setView} />;
    case "cards":
      return <CardsView go={setView} />;
    case "config":
      return <ConfigView go={setView} />;
    case "wipe":
      return <WipeView scope={view.scope} go={setView} />;
    case "epochs":
      return <EpochsView go={setView} />;
    case "wipeAll":
      return <WipeAllView go={setView} />;
    case "jobs":
      return <JobsView go={setView} />;
    case "status":
      return <StatusView go={setView} />;
    case "audit":
      return <AuditView go={setView} />;
    default:
      return (
        <Page title={a.manage.title}>
          <Group>
            <Row icon={<Icon color="#007aff"><Users size={18} /></Icon>} title={a.manage.users} chevron onClick={() => setView({ k: "users" })} />
            <Row icon={<Icon color="#ff9500"><Ticket size={18} /></Icon>} title={a.manage.invites} chevron onClick={() => setView({ k: "invites" })} />
            <Row icon={<Icon color="#30b0c7"><Contact size={18} /></Icon>} title={a.manage.cards} chevron onClick={() => setView({ k: "cards" })} />
            <Row icon={<Icon color="#8e8e93"><SlidersHorizontal size={18} /></Icon>} title={a.manage.config} chevron onClick={() => setView({ k: "config" })} />
          </Group>
          <Group>
            <Row icon={<Icon color="#34c759"><Activity size={18} /></Icon>} title={a.manage.status} chevron onClick={() => setView({ k: "status" })} />
            <Row icon={<Icon color="#af52de"><KeyRound size={18} /></Icon>} title={a.manage.epochs} chevron onClick={() => setView({ k: "epochs" })} />
            <Row icon={<Icon color="#ff9500"><Timer size={18} /></Icon>} title={a.manage.jobs} chevron onClick={() => setView({ k: "jobs" })} />
            <Row icon={<Icon color="#5856d6"><ScrollText size={18} /></Icon>} title={a.manage.audit} chevron onClick={() => setView({ k: "audit" })} />
          </Group>
          <Group footer={a.manage.lockedHint}>
            <Row icon={<Icon color="#ff3b30"><Lock size={18} /></Icon>} title={a.manage.lockNow} onClick={lockAdmin} />
          </Group>
        </Page>
      );
  }
}
