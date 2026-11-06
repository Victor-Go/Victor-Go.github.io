import { useEffect, useState } from "react";
import { MessageCircle, Shield, User } from "lucide-react";
import { resumeView } from "../client";
import { patch, useChat } from "../store";
import { useLang } from "../useChat";
import { ContactsPane } from "./ContactsPane";
import { Conversation } from "./Conversation";
import { ManagementPage } from "./ManagementPage";
import { MePage } from "./MePage";

export type Section = "contacts" | "me" | "manage";

/** Telegram-like layout: a rail on wide screens, a bottom tab bar on phones. Settings live inside "Me", as in iOS. */
export function Shell({ initial }: { initial: Section }) {
  const { a } = useLang();
  const me = useChat((s) => s.me)!;
  // A chat counts as open only while it still exists; otherwise the phone layout would sit on an empty pane with no way back.
  const activeConv = useChat((s) => (s.activeConv && (s.contacts.some((c) => c.convId === s.activeConv) || s.groups.some((g) => g.id === s.activeConv)) ? s.activeConv : null));
  const unread = useChat((s) => Object.values(s.unread).reduce((n, v) => n + v, 0) + s.requests.filter((r) => r.direction === "in").length);
  const anyMention = useChat((s) => Object.values(s.mentions).some(Boolean));
  const [section, setSection] = useState<Section>(initial);
  // The store needs to know which part is showing: a chat that is open but hidden behind another part is not being looked at.
  useEffect(() => {
    patch({ section });
    if (section === "contacts") resumeView();
  }, [section]);
  const nav = (id: Section, label: string, icon: React.ReactNode, badge = 0, hot = false) => (
    <button key={id} type="button" className={"ch-nav" + (section === id ? " ch-active" : "")} aria-current={section === id ? "page" : undefined} onClick={() => setSection(id)}>
      <span className="ch-nav-icon">
        {icon}
        {badge > 0 && <span className={"ch-badge ch-badge-dot" + (hot ? " ch-mention" : "")}>{badge > 99 ? "99+" : badge}</span>}
      </span>
      <span className="ch-nav-label">{label}</span>
    </button>
  );
  const items = (
    <>
      {nav("contacts", a.tabContacts, <MessageCircle size={22} />, unread, anyMention)}
      {nav("me", a.tabMe, <User size={22} />)}
      {me.role === "admin" && nav("manage", a.tabManagement, <Shield size={22} />)}
    </>
  );
  return (
    <div className="ch-app" data-section={section} data-chat={section === "contacts" && activeConv ? "open" : "closed"}>
      <nav className="ch-rail" aria-label="main">
        {items}
      </nav>

      {section === "contacts" ? (
        <>
          <ContactsPane />
          <main className="ch-main">
            <Conversation />
          </main>
        </>
      ) : (
        <main className="ch-page-main">
          {section === "me" && <MePage />}
          {section === "manage" && <ManagementPage />}
        </main>
      )}

      <nav className="ch-tabbar" aria-label="main">
        {items}
      </nav>
    </div>
  );
}
