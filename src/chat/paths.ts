/** The addresses of the chat app's screens. Plain data (no browser access), so the build config can use it too. */
export const PATH = {
  account: "/chat/account/",
  home: "/chat/",
  conversation: "/chat/conversation/",
  group: "/chat/group/",
  me: "/chat/me/",
  favourites: "/chat/favourites/",
  settings: "/chat/settings/",
  settingsDetail: (name: string) => `/chat/settings/${name}/`,
  management: "/chat/management/",
  managementPage: (name: string) => `/chat/management/${name}/`,
} as const;

/** Every address that has a page of its own on the host (a reload there must not be a 404). Kept in step with vite.config.ts. */
export const SETTINGS_DETAILS = ["language", "idle", "notifications", "handle", "password", "connection", "delete"] as const;
export const MANAGEMENT_PAGES = ["users", "users/user", "invites", "config", "config/wipe-all", "epochs", "epochs/wipe-messages", "epochs/wipe-favourites", "cards", "jobs", "status", "audit", "starter"] as const;
export const CHAT_PATHS: string[] = [
  PATH.account,
  PATH.home,
  PATH.conversation,
  PATH.group,
  PATH.me,
  PATH.favourites,
  PATH.settings,
  ...SETTINGS_DETAILS.map(PATH.settingsDetail),
  PATH.management,
  ...MANAGEMENT_PAGES.map(PATH.managementPage),
];

export type SectionId = "contacts" | "me" | "manage";

export const sectionOf = (path: string): SectionId =>
  path === PATH.me || path.startsWith(PATH.favourites) || path.startsWith(PATH.settings) ? "me" : path.startsWith(PATH.management) ? "manage" : "contacts";
export const sectionPath = (s: SectionId): string => (s === "me" ? PATH.me : s === "manage" ? PATH.management : PATH.home);
export const isChatPath = (path: string): boolean => path === PATH.conversation || path === PATH.group;

