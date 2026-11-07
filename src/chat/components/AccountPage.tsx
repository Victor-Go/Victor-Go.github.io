import { useMemo, useState } from "react";
import { isEmbeddedOrOpened } from "../../cipher/isolation";
import { estimateBits } from "../../cipher/crypto/strength";
import { Cancelled, cancelWorkNow as cancelWork, login, register, type Progress } from "../client";
import { errorOf } from "../i18nApp";
import { IDLE_CHOICES, patch, useChat } from "../store";
import { useHealth, useLang } from "../useChat";
import { checkHandle, checkPassword, normalizePassword, sanitizeInvite, strengthOf, type PasswordProblem } from "../validation";
import { HandleField } from "./HandleField";
import { NO_AUTOFILL } from "./noAutofill";
import { Secret } from "./Secret";
import { ServerStatus } from "./ServerStatus";
import { Steps } from "./ui";
import { onEnter } from "../keys";

type Mode = "in" | "up";

const RULES: PasswordProblem[] = ["length", "upper", "lower", "digit"];

export function AccountPage() {
  const { m, a, toggle } = useLang();
  const { state, recheck } = useHealth();
  const lockNotice = useChat((s) => s.notice);
  const idleMinutes = useChat((s) => s.idleMinutes);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [mode, setMode] = useState<Mode>("in");
  const [handle, setHandle] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [invite, setInvite] = useState("");
  const [touched, setTouched] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const refused = useMemo(() => isEmbeddedOrOpened(), []);
  const signUp = mode === "up";
  const online = state.kind === "ok" || state.kind === "slow";
  const inviteRequired = (state.kind === "ok" || state.kind === "slow") && state.health.features.inviteRequired;
  const retentionDays = online ? state.health.features.retentionDays : 30;

  const handleProblem = handle ? checkHandle(handle) : null;
  const failing = new Set(checkPassword(password));
  const bits = useMemo(() => (password ? estimateBits(normalizePassword(password)) : 0), [password]);
  const strength = strengthOf(bits);
  const mismatch = signUp && repeat !== "" && repeat !== password;

  const formProblem =
    checkHandle(handle) !== null || (signUp ? failing.size > 0 || repeat !== password : password === "") || (signUp && inviteRequired && invite === "");

  /** Editing anything clears the previous message and the red marks until the next submit. */
  const edit =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      setNotice(null);
      setTouched(false);
      patch({ notice: null });
      set(v);
    };

  const submit = async () => {
    if (progress) return;
    setTouched(true);
    if (formProblem) {
      setNotice(m.fixErrors);
      return;
    }
    if (!online) {
      setNotice(m.serverDown);
      return;
    }
    setNotice(null);
    setProgress({ step: "derive" });
    try {
      if (signUp) await register(handle, password, inviteRequired ? invite : undefined, setProgress);
      else await login(handle, password, setProgress);
      setPassword("");
      setRepeat("");
    } catch (e) {
      if (!(e instanceof Cancelled)) setNotice(errorOf(a, e));
    } finally {
      setProgress(null);
    }
  };
  const enter = () => void submit();

  const cancel = () => {
    cancelWork();
    setProgress(null);
  };

  if (refused) {
    return (
      <main className="ch-page">
        <p className="ch-card ch-bad">{m.refused}</p>
      </main>
    );
  }

  return (
    <main className="ch-page">
      <section className="ch-card" aria-labelledby="ch-title">
        <header className="ch-card-head">
          <h1 id="ch-title">{m.accountTitle}</h1>
          <button type="button" className="ch-link" onClick={toggle} aria-label={m.langSwitchLabel}>
            {m.langSwitch}
          </button>
        </header>

        <ServerStatus state={state} m={m} onRetry={recheck} />

        <div role="tablist" aria-label={m.tabsLabel} className="ch-tabs">
          {(["in", "up"] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              className="ch-tab"
              onClick={() => {
                setMode(id);
                setNotice(null);
                setTouched(false);
              }}
            >
              {id === "in" ? m.signIn : m.signUp}
            </button>
          ))}
        </div>

        <div className="ch-form">
          <HandleField
            label={m.handle}
            hint={m.handleHint}
            problem={handleProblem ? (m.handleProblem[handleProblem as keyof typeof m.handleProblem] ?? null) : null}
            value={handle}
            onChange={edit(setHandle)}
            onEnter={enter}
          />

          <Secret
            label={m.password}
            value={password}
            onChange={edit(setPassword)}
            showLabel={m.show}
            hideLabel={m.hide}
            countLabel={m.chars}
            invalid={touched && signUp && failing.size > 0}
            describedBy={signUp ? "ch-rules" : undefined}
            onEnter={enter}
          />

          {signUp && (
            <>
              <ul id="ch-rules" className="ch-rules" aria-label={m.passwordRules}>
                {RULES.map((r) => {
                  const ok = password !== "" && !failing.has(r);
                  return (
                    <li key={r} className={ok ? "ch-ok" : touched ? "ch-bad" : undefined}>
                      <span aria-hidden="true">{ok ? "✓" : "○"}</span> {m.rule[r as keyof typeof m.rule]}
                    </li>
                  );
                })}
              </ul>
              {password !== "" && (
                <div className={`ch-strength ch-s-${strength}`}>
                  <div className="ch-meter" aria-hidden="true">
                    <span style={{ width: strength === "weak" ? "25%" : strength === "fair" ? "60%" : "100%" }} />
                  </div>
                  <div>
                    {m.strength[strength]} · {m.strengthBits(bits)}
                  </div>
                </div>
              )}
              <div className="ch-hint">{m.strengthNote}</div>

              <Secret
                label={m.passwordRepeat}
                value={repeat}
                onChange={edit(setRepeat)}
                showLabel={m.show}
                hideLabel={m.hide}
                countLabel={m.chars}
                invalid={mismatch}
                onEnter={enter}
              />
              {mismatch && <div className="ch-hint ch-bad">{m.mismatch}</div>}

              {inviteRequired && (
                <div className="ch-field">
                  <label htmlFor="ch-invite">{m.inviteCode}</label>
                  <input
                    id="ch-invite"
                    type="text"
                    {...NO_AUTOFILL}
                    className="ch-input"
                    value={invite}
                    onChange={(e) => edit(setInvite)(sanitizeInvite(e.target.value))}
                    onKeyDown={onEnter(enter)}
                  />
                  <div className={touched && invite === "" ? "ch-hint ch-bad" : "ch-hint"}>{touched && invite === "" ? m.inviteRequired : m.inviteHint}</div>
                </div>
              )}

              <div className="ch-callout">
                <p>{m.noRecovery}</p>
                <p>{m.retention(retentionDays)}</p>
              </div>
            </>
          )}

          <div className="ch-field">
            <label htmlFor="ch-idle">{a.idleLogout}</label>
            <select id="ch-idle" className="ch-input" value={idleMinutes} onChange={(e) => patch({ idleMinutes: Number(e.target.value) })} onKeyDown={onEnter(enter)}>
              {IDLE_CHOICES.map((n) => (
                <option key={n} value={n}>
                  {a.idleOption(n)}
                </option>
              ))}
            </select>
            <div className="ch-hint">{a.refreshSignsOut}</div>
          </div>

          {(notice ?? lockNotice) && (
            <div className="ch-notice" role="alert">
              {notice ?? lockNotice}
            </div>
          )}

          <Steps progress={progress} m={m} />

          {progress ? (
            <button type="button" className="ch-secondary" onClick={cancel}>
              {m.cancel}
            </button>
          ) : (
            <button type="button" className="ch-primary" onClick={enter}>
              {signUp ? m.submitSignUp : m.submitSignIn}
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
