import type { HealthState } from "../net/health";
import type { Messages } from "../i18n";

function describe(state: HealthState, m: Messages): { tone: "good" | "warn" | "bad" | "idle"; text: string } {
  switch (state.kind) {
    case "checking":
      return { tone: "idle", text: m.status.checking };
    case "unconfigured":
      return { tone: "bad", text: m.status.unconfigured };
    case "ok":
      return { tone: "good", text: m.status.ok(state.rttMs) };
    case "slow":
      return { tone: "warn", text: m.status.slow(state.rttMs) };
    case "incompatible":
      return { tone: "bad", text: m.status.incompatible };
    case "down":
      return {
        tone: "bad",
        text: state.reason === "timeout" ? m.status.timeout : state.reason === "network" ? m.status.network : m.status.badResponse,
      };
  }
}

/** Connection quality of the server, from one plain HTTPS request. */
export function ServerStatus({ state, m, onRetry }: { state: HealthState; m: Messages; onRetry: () => void }) {
  const { tone, text } = describe(state, m);
  const info = state.kind === "ok" || state.kind === "slow" ? m.serverInfo(state.health.server.version, state.health.server.region) : null;
  return (
    <div className={`ch-status ch-${tone}`} role="status" aria-live="polite" aria-label={m.status.label}>
      <span className="ch-dot" aria-hidden="true" />
      <div className="ch-status-text">
        <div>{text}</div>
        {info && <div className="ch-hint">{info}</div>}
      </div>
      {state.kind !== "checking" && state.kind !== "unconfigured" && (
        <button type="button" className="ch-link" onClick={onRetry}>
          {m.status.retry}
        </button>
      )}
    </div>
  );
}
