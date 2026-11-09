import { create } from "zustand";
import type { Payload } from "./crypto/message";
import type { SocketState } from "./net/socket";

export interface Me {
  userId: string;
  handle: string;
  role: "admin" | "user";
  publicKey: string;
}

export interface Contact {
  userId: string;
  handle: string;
  role: string;
  convId: string;
  /** Chat key; null when the vault has none (the contact then cannot be used). */
  key: Uint8Array | null;
  /** The account is gone: only the name is left, the old messages stay until they expire, nothing new can be sent. */
  deleted?: boolean;
}

/** Whether this person may add or be added as a contact now, as the server says (`GET /me`); other people's switches are never known. */
export interface AccountFlags {
  contactsBlocked: boolean;
  globalContactsBlocked: boolean;
  canAddContacts: boolean;
}

export interface RequestItem {
  id: string;
  direction: "in" | "out";
  status: string;
  user: { userId: string; handle: string; role?: string };
  createdAt: number;
  /** Made with a contact card: the receiver can accept it whatever the switches say. */
  viaCard?: boolean;
}

export interface Msg {
  id: string;
  seq: number;
  senderId: string;
  role: string;
  /** Server time; the retention period and ordering use it. */
  time: number;
  mine: boolean;
  /** null when it cannot be decrypted (retired epoch or missing key). */
  payload: Payload | null;
  /** Epoch the message was sealed under (read from its header). */
  epoch?: number;
  /** Why there is no payload: its epoch was destroyed ("message key destroyed"), or it cannot be verified (cannot be opened, forged, unknown epoch). */
  lost?: "destroyed" | "unverified";
  /** Group key generation the message was sealed under (0 in 1:1 chats). */
  gen?: number;
  status: "sending" | "sent" | "failed";
  /** The sender deleted it: no text, no recording, only who and when. Identified by seq (its client id is gone). */
  deleted?: boolean;
  /** Only official messages (the read-only conversation with the system): what kind it is. They are plain, never encrypted, and have no payload. */
  kind?: string;
  data?: Record<string, unknown>;
}

export interface GroupMember {
  userId: string;
  handle: string;
  role: string;
}

export interface Group {
  id: string;
  name: string;
  ownerId: string;
  gen: number;
  max: number;
  needsRekey: boolean;
  pendingOwner: { userId: string } | null;
  members: GroupMember[];
  /** Key generation -> key; filled from the vault and the server's wrapped keys. */
  keys: Map<number, Uint8Array>;
}

export interface Favorite {
  id: string;
  conv: string;
  from: string;
  /** null when the favourite epoch it was sealed under is gone. */
  text: string | null;
  time: number;
  savedAt: number;
  /** Favourite epoch the text was sealed under. */
  gen: number;
}

export type Phase = "out" | "busy" | "ready";

export interface ChatState {
  phase: Phase;
  me: Me | null;
  contacts: Contact[];
  requests: RequestItem[];
  groups: Group[];
  /** Conversation id of the person's official (read-only, system) conversation; null until the first official message exists. */
  official: string | null;
  favorites: Favorite[];
  messages: Record<string, Msg[]>;
  unread: Record<string, number>;
  /** Conversations with an unread message that mentions me (their badge turns red). */
  mentions: Record<string, boolean>;
  /** Unsent text per conversation. Memory only: never stored, and gone on sign-out, lock or reload. */
  drafts: Record<string, string>;
  /** How far the other person has read in each 1:1 chat (a message sequence number). */
  reads: Record<string, number>;
  /** Chime on incoming messages; kept in the encrypted vault with the language. */
  sound: boolean;
  /** The user chose "later" on the notification prompt; kept in the vault with the language. */
  notifyDismissed: boolean;
  activeConv: string | null;
  socket: SocketState;
  /** Idle logout in minutes; always starts at the default and is never saved. */
  idleMinutes: number;
  notice: string | null;
  retentionDays: number;
  groupMax: number;
  voiceMaxSec: number;
  /** Server clock minus this device's clock (ms), from the last answer that carried the server's time; used to judge when a card expires. */
  clockSkew: number;
  account: AccountFlags;
  /** The server refused a recording because the administrator switched voice off; the microphone button hides until the next sign-in. */
  voiceOff: boolean;
  /** Messages sent this (UTC) month against the limit; limit is null for the administrator. */
  usage: { used: number; limit: number | null; resetAt: number; favoriteCount?: number; favoriteMax?: number; fileBytes?: number; fileLimit?: number | null } | null;
  /** The part of the app being looked at; a conversation counts as read only while this is "contacts". */
  section: "contacts" | "me" | "manage";
  /** Conversations that still have older messages on the server to page back to. */
  olderMore: Record<string, boolean>;
  /** Server time of the newest message known in each conversation, for ordering the list (most recent first). */
  lastActive: Record<string, number>;
}

/** A group has at most this many members (protocol 2); nothing in the UI offers more, whatever a server says. */
export const GROUP_MAX = 32;
/**
 * The unread number of the tab title and the navigation badge: the sum over the conversations the list shows (contacts, groups, the official one).
 * The server also counts conversations the list no longer has (a removed contact, a group left); those must not keep a count nobody can clear.
 */
export function totalUnread(s: Pick<ChatState, "unread" | "contacts" | "groups" | "official">): number {
  const shown = new Set<string>([...s.contacts.map((c) => c.convId), ...s.groups.map((g) => g.id)]);
  if (s.official) shown.add(s.official);
  let n = 0;
  for (const [conv, v] of Object.entries(s.unread)) if (shown.has(conv)) n += v;
  return n;
}

export const DEFAULT_IDLE_MINUTES = 10;
export const IDLE_CHOICES = [5, 10, 30, 60];

export const initialState: ChatState = {
  phase: "out",
  me: null,
  contacts: [],
  requests: [],
  groups: [],
  official: null,
  favorites: [],
  messages: {},
  unread: {},
  mentions: {},
  drafts: {},
  reads: {},
  sound: true,
  notifyDismissed: false,
  activeConv: null,
  socket: "idle",
  idleMinutes: DEFAULT_IDLE_MINUTES,
  notice: null,
  retentionDays: 30,
  groupMax: GROUP_MAX,
  voiceMaxSec: 60,
  clockSkew: 0,
  account: { contactsBlocked: false, globalContactsBlocked: false, canAddContacts: true },
  voiceOff: false,
  usage: null,
  section: "contacts",
  olderMore: {},
  lastActive: {},
};

export const useChat = create<ChatState>(() => initialState);

export const patch = (p: Partial<ChatState>): void => useChat.setState(p);
export const reset = (notice: string | null = null): void => useChat.setState({ ...initialState, notice });

// A hot update would split the app between an old and a new store: reload the page instead.
import.meta.hot?.accept(() => window.location.reload());
