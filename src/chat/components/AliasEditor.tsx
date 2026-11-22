import { useState } from "react";
import { adminSetAlias } from "../client";
import { errorOf } from "../i18nApp";
import { useLang } from "../useChat";
import { checkHandle } from "../validation";

/**
 * An administrator's field for a person's code name (protocol 13b). Same rules as a username; empty clears it. Nobody is told, and everybody who is
 * not an administrator then sees only this name, without "@". `onSaved` gets the saved name ("" when cleared).
 */
export function AliasEditor({ userId, initial, onSaved }: { userId: string; initial: string; onSaved?: (alias: string) => void }) {
  const { a } = useLang();
  const [alias, setAlias] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const problem = alias ? checkHandle(alias) : null;
  const changed = alias !== saved;

  const save = async () => {
    if (busy || !changed || problem) return;
    setBusy(true);
    setError(null);
    setOk(false);
    try {
      const next = await adminSetAlias(userId, alias);
      setSaved(next);
      setAlias(next);
      setOk(true);
      onSaved?.(next);
    } catch (e) {
      setError(errorOf(a, e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <label className="ch-field">
      <span className="ch-label">{a.aliasLabel}</span>
      <input
        className="ch-input"
        value={alias}
        maxLength={32}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder={a.aliasPlaceholder}
        disabled={busy}
        onChange={(e) => {
          setOk(false);
          setAlias(e.target.value.replace(/[^A-Za-z0-9_-]/g, ""));
        }}
        onKeyDown={(e) => e.key === "Enter" && void save()}
      />
      {error && <span className="ch-notice" role="alert">{error}</span>}
      {ok && <span className="ch-hint">{a.aliasSaved}</span>}
      <button type="button" className="ch-secondary" disabled={busy || !changed || !!problem} onClick={() => void save()}>
        {a.aliasSave}
      </button>
    </label>
  );
}
