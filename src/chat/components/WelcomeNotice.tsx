import { useChat } from "../store";
import { useLang } from "../useChat";
import { Modal } from "./ui";

/** Shown once, right after an account is created (not at every sign-in): how this page treats what the person types and reads. */
export function WelcomeNotice() {
  const { a } = useLang();
  const open = useChat((s) => s.welcome);
  const minutes = useChat((s) => s.idleMinutes);
  if (!open) return null;
  const close = () => useChat.setState({ welcome: false });
  return (
    <Modal title={a.welcomeTitle} onClose={close} closeLabel={a.close}>
      <ul className="ch-notes">
        <li>{a.welcomeOnce}</li>
        <li>{a.welcomeIdle(minutes)}</li>
        <li>{a.welcomeIme}</li>
      </ul>
      <button type="button" className="ch-primary" onClick={close}>
        {a.welcomeOk}
      </button>
    </Modal>
  );
}
