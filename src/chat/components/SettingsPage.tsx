import { useEffect, useState } from "react";
import { AtSign, Bell, Clock, Globe, KeyRound, Trash2, Volume2, Wifi } from "lucide-react";
import { ApiError, changeHandle, changePassword, deleteAccount, enableNotifications, notificationsSupported, saveLanguage, setSoundEnabled, type Progress } from "../client";
import { getConfig } from "../config";
import { errorOf } from "../i18nApp";
import { onEnter } from "../keys";
import { checkHealth, type HealthState } from "../net/health";
import { PATH, SETTINGS_DETAILS, go, useLocation } from "../route";
import { IDLE_CHOICES, patch, useChat } from "../store";
import { useLang } from "../useChat";
import { checkHandle, checkPassword } from "../validation";
import { HandleField } from "./HandleField";
import { CheckRow, ErrorBanner, FormRow, Group, Icon, Page, Row, SwitchRow } from "./ios";
import { NO_AUTOFILL } from "./noAutofill";
import { Secret } from "./Secret";
import { Steps } from "./ui";

const DETAILS = SETTINGS_DETAILS;
type Detail = (typeof SETTINGS_DETAILS)[number];
type Permission = NotificationPermission | "unsupported";

const notificationState = (): Permission => (notificationsSupported() ? Notification.permission : "unsupported");

function LanguagePage() {
  const { lang } = useLang();
  return (
    <Group>
      <CheckRow title="中文" checked={lang === "zh"} onClick={() => saveLanguage("zh")} />
      <CheckRow title="English" checked={lang === "en"} onClick={() => saveLanguage("en")} />
    </Group>
  );
}

function IdlePage() {
  const { a } = useLang();
  const idle = useChat((s) => s.idleMinutes);
  return (
    <Group footer={a.idleNote}>
      {IDLE_CHOICES.map((n) => (
        <CheckRow key={n} title={a.idleOption(n)} checked={idle === n} onClick={() => patch({ idleMinutes: n })} />
      ))}
    </Group>
  );
}

function NotificationsPage() {
  const { a } = useLang();
  const [perm, setPerm] = useState<Permission>(notificationState());
  const footer = { unsupported: a.notificationsUnsupported, granted: a.notificationsOn, denied: a.notificationsDenied, default: a.soundHint }[perm];
  return (
    <Group footer={perm === "default" ? undefined : footer}>
      {perm === "default" ? (
        <Row title={a.notificationsEnable} onClick={() => enableNotifications().then(setPerm)} />
      ) : (
        <Row title={a.notifications} value={shortNotification(a, perm)} />
      )}
    </Group>
  );
}

function shortNotification(a: ReturnType<typeof useLang>["a"], perm: Permission): string {
  return { granted: a.notifOn, denied: a.notifDenied, unsupported: a.notifUnsupported, default: a.notifOff }[perm];
}

function HandlePage() {
  const { m, a } = useLang();
  const me = useChat((s) => s.me)!;
  const [handle, setHandle] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const problem = handle ? checkHandle(handle) : null;
  const unchanged = handle === me.handle;
  const submit = async () => {
    if (!handle || problem || progress || unchanged) return;
    setMessage(null);
    setProgress({ step: "pow", fraction: 0 });
    try {
      await changeHandle(handle, setProgress);
      setMessage({ ok: true, text: a.handleChanged });
      setHandle("");
    } catch (e) {
      setMessage({ ok: false, text: errorOf(a, e) });
    } finally {
      setProgress(null);
    }
  };
  return (
    <>
      <Group>
        <FormRow>
          <HandleField
            label={a.newHandle}
            hint={m.handleHint}
            problem={problem ? (m.handleProblem[problem as keyof typeof m.handleProblem] ?? null) : null}
            value={handle}
            onChange={(v) => {
              setMessage(null);
              setHandle(v);
            }}
            onEnter={() => void submit()}
          />
        </FormRow>
      </Group>
      <Steps progress={progress} m={m} />
      {message && (message.ok ? <p className="ios-footer ios-ok">{message.text}</p> : <ErrorBanner>{message.text}</ErrorBanner>)}
      <Group>
        <Row title={a.changeHandle} center onClick={() => void submit()} disabled={!handle || !!problem || !!progress || unchanged} />
      </Group>
    </>
  );
}

function PasswordPage() {
  const { m, a } = useLang();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const bad = checkPassword(next).length > 0 || next !== repeat || !current;
  const submit = async () => {
    if (bad || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await changePassword(current, next, setProgress);
      setMessage({ ok: true, text: a.passwordChanged });
      setCurrent("");
      setNext("");
      setRepeat("");
    } catch (e) {
      setMessage({ ok: false, text: e instanceof ApiError && e.code === "unauthorized" ? a.wrongPassword : errorOf(a, e) });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };
  const clearing = (set: (v: string) => void) => (v: string) => {
    setMessage(null);
    set(v);
  };
  const fields = [
    [a.currentPassword, current, clearing(setCurrent)],
    [a.newPassword, next, clearing(setNext)],
    [m.passwordRepeat, repeat, clearing(setRepeat)],
  ] as const;
  return (
    <>
      <Group footer={m.strengthNote}>
        {fields.map(([label, value, set]) => (
          <FormRow key={label}>
            <Secret label={label} value={value} onChange={set} showLabel={m.show} hideLabel={m.hide} countLabel={m.chars} onEnter={() => void submit()} />
          </FormRow>
        ))}
      </Group>
      <Group header={m.passwordRules}>
        {(["length", "upper", "lower", "digit"] as const).map((r) => (
          <Row key={r} title={m.rule[r]} value={next && !checkPassword(next).includes(r) ? <span className="ios-ok">✓</span> : "○"} />
        ))}
      </Group>
      <Steps progress={progress} m={m} />
      {message && (message.ok ? <p className="ios-footer ios-ok">{message.text}</p> : <ErrorBanner>{message.text}</ErrorBanner>)}
      <Group>
        <Row title={busy ? a.working : a.changePassword} center onClick={() => void submit()} disabled={bad || busy} />
      </Group>
    </>
  );
}

function ConnectionPage() {
  const { a } = useLang();
  const socket = useChat((s) => s.socket);
  const [health, setHealth] = useState<HealthState>({ kind: "checking" });
  useEffect(() => {
    let live = true;
    void checkHealth(getConfig().api).then((h) => live && setHealth(h));
    return () => {
      live = false;
    };
  }, []);
  const info = health.kind === "ok" || health.kind === "slow" ? health : null;
  return (
    <Group>
      <Row title={a.liveChannel} value={a.socketState[socket]} />
      {info && <Row title="API" value={`${info.rttMs} ms`} />}
      {info && <Row title={a.manage.version} value={`${info.health.server.version} (${info.health.server.commit})`} />}
      {info && <Row title={a.region} value={info.health.server.region} />}
      <Row title={a.frontend} value={__CHAT_COMMIT__} />
    </Group>
  );
}

function DeletePage() {
  const { m, a } = useLang();
  const me = useChat((s) => s.me)!;
  const [confirm, setConfirm] = useState("");
  const [password, setPassword] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The groups this person owns go with the account, for everybody in them: said before the person confirms.
  const owned = useChat((s) => s.groups.filter((g) => g.ownerId === me.userId).length);
  const ready = confirm === me.handle && !!password && !progress;
  const remove = () => {
    if (!ready) return;
    setError(null);
    setProgress({ step: "derive" });
    void deleteAccount(password, setProgress).catch((e) => {
      setProgress(null);
      setError(e instanceof ApiError && e.code === "unauthorized" ? a.wrongPassword : errorOf(a, e));
    });
  };
  return (
    <>
      <Group header={a.typeToConfirm(me.handle)} footer={owned > 0 ? <>{a.deleteAccountHint}<br />{a.deleteOwnedGroups(owned)}</> : a.deleteAccountHint}>
        <FormRow>
          <input
            className="ch-input"
            {...NO_AUTOFILL}
            aria-label={a.typeToConfirm(me.handle)}
            value={confirm}
            onChange={(e) => {
              setError(null);
              setConfirm(e.target.value);
            }}
            onKeyDown={onEnter(remove)}
          />
        </FormRow>
        <FormRow>
          <Secret label={a.currentPassword} value={password} onChange={(v) => { setError(null); setPassword(v); }} showLabel={m.show} hideLabel={m.hide} countLabel={m.chars} onEnter={remove} />
        </FormRow>
      </Group>
      <Steps progress={progress} m={m} />
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <Group>
        <Row title={progress ? a.working : a.deleteAccount} center destructive onClick={remove} disabled={!ready} />
      </Group>
    </>
  );
}

/** Settings as an iOS-style stack: a list of sections, each opening its own page. */
export function SettingsFlow() {
  const { lang, a } = useLang();
  const me = useChat((s) => s.me)!;
  const idle = useChat((s) => s.idleMinutes);
  const sound = useChat((s) => s.sound);
  const { path } = useLocation();
  const detail = DETAILS.find((d) => path === PATH.settingsDetail(d)) ?? null;
  const setDetail = (d: Detail) => go(PATH.settingsDetail(d));
  const isAdmin = me.role === "admin";

  if (detail) {
    const titles: Record<Detail, string> = {
      language: a.language,
      idle: a.idleLogout,
      notifications: a.notifications,
      handle: a.handleSection,
      password: a.passwordSection,
      connection: a.connection,
      delete: a.deleteAccount,
    };
    return (
      <Page title={titles[detail]} onBack={() => go(PATH.settings)} backLabel={a.settingsTitle}>
        {detail === "language" && <LanguagePage />}
        {detail === "idle" && <IdlePage />}
        {detail === "notifications" && <NotificationsPage />}
        {detail === "handle" && <HandlePage />}
        {detail === "password" && <PasswordPage />}
        {detail === "connection" && <ConnectionPage />}
        {detail === "delete" && <DeletePage />}
      </Page>
    );
  }

  return (
    <Page title={a.settingsTitle} onBack={() => go(PATH.me)} backLabel={a.tabMe}>
      <Group>
        <Row icon={<Icon color="#007aff"><Globe size={18} /></Icon>} title={a.language} value={lang === "zh" ? "中文" : "English"} chevron onClick={() => setDetail("language")} />
        <Row icon={<Icon color="#ff9500"><Clock size={18} /></Icon>} title={a.idleLogout} value={a.idleOption(idle)} chevron onClick={() => setDetail("idle")} />
      </Group>
      <Group footer={a.soundHint}>
        <SwitchRow icon={<Icon color="#ff2d55"><Volume2 size={18} /></Icon>} title={a.soundLabel} checked={sound} onChange={(v) => setSoundEnabled(v)} />
        <Row icon={<Icon color="#ff3b30"><Bell size={18} /></Icon>} title={a.notifications} value={shortNotification(a, notificationState())} chevron onClick={() => setDetail("notifications")} />
      </Group>
      <Group>
        {!isAdmin && <Row icon={<Icon color="#5856d6"><AtSign size={18} /></Icon>} title={a.handleSection} value={`@${me.handle}`} chevron onClick={() => setDetail("handle")} />}
        <Row icon={<Icon color="#8e8e93"><KeyRound size={18} /></Icon>} title={a.passwordSection} chevron onClick={() => setDetail("password")} />
      </Group>
      <Group>
        <Row icon={<Icon color="#34c759"><Wifi size={18} /></Icon>} title={a.connection} chevron onClick={() => setDetail("connection")} />
      </Group>
      <Group>
        <Row icon={<Icon color="#ff3b30"><Trash2 size={18} /></Icon>} title={a.deleteAccount} destructive chevron onClick={() => setDetail("delete")} />
      </Group>
    </Page>
  );
}
