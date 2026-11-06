import type { Epochs } from "../cipher/crypto/epochs";
import { randomBytes } from "../cipher/crypto/secrets";
import { fromB64, toB64 } from "./crypto/b64";
import { openFavoriteText, sealFavoriteText } from "./crypto/favorite";
import { generateIdentity, publicKeyOf, toEpochs } from "./crypto/keys";
import { KX_EPOCHS, unwrapKey, wrapKey } from "./crypto/kx";
import { MESSAGE_MAX_CHARS, decryptBytes, decryptMessage, encryptBytes, encryptMessage, epochOfCiphertext, voiceBinding, type Binding, type Payload } from "./crypto/message";
import { PasswordFlow } from "./crypto/opaque";
import { newMasterKey, openRecord, sealRecord, unwrapMasterKey, wrapMasterKey } from "./crypto/vault";
import { Api, ApiError } from "./net/api";
import { ChatSocket, type Frame } from "./net/socket";
import { patch, reset, useChat, type ChatState, type Contact, type Favorite, type Group, type Msg, type RequestItem } from "./store";
import { unlockedNow } from "./adminLock";
import { setLang, useLangStore } from "./lang";
import { mentionsHandle } from "./mentions";
import { playChime } from "./sound";
import { stripControls } from "./text";
import { canonicalHandle } from "./validation";
import { fitsServer } from "./voice";
import { playVoice, stopVoice } from "./voicePlayer";
import { Cancelled, cancelWork, solveInWorkers } from "./workers/client";
import type { Challenge } from "./workers/solve";

export { ApiError, Cancelled };
export const cancelWorkNow = cancelWork;

export type Step = "derive" | "pow" | "server" | "vault";
export interface Progress {
  step: Step;
  /** 0..1 within the proof-of-work step. */
  fraction?: number;
  /** Difficulty multiplier from recent failed sign-ins; shown only when above 1. */
  multiplier?: number;
}
export type OnProgress = (p: Progress) => void;

interface SessionPayload {
  sessionToken: string;
  userId: string;
  handle: string;
  role: "admin" | "user";
  publicKey: string;
  wrappedMK: string;
  idleTimeoutMaxMs: number;
}

interface WireMessage {
  conv: string;
  seq: number;
  senderId: string;
  clientMsgId: string;
  epoch: number;
  gen: number;
  ct: string;
  serverTime: number;
  role: string;
}

type LockWhy = "expired" | "kicked" | "replaced";

/** Everything secret lives here, never in the React store, and is zeroed by lock(). */
const s = {
  api: null as Api | null,
  ws: null as ChatSocket | null,
  wsUrl: null as string | null,
  mk: null as Uint8Array | null,
  seed: null as Uint8Array | null,
  wrappedMK: "",
  epochs: null as Epochs | null,
  /** The id the next message epoch will get: an id below it that the table lacks was destroyed, one at or above it never existed. */
  nextEpoch: 0,
  fav: null as { current: number; constants: Map<number, string> } | null,
  versions: new Map<string, number>(),
  contactKeys: new Map<string, { key: Uint8Array; convId: string }>(),
  groupKeys: new Map<string, Map<number, Uint8Array>>(),
  lastSeq: new Map<string, number>(),
  sentRead: new Map<string, number>(),
  autoBusy: new Set<string>(),
  /** Messages already sent again once after the server said their epoch is gone. */
  retried: new Set<string>(),
  /** Decrypted recordings, by voice id: memory only, zeroed by lock(). */
  voice: new Map<string, Uint8Array>(),
  lastTouch: 0,
  notifyTitle: (_handle: string) => "",
  lockNotice: (_why: LockWhy) => "",
};

export function configure(api: Api | null, wsUrl: string | null, texts: { notifyTitle: (handle: string) => string; lockNotice: (why: LockWhy) => string }): void {
  s.api = api;
  s.wsUrl = wsUrl;
  s.notifyTitle = texts.notifyTitle;
  s.lockNotice = texts.lockNotice;
  if (api) api.onUnauthorized = () => lock(s.lockNotice("expired"));
}

const api = (): Api => {
  if (!s.api) throw new ApiError(0, "network");
  // Showing the signed-in view without a session (the page's code was swapped under it, say) must never look like a working one: sign out for real.
  if (!s.api.token && useChat.getState().phase === "ready") {
    lock(s.lockNotice("expired"));
    throw new ApiError(401, "unauthorized");
  }
  return s.api;
};
const me = () => {
  const m = useChat.getState().me;
  if (!m) throw new ApiError(401, "unauthorized");
  return m;
};
const newId = (): string => toB64(randomBytes(12));

// ---------- proof of work ----------
async function pow(action: string, subject: string, onProgress?: OnProgress): Promise<{ id: string; nonces: number[] }> {
  const c = await api().post<Challenge>("/pow/challenge", { action, subject });
  onProgress?.({ step: "pow", fraction: 0, multiplier: c.multiplier });
  const nonces = await solveInWorkers(c, (fraction) => onProgress?.({ step: "pow", fraction, multiplier: c.multiplier }));
  return { id: c.id, nonces };
}

// ---------- session ----------
const wrongPassword = (): ApiError => new ApiError(401, "unauthorized");

export async function register(handle: string, password: string, inviteCode: string | undefined, onProgress: OnProgress): Promise<void> {
  const flow = new PasswordFlow(password);
  let kek: Uint8Array | null = null;
  try {
    const registrationRequest = await flow.startRegistration();
    const solution = await pow("register", canonicalHandle(handle), onProgress);
    onProgress({ step: "server" });
    const start = await api().post<{ regId: string; userId: string; registrationResponse: string }>("/auth/register/start", { handle, inviteCode, pow: solution, registrationRequest });
    onProgress({ step: "derive" });
    const done = await flow.finishRegistration(start.registrationResponse, start.userId);
    kek = done.kek;
    const identity = generateIdentity();
    const mk = newMasterKey();
    const wrappedMK = await wrapMasterKey(mk, kek);
    onProgress({ step: "server" });
    const session = await api().post<SessionPayload>("/auth/register/finish", { regId: start.regId, registrationRecord: done.registrationRecord, publicKey: identity.publicKey, wrappedMK });
    await establish(session, mk, identity.seed, onProgress);
  } finally {
    kek?.fill(0);
    flow.wipe();
  }
}

export async function login(handle: string, password: string, onProgress: OnProgress): Promise<void> {
  const flow = new PasswordFlow(password);
  let kek: Uint8Array | null = null;
  try {
    const startLoginRequest = await flow.startLogin();
    const solution = await pow("login", canonicalHandle(handle), onProgress);
    onProgress({ step: "server" });
    const start = await api().post<{ loginId: string; userId: string; loginResponse: string }>("/auth/login/start", { handle, pow: solution, startLoginRequest });
    onProgress({ step: "derive" });
    const done = await flow.finishLogin(start.loginResponse, start.userId);
    // The library cannot open the envelope: the password is wrong (or the handle unknown, which looks the same). Nothing more is sent.
    if (!done) throw wrongPassword();
    kek = done.kek;
    onProgress({ step: "server" });
    const session = await api().post<SessionPayload>("/auth/login/finish", { loginId: start.loginId, finishLoginRequest: done.finishLoginRequest });
    const mk = await unwrapMasterKey(session.wrappedMK, kek);
    await establish(session, mk, null, onProgress);
  } finally {
    kek?.fill(0);
    flow.wipe();
  }
}

async function establish(session: SessionPayload, mk: Uint8Array, seed: Uint8Array | null, onProgress: OnProgress): Promise<void> {
  const a = api();
  a.token = session.sessionToken;
  s.mk = mk;
  s.wrappedMK = session.wrappedMK;
  patch({ phase: "busy", me: { userId: session.userId, handle: session.handle, role: session.role, publicKey: session.publicKey }, notice: null });
  onProgress({ step: "vault" });
  try {
    const health = await a.get<{ features: { retentionDays: number; groupMax: number; voiceMaxSec: number } }>("/health");
    patch({ retentionDays: health.features.retentionDays, groupMax: health.features.groupMax, voiceMaxSec: health.features.voiceMaxSec });
    await refreshEpochs();
    if (seed) await putRecord("identity", { seed: toB64(seed) });
    await loadVault();
    if (!s.seed) throw new ApiError(0, "internal");
    if (publicKeyOf(s.seed) !== session.publicKey) throw new ApiError(0, "internal");
    // A socket of an earlier sign-in that is still winding down must not touch this one: no state, no frames, and above all no "kicked" lock.
    const mine = (): boolean => s.ws === sock;
    const sock: ChatSocket = new ChatSocket({
      url: s.wsUrl ?? a.base.replace(/^http/, "ws") + "/ws",
      getTicket: async () => (await a.post<{ ticket: string }>("/auth/ws-ticket")).ticket,
      onFrame: (f) => mine() && void onFrame(f),
      onState: (socket) => mine() && patch({ socket }),
      onFinal: (reason) => mine() && lock(s.lockNotice(reason === "replaced" ? "replaced" : "kicked")),
    });
    s.ws = sock;
    await Promise.all([refreshContacts(), refreshGroups()]);
    await refreshUsage();
    s.ws.start();
    unlockedNow(); // the server opens the management lock at sign-in too
    patch({ phase: "ready" });
  } catch (e) {
    lock(null);
    throw e;
  }
}

/** Wipes every key and message from memory and returns to the signed-out view. */
export function lock(notice: string | null = null): void {
  cancelWork();
  s.ws?.stop();
  s.ws = null;
  for (const b of [s.mk, s.seed]) b?.fill(0);
  for (const { key } of s.contactKeys.values()) key.fill(0);
  for (const m of s.groupKeys.values()) for (const k of m.values()) k.fill(0);
  s.mk = s.seed = null;
  s.epochs = null;
  s.nextEpoch = 0;
  s.fav = null;
  s.versions.clear();
  s.contactKeys.clear();
  s.groupKeys.clear();
  s.lastSeq.clear();
  s.sentRead.clear();
  s.autoBusy.clear();
  s.retried.clear();
  stopVoice();
  for (const b of s.voice.values()) b.fill(0);
  s.voice.clear();
  if (s.api) s.api.token = null;
  reset(notice);
}

export async function logout(): Promise<void> {
  try {
    await s.api?.post("/auth/logout");
  } catch {
    /* the session is dropped locally either way */
  }
  lock(null);
}

/** Tells the server the user is active (at most once a minute), so its idle timer keeps running. */
export function touch(): void {
  const t = Date.now();
  if (!s.api?.token || t - s.lastTouch < 60_000) return;
  s.lastTouch = t;
  void s.api.post("/session/touch").catch(() => {});
}

// ---------- epochs and vault ----------
export async function refreshEpochs(): Promise<void> {
  const r = await api().get<{ current: number; next: number; epochs: { id: number; constant: string }[]; favorite: { current: number; epochs: { id: number; constant: string }[] } }>("/epochs");
  s.epochs = toEpochs(r.epochs, r.current);
  s.nextEpoch = r.next;
  s.fav = { current: r.favorite.current, constants: new Map(r.favorite.epochs.map((e) => [e.id, e.constant])) };
}
const epochs = (): Epochs => {
  if (!s.epochs) throw new ApiError(0, "internal");
  return s.epochs;
};

async function putRecord(id: string, value: unknown): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const base = s.versions.get(id) ?? 0;
    const ciphertext = await sealRecord(s.mk!, me().userId, id, base + 1, value);
    try {
      const r = await api().put<{ version: number }>(`/vault/${encodeURIComponent(id)}`, { baseVersion: base, ciphertext });
      s.versions.set(id, r.version);
      return;
    } catch (e) {
      if (!(e instanceof ApiError) || e.code !== "conflict" || attempt === 1) throw e;
      s.versions.set(id, Number(e.extra.version ?? 0));
    }
  }
}

async function deleteRecord(id: string): Promise<void> {
  await api().del(`/vault/${encodeURIComponent(id)}`);
  s.versions.delete(id);
}

async function loadVault(): Promise<void> {
  const r = await api().get<{ records: { id: string; version: number; deleted: boolean; ciphertext: string }[] }>("/vault?since=0");
  const userId = me().userId;
  const favorites: Favorite[] = [];
  for (const rec of r.records) {
    if (rec.deleted) continue;
    s.versions.set(rec.id, rec.version);
    try {
      const v = await openRecord<Record<string, unknown>>(s.mk!, userId, rec.id, rec.version, rec.ciphertext);
      if (rec.id === "identity") s.seed = fromB64(String(v.seed));
      else if (rec.id === "settings") {
        if (v.lang === "zh" || v.lang === "en") setLang(v.lang);
        if (typeof v.sound === "boolean") patch({ sound: v.sound });
        if (typeof v.notifyDismissed === "boolean") patch({ notifyDismissed: v.notifyDismissed });
      }
      else if (rec.id.startsWith("contact:")) s.contactKeys.set(rec.id.slice(8), { key: fromB64(String(v.key)), convId: String(v.convId) });
      else if (rec.id.startsWith("group:")) {
        const keys = new Map<number, Uint8Array>();
        for (const [gen, k] of Object.entries(v.keys as Record<string, string>)) keys.set(Number(gen), fromB64(k));
        s.groupKeys.set(rec.id.slice(6), keys);
      } else if (rec.id.startsWith("fav:")) {
        // fav:<favourite epoch>:<id>: the epoch in the record id says which constant it was sealed under, without opening it.
        const tag = /^fav:(\d+):(.+)$/.exec(rec.id);
        if (tag) favorites.push(await readFavorite(Number(tag[1]), tag[2], v));
      }
    } catch {
      /* a record that does not open is skipped, never fatal */
    }
  }
  patch({ favorites: favorites.sort((a, b) => b.savedAt - a.savedAt) });
}

interface FavoriteRecord {
  conv?: unknown;
  from?: unknown;
  time?: unknown;
  savedAt?: unknown;
  gen?: unknown;
  sealed?: unknown;
  text?: unknown;
}

/** A favourite from the vault: its text opens only while the favourite epoch it was sealed under still exists. */
async function readFavorite(epoch: number, id: string, v: FavoriteRecord): Promise<Favorite> {
  const base = { id, conv: String(v.conv ?? ""), from: String(v.from ?? ""), time: Number(v.time) || 0, savedAt: Number(v.savedAt) || 0, gen: epoch };
  const constant = s.fav?.constants.get(epoch);
  if (typeof v.sealed === "string" && constant !== undefined && s.mk) {
    try {
      return { ...base, text: await openFavoriteText(s.mk, { gen: epoch, constant }, me().userId, id, epoch, v.sealed) };
    } catch {
      /* it does not open: shown as destroyed */
    }
  }
  return { ...base, text: null };
}

async function putFavorite(f: Favorite): Promise<void> {
  const constant = s.fav?.constants.get(s.fav.current);
  if (f.text === null || !s.fav || constant === undefined || !s.mk) return;
  const archive = { gen: s.fav.current, constant };
  const sealed = await sealFavoriteText(s.mk, archive, me().userId, f.id, f.text);
  await putRecord(`fav:${archive.gen}:${f.id}`, { conv: f.conv, from: f.from, time: f.time, savedAt: f.savedAt, sealed });
}

// ---------- contacts ----------
interface WireRequest {
  id: string;
  status: string;
  createdAt: number;
  /** Set by the server for the starting contact with the first active admin; the new user's client accepts it at once. */
  auto?: boolean;
  from: { userId: string; handle: string; publicKey: string; role?: string };
  to: { userId: string; handle: string; publicKey: string; role?: string };
  kx: string | null;
}

export async function refreshContacts(): Promise<void> {
  const myId = me().userId;
  const reqs = (await api().get<{ requests: WireRequest[] }>("/contacts/requests")).requests;
  for (const r of reqs) {
    if (r.from.userId === myId && r.status === "accepted" && r.kx) {
      try {
        const key = await unwrapKey(s.seed!, r.kx, KX_EPOCHS);
        const convId = (await api().get<{ contacts: { userId: string; convId: string }[] }>("/contacts")).contacts.find((c) => c.userId === r.to.userId)?.convId;
        if (convId) {
          await saveContactKey(r.to.userId, r.to.handle, convId, key);
          await api().post("/contacts/ack", { requestId: r.id });
        }
      } catch {
        /* the key exchange cannot be opened (retired epoch); the contact stays without a key */
      }
    }
  }
  const list = (await api().get<{ contacts: { userId: string; handle: string; role: string; convId: string; deleted?: boolean }[] }>("/contacts")).contacts;
  const contacts: Contact[] = list.map((c) => ({ ...c, key: s.contactKeys.get(c.userId)?.key ?? null }));
  // A key saved before the server confirmed the contact has no conversation id yet; now that it is known it is written down.
  for (const c of contacts) {
    const k = s.contactKeys.get(c.userId);
    if (k && !c.deleted && k.convId !== c.convId) await saveContactKey(c.userId, c.handle, c.convId, k.key).catch(() => {});
  }
  const requests: RequestItem[] = reqs
    .filter((r) => r.status === "pending" && !r.auto)
    .map((r) => ({
      id: r.id,
      direction: r.to.userId === myId ? "in" : "out",
      status: r.status,
      user: r.to.userId === myId ? r.from : r.to,
      createdAt: r.createdAt,
    }));
  const before = useChat.getState().contacts.map((c) => c.convId);
  patch({ contacts, requests });
  forgetChats(before.filter((id) => !contacts.some((c) => c.convId === id)));
  // The starting contact with the admin: accepting it creates the chat key and wraps it to the admin, who picks it up on their next sign-in.
  for (const r of reqs) {
    if (!(r.auto && r.status === "pending" && r.to.userId === myId) || s.autoBusy.has(r.id)) continue;
    s.autoBusy.add(r.id);
    try {
      await acceptRequest(r.id);
    } catch {
      /* it is retried the next time contacts are refreshed */
    } finally {
      s.autoBusy.delete(r.id);
    }
  }
}

async function saveContactKey(userId: string, handle: string, convId: string, key: Uint8Array): Promise<void> {
  s.contactKeys.set(userId, { key, convId });
  await putRecord(`contact:${userId}`, { key: toB64(key), convId, handle });
}

export async function requestContact(handle: string, onProgress: OnProgress): Promise<void> {
  const solution = await pow("contact", canonicalHandle(handle), onProgress);
  onProgress({ step: "server" });
  await api().post("/contacts/request", { toHandle: handle, pow: solution });
  await refreshContacts();
}

export async function acceptRequest(requestId: string): Promise<void> {
  const reqs = (await api().get<{ requests: WireRequest[] }>("/contacts/requests")).requests;
  const r = reqs.find((x) => x.id === requestId);
  if (!r) throw new ApiError(404, "not_found");
  // The key goes into the vault before the server hears of it, so no exit in between can leave a contact nobody can open. A second try
  // reuses the same key, which makes the whole step safe to repeat.
  const key = s.contactKeys.get(r.from.userId)?.key ?? randomBytes(32);
  await saveContactKey(r.from.userId, r.from.handle, s.contactKeys.get(r.from.userId)?.convId ?? "", key);
  const kx = await wrapKey(r.from.publicKey, key, KX_EPOCHS);
  const { convId } = await api().post<{ convId: string }>("/contacts/accept", { requestId, kx });
  await saveContactKey(r.from.userId, r.from.handle, convId, key);
  await refreshContacts();
}

export async function declineRequest(requestId: string): Promise<void> {
  await api().post("/contacts/decline", { requestId });
  await refreshContacts();
}

export async function removeContact(userId: string): Promise<void> {
  await api().post("/contacts/remove", { userId });
  s.contactKeys.get(userId)?.key.fill(0);
  s.contactKeys.delete(userId);
  await deleteRecord(`contact:${userId}`).catch(() => {});
  await refreshContacts();
}

// ---------- messages ----------
const keyFor = (conv: string, gen: number): Uint8Array | null => {
  const g = s.groupKeys.get(conv);
  if (g) return g.get(gen) ?? null;
  const peer = useChat.getState().contacts.find((c) => c.convId === conv);
  if (peer) return s.contactKeys.get(peer.userId)?.key ?? null;
  for (const c of s.contactKeys.values()) if (c.convId === conv) return c.key;
  return null;
};
const currentGen = (conv: string): number => useChat.getState().groups.find((g) => g.id === conv)?.gen ?? 0;

async function toMsg(w: WireMessage, mine: boolean): Promise<Msg> {
  let payload: Payload | null = null;
  let lost: Msg["lost"];
  const epoch = epochOfCiphertext(w.ct) ?? undefined;
  const key = keyFor(w.conv, w.gen);
  if (epoch !== undefined && !s.epochs?.labels.has(epoch) && epoch < s.nextEpoch) {
    lost = "destroyed"; // the server destroyed that epoch's constant: nothing can open it any more
  } else if (key) {
    const binding: Binding = { conv: w.conv, senderId: w.senderId, clientMsgId: w.clientMsgId, gen: w.gen };
    try {
      const p = await decryptMessage(key, epochs(), w.ct, binding);
      payload = p.k === "text" ? { ...p, text: stripControls(p.text) } : p;
    } catch {
      lost = "unverified";
    }
  } else {
    lost = "unverified";
  }
  return { id: w.clientMsgId, seq: w.seq, senderId: w.senderId, role: w.role, time: w.serverTime, mine, payload, epoch, gen: w.gen, lost, status: "sent" };
}

/** Returns true when the message was not in the list yet. */
function addMessage(conv: string, msg: Msg): boolean {
  const st = useChat.getState();
  const list = st.messages[conv] ?? [];
  const i = list.findIndex((m) => m.id === msg.id && m.senderId === msg.senderId);
  const next = i >= 0 ? list.map((m, j) => (j === i ? msg : m)) : [...list, msg];
  next.sort((a, b) => (a.seq || Infinity) - (b.seq || Infinity) || a.time - b.time);
  patch({ messages: { ...st.messages, [conv]: next } });
  // Looked at means: the contacts part is showing, this chat is open in it, and the page is visible. Anything else leaves it unread (and rings).
  if (i < 0 && !msg.mine && !(st.section === "contacts" && st.activeConv === conv && !document.hidden)) {
    patch({ unread: { ...useChat.getState().unread, [conv]: (st.unread[conv] ?? 0) + 1 } });
    // "@name " in a group message to me turns that group's badge red.
    const me = st.me;
    if (me && msg.payload?.k === "text" && !st.contacts.some((c) => c.convId === conv) && mentionsHandle(msg.payload.text, me.handle)) {
      patch({ mentions: { ...useChat.getState().mentions, [conv]: true } });
    }
    notifyIncoming(conv);
  }
  if (i < 0 && !msg.mine) markRead(conv);
  return i < 0;
}

const PAGE = 50;
interface HistoryPage {
  messages: WireMessage[];
  lastSeq: number;
  hasMore: boolean;
  peerRead?: number;
}

/**
 * The first time a chat is opened it loads the newest page (older ones are requested on demand); after that it only asks for what is newer than
 * the last sequence number it has. Pages are cut by sequence number, so messages arriving meanwhile can neither shift nor repeat a page.
 */
export async function loadHistory(conv: string): Promise<void> {
  const myId = me().userId;
  const first = !s.lastSeq.has(conv);
  let after = s.lastSeq.get(conv) ?? 0;
  for (let round = 0; round < 200; round++) {
    const q = first && round === 0 ? `limit=${PAGE}` : `afterSeq=${after}&limit=${PAGE}`;
    const r = await api().get<HistoryPage>(`/messages?conv=${encodeURIComponent(conv)}&${q}`);
    if (r.peerRead !== undefined) patch({ reads: { ...useChat.getState().reads, [conv]: Math.max(useChat.getState().reads[conv] ?? 0, r.peerRead) } });
    for (const w of r.messages) {
      addMessage(conv, await toMsg({ ...w, conv }, w.senderId === myId));
      after = Math.max(after, w.seq);
    }
    if (first && round === 0) {
      patch({ olderMore: { ...useChat.getState().olderMore, [conv]: r.hasMore } });
      after = Math.max(after, r.lastSeq);
      s.lastSeq.set(conv, after);
      break;
    }
    s.lastSeq.set(conv, after);
    if (!r.hasMore) break;
  }
}

/** Pages back: the newest messages older than the oldest one on screen. */
export async function loadOlder(conv: string): Promise<void> {
  const myId = me().userId;
  const oldest = (useChat.getState().messages[conv] ?? []).reduce((n, m) => (m.seq > 0 ? Math.min(n, m.seq) : n), Infinity);
  if (!Number.isFinite(oldest)) return;
  const r = await api().get<HistoryPage>(`/messages?conv=${encodeURIComponent(conv)}&beforeSeq=${oldest}&limit=${PAGE}`);
  for (const w of r.messages) addMessage(conv, await toMsg({ ...w, conv }, w.senderId === myId));
  patch({ olderMore: { ...useChat.getState().olderMore, [conv]: r.hasMore } });
}

export async function openConversation(conv: string | null): Promise<void> {
  const st = useChat.getState();
  patch({
    activeConv: conv,
    unread: conv ? { ...st.unread, [conv]: 0 } : st.unread,
    mentions: conv ? { ...st.mentions, [conv]: false } : st.mentions,
  });
  if (conv) await loadHistory(conv).catch(() => {});
  markRead(conv);
}

/**
 * After epochs are destroyed the messages sealed under them stay listed, with sender and time, but the text goes: any that is still in memory is
 * dropped too, so nothing readable outlives its epoch on screen. Messages of epochs that still exist are left alone.
 */
function forgetWiped(): void {
  const st = useChat.getState();
  const gone = (m: Msg) => m.payload !== null && m.epoch !== undefined && !s.epochs?.labels.has(m.epoch);
  const messages = Object.fromEntries(Object.entries(st.messages).map(([conv, list]) => [conv, list.map((m) => (gone(m) ? { ...m, payload: null, lost: "destroyed" as const } : m))]));
  const favorites = st.favorites.map((f) => (s.fav?.constants.has(f.gen) ? f : { ...f, text: null }));
  patch({ messages, favorites });
}

/** Back on the page, or back on the contacts part: the open chat now counts as looked at. */
export function resumeView(): void {
  const st = useChat.getState();
  if (st.section !== "contacts" || !st.activeConv || document.hidden) return;
  patch({ unread: { ...st.unread, [st.activeConv]: 0 }, mentions: { ...st.mentions, [st.activeConv]: false } });
  markRead(st.activeConv);
}

/** Tells the other person (in a 1:1 chat, never in a group) that I have read everything up to the latest message, while I am looking at it. */
export function markRead(conv: string | null): void {
  if (!conv || document.hidden || !s.api?.token) return;
  const st = useChat.getState();
  if (st.section !== "contacts" || st.activeConv !== conv || !st.contacts.some((c) => c.convId === conv)) return;
  const upTo = (st.messages[conv] ?? []).reduce((n, m) => (m.mine ? n : Math.max(n, m.seq)), 0);
  if (upTo <= (s.sentRead.get(conv) ?? 0)) return;
  s.sentRead.set(conv, upTo);
  if (!s.ws?.send({ t: "read", conv, upTo })) void s.api.post("/conversations/read", { conv, upTo }).catch(() => {});
}

export async function sendText(conv: string, text: string): Promise<void> {
  const clean = text.trim();
  if (!clean || Array.from(clean).length > MESSAGE_MAX_CHARS) return;
  const myId = me().userId;
  const gen = currentGen(conv);
  const key = keyFor(conv, gen);
  if (!key) throw new ApiError(0, "forbidden");
  const id = newId();
  const sentAt = Date.now();
  const optimistic: Msg = { id, seq: 0, senderId: myId, role: me().role, time: sentAt, mine: true, payload: { k: "text", text: clean, sentAt }, gen, status: "sending" };
  addMessage(conv, optimistic);
  try {
    await transmit(conv, optimistic);
  } catch (e) {
    // The server no longer knows the epoch this was sealed with: ask for the current ones and send once more, freshly sealed.
    if (e instanceof ApiError && e.code === "gone" && !s.retried.has(id)) {
      s.retried.add(id);
      try {
        await refreshEpochs();
        await transmit(conv, optimistic);
        return;
      } catch {
        /* falls through to failed */
      }
    }
    if (e instanceof ApiError && e.code === "monthly_limit") void refreshUsage();
    addMessage(conv, { ...optimistic, status: "failed" });
  }
}

/**
 * Sends a recording: the MP3 is sealed like a message body (bound to the message that will carry it), uploaded, and then a message with the
 * returned id and the duration goes out like text. A 403 from the upload means the administrator switched voice off.
 */
export async function sendVoice(conv: string, mp3: Uint8Array, ms: number): Promise<void> {
  const myId = me().userId;
  const gen = currentGen(conv);
  if (!keyFor(conv, gen)) throw new ApiError(0, "forbidden");
  const id = newId();
  const sentAt = Date.now();
  // The bubble shows at once; it has no id to play from until the upload is done.
  const optimistic: Msg = { id, seq: 0, senderId: myId, role: me().role, time: sentAt, mine: true, payload: { k: "voice", voice: { id: "", ms }, sentAt }, gen, status: "sending" };
  addMessage(conv, optimistic);
  const attempt = async (): Promise<void> => {
    const key = keyFor(conv, gen);
    if (!key) throw new ApiError(0, "forbidden");
    const sealed = await encryptBytes(key, epochs(), mp3, voiceBinding({ conv, senderId: myId, clientMsgId: id, gen }));
    if (!fitsServer(sealed.ct)) throw new ApiError(413, "too_large");
    const up = await api().post<{ voiceId: string }>("/voice", { conv, ct: sealed.ct });
    const m: Msg = { ...optimistic, payload: { k: "voice", voice: { id: up.voiceId, ms }, sentAt } };
    addMessage(conv, m);
    await transmit(conv, m);
  };
  try {
    await attempt();
  } catch (e) {
    if (e instanceof ApiError && e.code === "gone" && !s.retried.has(id)) {
      s.retried.add(id);
      try {
        await refreshEpochs();
        await attempt();
        return;
      } catch {
        /* falls through to failed */
      }
    }
    if (e instanceof ApiError && e.code === "monthly_limit") void refreshUsage();
    if (e instanceof ApiError && e.status === 403 && e.code === "forbidden") patch({ voiceOff: true });
    addMessage(conv, { ...(useChat.getState().messages[conv]?.find((x) => x.id === id && x.mine) ?? optimistic), status: "failed" });
  }
}

/** Downloads, opens and plays a recording. The bytes stay in memory until the chat locks. Throws ApiError / CipherError for the caller to show. */
export async function playVoiceMessage(conv: string, m: Msg): Promise<void> {
  const p = m.payload;
  if (p?.k !== "voice" || !p.voice.id) return;
  const voiceId = p.voice.id;
  let bytes = s.voice.get(voiceId);
  if (!bytes) {
    const gen = m.gen ?? currentGen(conv);
    const key = keyFor(conv, gen);
    const epoch = m.epoch;
    const gone = epoch !== undefined && !s.epochs?.labels.has(epoch);
    if (!key || gone) {
      markLost(conv, m, gone && epoch !== undefined && epoch < s.nextEpoch ? "destroyed" : "unverified");
      return;
    }
    let ct: string;
    try {
      ct = (await api().get<{ ct: string }>(`/voice/${encodeURIComponent(voiceId)}`)).ct;
    } catch (e) {
      // Older than the retention period, or removed with a wipe: the recording is gone for good.
      if (e instanceof ApiError && (e.status === 404 || e.status === 410)) {
        markLost(conv, m, "destroyed");
        return;
      }
      throw e;
    }
    try {
      bytes = await decryptBytes(key, epochs(), ct, voiceBinding({ conv, senderId: m.senderId, clientMsgId: m.id, gen }));
    } catch {
      markLost(conv, m, "unverified");
      return;
    }
    s.voice.set(voiceId, bytes);
  }
  await playVoice(voiceId, bytes);
}

function markLost(conv: string, m: Msg, lost: "destroyed" | "unverified"): void {
  addMessage(conv, { ...m, payload: null, lost });
}

/** Seals the message under the current epoch and sends it: over the socket when it is up (the answer arrives as a frame), else over HTTP. */
async function transmit(conv: string, m: Msg): Promise<void> {
  const gen = currentGen(conv);
  const key = keyFor(conv, gen);
  if (!key || !m.payload) throw new ApiError(0, "forbidden");
  const { epoch, ct } = await encryptMessage(key, epochs(), m.payload, { conv, senderId: m.senderId, clientMsgId: m.id, gen });
  const frame = { t: "send", conv, clientMsgId: m.id, epoch, gen, ct };
  if (s.ws?.send(frame)) return;
  const r = await api().post<{ seq: number }>("/messages", frame);
  addMessage(conv, { ...m, seq: r.seq, status: "sent" });
  void refreshUsage();
}

async function onFrame(f: Frame): Promise<void> {
  const myId = useChat.getState().me?.userId;
  if (!myId) return;
  if (f.t === "message") {
    const w = f as unknown as WireMessage;
    if (!s.epochs?.labels.has(w.epoch)) await refreshEpochs().catch(() => {});
    if (!keyFor(w.conv, w.gen) && s.groupKeys.has(w.conv)) await refreshGroups().catch(() => {});
    // A jump in the sequence means something was missed (the socket was down): load what is between.
    const known = s.lastSeq.get(w.conv);
    if (known !== undefined && w.seq > known + 1) await loadHistory(w.conv).catch(() => {});
    const isNew = addMessage(w.conv, await toMsg(w, w.senderId === myId));
    // Only a chat that has been loaded keeps a position; for the others the first open loads the newest page itself.
    if (s.lastSeq.has(w.conv)) s.lastSeq.set(w.conv, Math.max(s.lastSeq.get(w.conv) ?? 0, w.seq));
    if (isNew && w.senderId !== myId && useChat.getState().sound) playChime();
  } else if (f.t === "read") {
    const conv = String(f.conv);
    patch({ reads: { ...useChat.getState().reads, [conv]: Math.max(useChat.getState().reads[conv] ?? 0, Number(f.upTo) || 0) } });
  } else if (f.t === "ack") {
    const conv = String(f.conv);
    const list = useChat.getState().messages[conv] ?? [];
    const m = list.find((x) => x.id === f.clientMsgId && x.mine);
    if (m) addMessage(conv, { ...m, seq: Number(f.seq), status: "sent" });
    void refreshUsage();
  } else if (f.t === "error") {
    for (const [conv, list] of Object.entries(useChat.getState().messages)) {
      const m = list.find((x) => x.id === f.clientMsgId && x.mine && x.status === "sending");
      if (!m) continue;
      if (f.code === "gone" && !s.retried.has(m.id)) {
        s.retried.add(m.id);
        try {
          await refreshEpochs();
          await transmit(conv, m);
          continue;
        } catch {
          /* falls through to failed */
        }
      }
      addMessage(conv, { ...m, status: "failed" });
    }
    if (f.code === "monthly_limit") void refreshUsage();
  } else if (f.t === "notice") {
    const kind = String(f.kind);
    if (kind === "contact_request" || kind === "contact_accepted" || kind === "contact_deleted") await refreshContacts().catch(() => {});
    else if (kind === "group_event" || kind === "group_deleted") await refreshGroups().catch(() => {});
    else if (kind === "epochs") await refreshEpochs().catch(() => {});
    else if (kind === "wiped") {
      await refreshEpochs().catch(() => {});
      forgetWiped();
    }
  }
}

// ---------- notifications ----------
export const notificationsSupported = (): boolean => typeof Notification !== "undefined";
export async function enableNotifications(): Promise<NotificationPermission> {
  return notificationsSupported() ? Notification.requestPermission() : "denied";
}
function notifyIncoming(conv: string): void {
  // Only when the page is not being looked at: in another tab, minimised, or behind another window.
  if (!notificationsSupported() || Notification.permission !== "granted" || !(document.hidden || !document.hasFocus())) return;
  const st = useChat.getState();
  const name = st.contacts.find((c) => c.convId === conv)?.handle ?? st.groups.find((g) => g.id === conv)?.name ?? "";
  try {
    // Only who wrote, never the text.
    new Notification(s.notifyTitle(name), { silent: false, tag: conv });
  } catch {
    /* some platforms only allow notifications from a service worker */
  }
}

// ---------- groups ----------
type WireGroup = Omit<Group, "keys">;

export async function refreshGroups(): Promise<void> {
  const list = (await api().get<{ groups: WireGroup[] }>("/groups")).groups;
  const groups: Group[] = [];
  for (const g of list) {
    let keys = s.groupKeys.get(g.id);
    if (!keys) s.groupKeys.set(g.id, (keys = new Map()));
    const missing = !keys.has(g.gen);
    if (missing) {
      try {
        const r = await api().get<{ keys: { gen: number; wrap: string }[] }>(`/groups/${g.id}/keys`);
        let changed = false;
        for (const k of r.keys) {
          if (keys.has(k.gen)) continue;
          keys.set(k.gen, await unwrapKey(s.seed!, k.wrap, KX_EPOCHS));
          changed = true;
        }
        if (changed) await saveGroupKeys(g.id);
      } catch {
        /* keys the exchange can no longer open stay missing */
      }
    }
    groups.push({ ...g, keys });
  }
  const before = useChat.getState().groups.map((g) => g.id);
  patch({ groups });
  forgetChats(before.filter((id) => !groups.some((g) => g.id === id)));
}

/** A group I was removed from (or a contact that is gone) leaves no badge, draft or open chat behind. */
function forgetChats(gone: string[]): void {
  if (gone.length === 0) return;
  const st = useChat.getState();
  const drop = <T,>(r: Record<string, T>): Record<string, T> => Object.fromEntries(Object.entries(r).filter(([k]) => !gone.includes(k)));
  patch({
    unread: drop(st.unread),
    mentions: drop(st.mentions),
    drafts: drop(st.drafts),
    activeConv: st.activeConv && gone.includes(st.activeConv) ? null : st.activeConv,
  });
}

const saveGroupKeys = (gid: string): Promise<void> =>
  putRecord(`group:${gid}`, { keys: Object.fromEntries([...(s.groupKeys.get(gid) ?? [])].map(([gen, k]) => [gen, toB64(k)])) });

export async function createGroup(name: string): Promise<void> {
  // The server keeps a copy of the key wrapped to my own public key, so if the vault write below never happens the next sign-in recovers it.
  const key = randomBytes(32);
  const selfWrap = await wrapKey(me().publicKey, key, KX_EPOCHS);
  const g = await api().post<WireGroup>("/groups", { name, selfWrap });
  s.groupKeys.set(g.id, new Map([[1, key]]));
  await saveGroupKeys(g.id);
  await refreshGroups();
}

const publicKeyOfUser = async (userId: string): Promise<string> => (await api().get<{ publicKey: string }>(`/users/${userId}`)).publicKey;

/** The admin invites someone by username: the person is added at once and gets the group key wrapped to their identity. */
export async function inviteToGroup(gid: string, handle: string): Promise<void> {
  const solution = await pow("lookup", canonicalHandle(handle));
  const u = await api().post<{ userId: string; publicKey: string }>("/users/lookup", { handle, pow: solution });
  await addMember(gid, u.userId, u.publicKey);
}

async function addMember(gid: string, userId: string, publicKey?: string): Promise<void> {
  const g = useChat.getState().groups.find((x) => x.id === gid);
  const key = g && s.groupKeys.get(gid)?.get(g.gen);
  if (!g || !key) throw new ApiError(0, "forbidden");
  const wrap = await wrapKey(publicKey ?? (await publicKeyOfUser(userId)), key, KX_EPOCHS);
  await api().post(`/groups/${gid}/members`, { userId, wrap });
  await refreshGroups();
}

/** Starts generation gen+1 and wraps its key for everyone who stays (the owner keeps it in the vault). */
async function rotate(gid: string, exclude: string | null, endpoint: "kick" | "rekey"): Promise<void> {
  const g = useChat.getState().groups.find((x) => x.id === gid);
  if (!g) throw new ApiError(404, "not_found");
  const key = randomBytes(32);
  const gen = g.gen + 1;
  const wraps: { userId: string; wrap: string }[] = [];
  for (const m of g.members) {
    if (m.userId === g.ownerId || m.userId === exclude) continue;
    wraps.push({ userId: m.userId, wrap: await wrapKey(await publicKeyOfUser(m.userId), key, KX_EPOCHS) });
  }
  const selfWrap = await wrapKey(me().publicKey, key, KX_EPOCHS);
  // Vault first, then the server: a crash in between leaves an unused key behind, never a group generation nobody can open.
  let keys = s.groupKeys.get(gid);
  if (!keys) s.groupKeys.set(gid, (keys = new Map()));
  keys.set(gen, key);
  await saveGroupKeys(gid);
  try {
    await api().post(`/groups/${gid}/${endpoint}`, { gen, wraps, selfWrap, ...(exclude ? { userId: exclude } : {}) });
  } catch (e) {
    keys.delete(gen);
    await saveGroupKeys(gid).catch(() => {});
    throw e;
  }
  await refreshGroups();
}
export const kickMember = (gid: string, userId: string): Promise<void> => rotate(gid, userId, "kick");
export const rekeyGroup = (gid: string): Promise<void> => rotate(gid, null, "rekey");

export async function leaveGroup(gid: string): Promise<void> {
  await api().post(`/groups/${gid}/leave`);
  s.groupKeys.delete(gid);
  await deleteRecord(`group:${gid}`).catch(() => {});
  await refreshGroups();
}
export async function transferGroup(gid: string, userId: string): Promise<void> {
  // Stepping down: every key generation I hold is wrapped to my own public key on the server, so I stay able to recover them as a member.
  const keys = s.groupKeys.get(gid);
  if (!keys || keys.size === 0) throw new ApiError(0, "forbidden");
  const selfWraps: { gen: number; wrap: string }[] = [];
  for (const [gen, key] of keys) selfWraps.push({ gen, wrap: await wrapKey(me().publicKey, key, KX_EPOCHS) });
  await api().post(`/groups/${gid}/transfer`, { userId, selfWraps });
  await refreshGroups();
}
export async function acceptOwnership(gid: string): Promise<void> {
  await api().post(`/groups/${gid}/accept-owner`);
  await refreshGroups();
}
export async function deleteGroup(gid: string): Promise<void> {
  await api().del(`/groups/${gid}`);
  s.groupKeys.delete(gid);
  await deleteRecord(`group:${gid}`).catch(() => {});
  await refreshGroups();
}

// ---------- favourites ----------
export async function addFavorite(conv: string, msg: Msg, from: string): Promise<void> {
  if (msg.payload?.k !== "text") return;
  const fav: Favorite = { id: `${conv}.${msg.id}`.slice(0, 70), conv, from, text: msg.payload.text, time: msg.time, savedAt: Date.now(), gen: s.fav?.current ?? 0 };
  await putFavorite(fav);
  patch({ favorites: [fav, ...useChat.getState().favorites.filter((f) => f.id !== fav.id)] });
  void refreshUsage();
}
export async function removeFavorite(id: string): Promise<void> {
  const f = useChat.getState().favorites.find((x) => x.id === id);
  if (f) await deleteRecord(`fav:${f.gen}:${id}`);
  patch({ favorites: useChat.getState().favorites.filter((f) => f.id !== id) });
  void refreshUsage();
}

// ---------- account settings ----------
/** The chosen language follows the account (encrypted in the vault); nothing is stored in the browser. */
const saveSettings = (): Promise<void> =>
  putRecord("settings", { lang: useLangStore.getState().lang, sound: useChat.getState().sound, notifyDismissed: useChat.getState().notifyDismissed }).catch(() => {});

export async function saveLanguage(lang: "zh" | "en"): Promise<void> {
  setLang(lang);
  await saveSettings();
}

export async function dismissNotifyPrompt(): Promise<void> {
  patch({ notifyDismissed: true });
  await saveSettings();
}

export async function setSoundEnabled(on: boolean): Promise<void> {
  patch({ sound: on });
  if (on) playChime();
  await saveSettings();
}

export async function changeHandle(handle: string, onProgress: OnProgress): Promise<void> {
  const solution = await pow("rename", me().userId, onProgress);
  const r = await api().post<{ handle: string }>("/auth/handle", { handle, pow: solution });
  patch({ me: { ...me(), handle: r.handle } });
}

/**
 * Proves the password for one action: the work is spent at `verify/start` (named by the purpose), a fresh OPAQUE exchange follows,
 * and the answer is a one-time proof the action takes in place of the password. A wrong password stops here, before `verify/finish`,
 * and never ends the session.
 */
async function stepUp(password: string, purpose: "password" | "delete" | "unlock" | "wipeall", onProgress?: OnProgress): Promise<string> {
  const flow = new PasswordFlow(password);
  try {
    const startLoginRequest = await flow.startLogin();
    const solution = await pow(purpose, me().userId, onProgress);
    onProgress?.({ step: "server" });
    const start = await api().request<{ verifyId: string; userId: string; loginResponse: string }>("POST", "/auth/verify/start", { purpose, pow: solution, startLoginRequest }, { keepSession: true });
    onProgress?.({ step: "derive" });
    const done = await flow.finishLogin(start.loginResponse, start.userId);
    if (!done) throw wrongPassword();
    done.kek.fill(0);
    onProgress?.({ step: "server" });
    const r = await api().request<{ proof: string }>("POST", "/auth/verify/finish", { verifyId: start.verifyId, finishLoginRequest: done.finishLoginRequest }, { keepSession: true });
    return r.proof;
  } finally {
    flow.wipe();
  }
}

/** The server checks the current password (a step-up proof), then this registers the new one and re-wraps the master key for it. */
export async function changePassword(current: string, next: string, onProgress?: OnProgress): Promise<void> {
  const proof = await stepUp(current, "password", onProgress);
  const flow = new PasswordFlow(next);
  let kek: Uint8Array | null = null;
  try {
    const registrationRequest = await flow.startRegistration();
    onProgress?.({ step: "server" });
    const start = await api().request<{ pwId: string; registrationResponse: string }>("POST", "/auth/password/start", { proof, registrationRequest }, { keepSession: true });
    onProgress?.({ step: "derive" });
    const done = await flow.finishRegistration(start.registrationResponse, me().userId);
    kek = done.kek;
    const wrappedMK = await wrapMasterKey(s.mk!, kek);
    onProgress?.({ step: "server" });
    await api().request("POST", "/auth/password/finish", { pwId: start.pwId, registrationRecord: done.registrationRecord, wrappedMK }, { keepSession: true });
    s.wrappedMK = wrappedMK;
  } finally {
    kek?.fill(0);
    flow.wipe();
  }
}

/** Opens the management lock again (the server checks the password and the work; it enforces the lock, not this page). */
export async function unlockAdmin(password: string, onProgress?: OnProgress): Promise<void> {
  const proof = await stepUp(password, "unlock", onProgress);
  await api().request("POST", "/admin/unlock", { proof }, { keepSession: true });
}

export async function deleteAccount(password: string, onProgress?: OnProgress): Promise<void> {
  const proof = await stepUp(password, "delete", onProgress);
  await api().request("POST", "/auth/delete", { proof }, { keepSession: true });
  lock(null);
}

/** The administrator deletes someone: the handle is typed out and sent along, and the server checks it again. */
export async function adminDeleteUser(userId: string, handle: string, onProgress?: OnProgress): Promise<void> {
  const solution = await pow("userdelete", userId, onProgress);
  await api().post(`/admin/users/${userId}/delete`, { confirmHandle: handle, pow: solution });
}

/** Erases everything on the server, the administrator included. Every session ends with it, so the page returns to the sign-in. */
export async function wipeEverything(password: string, onProgress?: OnProgress): Promise<void> {
  const proof = await stepUp(password, "wipeall", onProgress);
  await api().request("POST", "/admin/wipe-all", { confirm: "WIPE ALL", proof }, { keepSession: true });
  lock(s.lockNotice("kicked"));
}

export async function refreshUsage(): Promise<void> {
  try {
    patch({ usage: await api().get<NonNullable<ChatState["usage"]>>("/usage") });
  } catch {
    /* the count is only shown, never needed */
  }
}

export const rawApi = (): Api => api();

// In development a hot update of this module would leave the old and the new copy sharing one signed-in screen: reload the page instead.
import.meta.hot?.accept(() => window.location.reload());
