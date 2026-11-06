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

export interface RequestItem {
  id: string;
  direction: "in" | "out";
  status: string;
  user: { userId: string; handle: string; role?: string };
  createdAt: number;
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
  status: "sending" | "sent" | "failed";
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
  favorites: Favorite[];
  messages: Record<string, Msg[]>;
  unread: Record<string, number>;
  /** Conversations with an unread message that mentions me (their badge turns red). */
  mentions: Record<string, boolean>;
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
  /** Messages sent this (UTC) month against the limit; limit is null for the administrator. */
  usage: { used: number; limit: number | null; resetAt: number; favoriteCount?: number; favoriteMax?: number } | null;
  /** The part of the app being looked at; a conversation counts as read only while this is "contacts". */
  section: "contacts" | "me" | "manage";
  /** Conversations that still have older messages on the server to page back to. */
  olderMore: Record<string, boolean>;
}

export const DEFAULT_IDLE_MINUTES = 10;
export const IDLE_CHOICES = [5, 10, 30, 60];

export const initialState: ChatState = {
  phase: "out",
  me: null,
  contacts: [],
  requests: [],
  groups: [],
  favorites: [],
  messages: {},
  unread: {},
  mentions: {},
  reads: {},
  sound: true,
  notifyDismissed: false,
  activeConv: null,
  socket: "idle",
  idleMinutes: DEFAULT_IDLE_MINUTES,
  notice: null,
  retentionDays: 30,
  groupMax: 32,
  voiceMaxSec: 60,
  usage: null,
  section: "contacts",
  olderMore: {},
};

export const useChat = create<ChatState>(() => initialState);

export const patch = (p: Partial<ChatState>): void => useChat.setState(p);
export const reset = (notice: string | null = null): void => useChat.setState({ ...initialState, notice });
