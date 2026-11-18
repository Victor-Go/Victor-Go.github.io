import type { Connectivity, HealthState } from "../net/health";
import type { Messages } from "../i18n";

function describe(c: Connectivity, m: Messages): { tone: "good" | "warn" | "bad" | "idle"; text: string; hint: string | null } {
  switch (c.kind) {
    case "checking":
      return { tone: "idle", text: m.status.checking, hint: null };
    case "unconfigured":
      return { tone: "bad", text: m.status.unconfigured, hint: null };
    case "incompatible":
      return { tone: "bad", text: m.status.incompatible, hint: null };
    case "ok":
      return { tone: "good", text: m.status.ok(c.rttMs), hint: c.wsMs === null ? null : m.status.detail(c.httpMs, c.wsMs) };
    case "slow":
      return { tone: "warn", text: m.status.slow(c.rttMs), hint: c.wsMs === null ? null : m.status.detail(c.httpMs, c.wsMs) };
    case "allDown":
      return { tone: "bad", text: m.status.allDown, hint: null };
    case "httpDown":
      return { tone: "bad", text: c.reason === "bad_response" ? m.status.badResponse : m.status.httpDown, hint: null };
    case "wsDown":
      // The sign-in interface works, so signing in and sending are possible; only the live delivery of new messages is in doubt.
      return { tone: "warn", text: m.status.wsDown, hint: m.status.wsDownHint(c.httpMs) };
  }
}

/**
 * Connection quality of the server: the sign-in interface (one HTTPS request to `/health`) and the live channel (one plain HTTPS request to the
 * live-channel host) together. The latency shown is the average of the two when both answer.
 */
export function ServerStatus({
  state,
  connectivity,
  m,
  onRetry,
}: {
  state: HealthState;
  connectivity: Connectivity;
  m: Messages;
  onRetry: () => void;
}) {
  const { tone, text, hint } = describe(connectivity, m);
  const info = state.kind === "ok" || state.kind === "slow" ? m.serverInfo(state.health.server.version, state.health.server.region) : null;
  return (
    <div className={`ch-status ch-${tone}`} role="status" aria-live="polite" aria-label={m.status.label}>
      <span className="ch-dot" aria-hidden="true" />
      <div className="ch-status-text">
        <div>{text}</div>
        {hint && <div className="ch-hint">{hint}</div>}
        {info && connectivity.kind !== "allDown" && connectivity.kind !== "httpDown" && <div className="ch-hint">{info}</div>}
      </div>
      {connectivity.kind !== "checking" && connectivity.kind !== "unconfigured" && (
        <button type="button" className="ch-link" onClick={onRetry}>
          {m.status.retry}
        </button>
      )}
    </div>
  );
}
