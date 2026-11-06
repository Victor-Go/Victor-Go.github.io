import { useState } from "react";
import { Bell } from "lucide-react";
import { dismissNotifyPrompt, enableNotifications, notificationsSupported } from "../client";
import { useChat } from "../store";
import { useLang } from "../useChat";

/**
 * Asks once, after sign-in, whether to turn notifications on. The browser only shows its own permission dialog in answer to a tap,
 * so this is a button, not a pop-up. "Later" is remembered in the encrypted vault, so it does not nag on every sign-in.
 */
export function NotifyPrompt() {
  const { a } = useLang();
  const dismissed = useChat((s) => s.notifyDismissed);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() => (notificationsSupported() ? Notification.permission : "unsupported"));
  if (permission !== "default" || dismissed) return null;
  return (
    <section className="ch-banner" aria-label={a.notifyPromptTitle}>
      <Bell size={22} aria-hidden="true" />
      <div className="ch-banner-text">
        <strong>{a.notifyPromptTitle}</strong>
        <div className="ch-hint">{a.notifyPromptHint}</div>
      </div>
      <div className="ch-actions">
        <button type="button" className="ch-primary ch-small" onClick={() => void enableNotifications().then(setPermission)}>
          {a.notifyPromptEnable}
        </button>
        <button type="button" className="ch-secondary ch-small" onClick={() => void dismissNotifyPrompt()}>
          {a.notifyPromptLater}
        </button>
      </div>
    </section>
  );
}
