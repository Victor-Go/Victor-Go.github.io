import { useEffect } from "react";
import { MessageCircle, Shield, User } from "lucide-react";
import { openConversation, resumeView } from "../client";
import { PATH, go, isChatPath, sectionOf, sectionPath, useLocation } from "../route";
import { patch, useChat } from "../store";
import { useLang } from "../useChat";
import { ContactsPane } from "./ContactsPane";
import { Conversation } from "./Conversation";
import { ManagementPage } from "./ManagementPage";
import { MePage } from "./MePage";

export type Section = "contacts" | "me" | "manage";

/** Telegram-like layout: a rail on wide screens, a bottom tab bar on phones. Settings live inside "Me", as in iOS. */
export function Shell() {
  const { a } = useLang();
  const me = useChat((s) => s.me)!;
  // A chat counts as open only while it still exists; otherwise the phone layout would sit on an empty pane with no way back.
  const loc = useLocation();
  const section: Section = sectionOf(loc.path);
  const wanted = isChatPath(loc.path) && typeof loc.payload === "string" ? loc.payload : null;
  const activeConv = useChat((s) => (wanted && (s.contacts.some((c) => c.convId === wanted) || s.groups.some((g) => g.id === wanted)) ? wanted : null));
  const unread = useChat((s) => Object.values(s.unread).reduce((n, v) => n + v, 0) + s.requests.filter((r) => r.direction === "in").length);
  const anyMention = useChat((s) => Object.values(s.mentions).some(Boolean));
  // The address decides which chat is open. A chat address that has no chat behind it (reloaded entry, or the chat is gone) goes back to the list.
  useEffect(() => {
    if (isChatPath(loc.path) && !activeConv) go(PATH.home, undefined, { replace: true });
  }, [loc.path, activeConv]);
  useEffect(() => {
    void openConversation(activeConv);
  }, [activeConv]);
  // The store needs to know which part is showing: a chat that is open but hidden behind another part is not being looked at.
  useEffect(() => {
    patch({ section });
    if (section === "contacts") resumeView();
  }, [section]);
  const nav = (id: Section, label: string, icon: React.ReactNode, badge = 0, hot = false) => (
    <button key={id} type="button" className={"ch-nav" + (section === id ? " ch-active" : "")} aria-current={section === id ? "page" : undefined} onClick={() => section !== id && go(sectionPath(id), undefined, { replace: true })}>
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
