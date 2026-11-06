import type { ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { usePending } from "./ui";

/** A small set of iOS-Settings-style building blocks: grouped inset lists, rows, switches, and pages with a back button. */

/** A page of a navigation stack: a large title at the root, a small centred title with a back button once something is pushed. */
export function Page({ title, onBack, backLabel, trailing, children }: { title: string; onBack?: () => void; backLabel?: string; trailing?: ReactNode; children: ReactNode }) {
  return (
    <div className="ios-page">
      {onBack ? (
        <header className="ios-nav">
          <button type="button" className="ios-back" onClick={onBack}>
            <ChevronLeft size={24} />
            <span>{backLabel}</span>
          </button>
          <h1 className="ios-nav-title">{title}</h1>
          <span className="ios-nav-right">{trailing}</span>
        </header>
      ) : (
        <header className="ios-large">
          <h1>{title}</h1>
          {trailing}
        </header>
      )}
      {children}
    </div>
  );
}

/** An inset rounded list with an optional header above and footer note below, like a Settings section. */
export function Group({ header, footer, children }: { header?: string; footer?: ReactNode; children: ReactNode }) {
  return (
    <section className="ios-section">
      {header && <h2 className="ios-header">{header}</h2>}
      <div className="ios-group">{children}</div>
      {footer && <p className="ios-footer">{footer}</p>}
    </section>
  );
}

/** The coloured rounded square in front of a Settings row. */
export function Icon({ children, color }: { children: ReactNode; color: string }) {
  return (
    <span className="ios-icon" style={{ background: color }} aria-hidden="true">
      {children}
    </span>
  );
}

interface RowProps {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Grey text at the right edge. */
  value?: ReactNode;
  chevron?: boolean;
  destructive?: boolean;
  /** Centre the title (for actions such as "Sign out"). */
  center?: boolean;
  disabled?: boolean;
  /** May return a promise: the row then ignores taps and shows a spinner until it settles. */
  onClick?: () => unknown;
  /** A control at the right edge (a switch, an input). */
  children?: ReactNode;
}

export function Row({ icon, title, subtitle, value, chevron, destructive, center, disabled, onClick, children }: RowProps) {
  const [busy, run] = usePending();
  const body = (
    <>
      {icon}
      <span className={"ios-title" + (center ? " ios-center" : "")}>
        <span>{title}</span>
        {subtitle && <span className="ios-sub">{subtitle}</span>}
      </span>
      {value !== undefined && <span className="ios-value">{value}</span>}
      {children}
      {busy ? <span className="ch-spinner" aria-hidden="true" /> : chevron && <ChevronRight size={18} className="ios-chevron" aria-hidden="true" />}
    </>
  );
  const cls = "ios-row" + (icon ? " ios-has-icon" : "") + (destructive ? " ios-destructive" : "") + (onClick ? " ios-tap" : "");
  return onClick ? (
    <button type="button" className={cls} onClick={() => run(onClick)} disabled={disabled || busy} aria-busy={busy}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** A row with an on/off switch. */
export function SwitchRow({ icon, title, subtitle, checked, onChange }: { icon?: ReactNode; title: ReactNode; subtitle?: ReactNode; checked: boolean; onChange: (v: boolean) => unknown }) {
  const [busy, run] = usePending();
  return (
    <Row icon={icon} title={title} subtitle={subtitle}>
      <button type="button" role="switch" aria-checked={checked} aria-label={typeof title === "string" ? title : undefined} className="ios-switch" disabled={busy} aria-busy={busy} onClick={() => run(() => onChange(!checked))} />
    </Row>
  );
}

/** A row of a pick-one list; the chosen one shows a check mark. */
export function CheckRow({ title, checked, onClick }: { title: ReactNode; checked: boolean; onClick: () => unknown }) {
  return (
    <Row title={title} onClick={onClick}>
      {checked && <Check size={20} className="ios-check" aria-label="selected" />}
    </Row>
  );
}

/** A row that holds a form field (an input with its own label). */
export function FormRow({ children }: { children: ReactNode }) {
  return <div className="ios-form">{children}</div>;
}

export function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <div className="ios-error" role="alert">
      {children}
    </div>
  );
}

export function Empty({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="ios-empty">
      {icon}
      <p>{children}</p>
    </div>
  );
}
