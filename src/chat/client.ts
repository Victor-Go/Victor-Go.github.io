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
import { downloadBytes, uploadBytes, type UploadTarget } from "./net/blob";
import { ChatSocket, type Frame } from "./net/socket";
import { GROUP_MAX, patch, reset, useChat, type AccountFlags, type ChatState, type Contact, type Favorite, type Group, type Msg, type RequestItem } from "./store";
import { unlockedNow } from "./adminLock";
import { setLang, useLangStore } from "./lang";
import { mentionsHandle } from "./mentions";
import { parseCard, parseRemoved } from "./official";
import { playChime } from "./sound";
import { stripControls } from "./text";
import { canonicalHandle } from "./validation";
import { fitsServer } from "./voice";
import { canDelete, planDeleteBatches } from "./selection";
import { playVoice, stopVoice, stopVoiceIf } from "./voicePlayer";
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
  /** Protocol 2: whether this account may add or be added as a contact now (the same fields as `GET /me`). */
  contactsBlocked?: boolean;
  globalContactsBlocked?: boolean;
  canAddContacts?: boolean;
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
  /** Set by the server on a message its sender deleted; ct and clientMsgId are then empty. */
  deleted?: boolean;
  /** Official messages only: they are plain (ct is empty) and carry a kind and its data. */
  kind?: string;
  data?: Record<string, unknown>;
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
  /** Sequence numbers deleted this session, per conversation (numbers only, no content): a page fetched before the push arrived must not bring a message back. */
  tombs: new Map<string, Set<number>>(),
  /** Bumped when a conversation's cache is replaced or dropped; a slower request that started before it is thrown away. */
  loadGen: new Map<string, number>(),
  /** Favourite records (vault ids) whose message was deleted and whose removal the server has not confirmed yet. */
  favRetry: new Set<string>(),
  sentRead: new Map<string, number>(),
  /** When a read position was last sent for each conversation (ms): an unread count the server computed before that is stale. */
  readAt: new Map<string, number>(),
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
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

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
    const health = await a.get<{ features: { retentionDays: number; groupMax: number; voiceMaxSec: number }; serverTime?: number }>("/health");
    patch({
      retentionDays: health.features.retentionDays,
      groupMax: Math.min(GROUP_MAX, health.features.groupMax),
      voiceMaxSec: health.features.voiceMaxSec,
      ...(typeof health.serverTime === "number" ? { clockSkew: health.serverTime - Date.now() } : {}),
    });
    if (typeof session.canAddContacts === "boolean") applyAccount(session);
    else await refreshMe();
    await refreshEpochs();
    if (seed) await putRecord("identity", { seed: toB64(seed) });
    await loadVault();
    if (!s.seed) throw new ApiError(0, "internal");
    if (publicKeyOf(s.seed) !== session.publicKey) throw new ApiError(0, "internal");
    // A socket of an earlier sign-in that is still winding down must not touch this one: no state, no frames, and above all no "kicked" lock.
    const mine = (): boolean => s.ws === sock;
    let firstOpen = true;
    const sock: ChatSocket = new ChatSocket({
      url: s.wsUrl ?? a.base.replace(/^http/, "ws") + "/ws",
      getTicket: async () => (await a.post<{ ticket: string }>("/auth/ws-ticket")).ticket,
      onFrame: (f) => mine() && void onFrame(f),
      onState: (socket) => {
        if (!mine()) return;
        patch({ socket });
        // Every time the socket comes up (first connection, reconnect, the two-hour roll-over) pushes may have been missed: read again.
        if (socket === "open") {
          void resync(!firstOpen);
          firstOpen = false;
        }
      },
      onFinal: (reason) => mine() && lock(s.lockNotice(reason === "replaced" ? "replaced" : "kicked")),
    });
    s.ws = sock;
    await Promise.all([refreshContacts(), refreshGroups()]);
    await refreshUsage();
    await loadUnread().catch(() => {});
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
  s.tombs.clear();
  s.loadGen.clear();
  s.favRetry.clear();
  s.sentRead.clear();
  s.readAt.clear();
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

// ---------- own account ----------
function applyAccount(f: Partial<AccountFlags>): void {
  patch({
    account: {
      contactsBlocked: f.contactsBlocked === true,
      globalContactsBlocked: f.globalContactsBlocked === true,
      // A server that does not say keeps the door open; the server refuses anyway and the reason is shown.
      canAddContacts: f.canAddContacts !== false,
    },
  });
}

/** `GET /me`: the account's own switches. Called at sign-in when the answer lacks them, on a `notice` of kind "account", and after a refusal that names a switch. */
export async function refreshMe(): Promise<void> {
  applyAccount(await api().get<Partial<AccountFlags>>("/me"));
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
  /** Made with a contact card: it can be accepted whatever the contact switches say. */
  viaCard?: boolean;
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
  const list = (await api().get<{ contacts: { userId: string; handle: string; role: string; convId: string; deleted?: boolean; lastAt?: number }[] }>("/contacts")).contacts;
  // The server says when each chat last had a message, which orders the list.
  for (const c of list) noteActive(c.convId, c.lastAt ?? 0);
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
      viaCard: r.viaCard === true,
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

/** The refusals that mean the page's idea of "may I add contacts" is out of date: it is read again. */
const SWITCH_REASONS = new Set(["contacts_disabled", "self_blocked", "peer_blocked"]);
const staleSwitches = (e: unknown): void => {
  if (e instanceof ApiError && e.status === 403 && typeof e.extra.reason === "string" && SWITCH_REASONS.has(e.extra.reason)) void refreshMe().catch(() => {});
};

export async function requestContact(handle: string, onProgress: OnProgress): Promise<void> {
  const solution = await pow("contact", canonicalHandle(handle), onProgress);
  onProgress({ step: "server" });
  try {
    await api().post("/contacts/request", { toHandle: handle, pow: solution });
  } catch (e) {
    staleSwitches(e);
    throw e;
  }
  await refreshContacts();
}

/**
 * Taps an active contact card: the subject's current handle (they may have renamed), the usual work, then the request with the card's id.
 * It works whatever the contact switches say. On success the card shows as used at once; the server's `updated` frame confirms it.
 */
/** `POST /users/lookup`: the usual work, then the account with exactly this name. A name that does not exist is `404 not_found` with `reason: "handle"`. */
export async function lookupUser(handle: string, onProgress?: OnProgress): Promise<{ userId: string; handle?: string; role?: string }> {
  const solution = await pow("lookup", canonicalHandle(handle), onProgress);
  return api().post("/users/lookup", { handle, pow: solution });
}

/** A card the server says is dead (revoked, or the two are contacts already, or the subject is gone) shows as revoked at once, with the reason. */
const CARD_DEAD = new Set(["revoked_by_admin", "already_contacts", "account_deleted"]);
function cardRefused(m: Msg, e: unknown): void {
  const conv = useChat.getState().official;
  if (!conv || !(e instanceof ApiError)) return;
  const reason = typeof e.extra.reason === "string" ? e.extra.reason : "";
  if ((e.status === 409 && reason === "already_contacts") || (e.status === 403 && CARD_DEAD.has(reason))) {
    updateOfficial(conv, m.seq, "card", { ...m.data, state: "revoked", reason });
    if (reason === "already_contacts") void refreshContacts().catch(() => {});
  } else if (e.status === 409 && reason === "used") updateOfficial(conv, m.seq, "card", { ...m.data, state: "used" });
}

export async function requestViaCard(m: Msg, onProgress: OnProgress): Promise<void> {
  const card = m.kind === "card" ? parseCard(m.data) : null;
  if (!card || m.seq <= 0) throw new ApiError(0, "bad_request");
  const who = await api().get<{ handle?: string; deleted?: boolean }>(`/users/${encodeURIComponent(card.subjectId)}`);
  // A subject whose account is gone has no handle to ask for; the card is as good as dead.
  if (who.deleted || typeof who.handle !== "string" || !who.handle) throw new ApiError(404, "not_found", { reason: "handle" });
  const solution = await pow("contact", canonicalHandle(who.handle), onProgress);
  onProgress({ step: "server" });
  try {
    await api().post("/contacts/request", { toHandle: who.handle, pow: solution, cardId: card.cardId });
  } catch (e) {
    cardRefused(m, e);
    throw e;
  }
  const conv = useChat.getState().official;
  if (conv) updateOfficial(conv, m.seq, "card", { ...m.data, state: "used" });
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
  let convId: string;
  try {
    convId = (await api().post<{ convId: string }>("/contacts/accept", { requestId, kx })).convId;
  } catch (e) {
    staleSwitches(e);
    throw e;
  }
  await saveContactKey(r.from.userId, r.from.handle, convId, key);
  await refreshContacts();
}

export async function declineRequest(requestId: string): Promise<void> {
  await api().post("/contacts/decline", { requestId });
  await refreshContacts();
}

export async function removeContact(userId: string): Promise<void> {
  await api().post("/contacts/remove", { userId });
  forgetContact(userId);
  // The server has already marked both people's saved copies deleted; this call only makes sure of it and drops the remembered version.
  await deleteRecord(`contact:${userId}`).catch(() => {});
  await refreshContacts();
}

/**
 * Destroys what this device holds of the chat with a contact who was removed (by this person or by the other one): the key is zeroed,
 * what was loaded of the chat and the favourites made from it are dropped. The saved copy of the key in the vault is the server's to
 * delete (it does so for both people when a contact is removed); a new chat starts from nothing, so it is not touched here.
 */
function forgetContact(userId: string): void {
  const st = useChat.getState();
  const convId = s.contactKeys.get(userId)?.convId || st.contacts.find((c) => c.userId === userId)?.convId || "";
  s.contactKeys.get(userId)?.key.fill(0);
  s.contactKeys.delete(userId);
  s.versions.delete(`contact:${userId}`);
  if (!convId) return;
  dropCached(convId);
  s.sentRead.delete(convId);
  s.tombs.delete(convId);
  const messages = { ...useChat.getState().messages };
  delete messages[convId]; // even a message still being sent
  patch({ messages, favorites: useChat.getState().favorites.filter((f) => f.conv !== convId) });
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

/** What is left of a deleted message: who and when, nothing else. It is told apart by its sequence number. */
const marker = (m: Pick<Msg, "seq" | "senderId" | "role" | "time" | "mine">): Msg => ({
  id: `deleted:${m.seq}`,
  seq: m.seq,
  senderId: m.senderId,
  role: m.role,
  time: m.time,
  mine: m.mine,
  payload: null,
  deleted: true,
  status: "sent",
});

async function toMsg(w: WireMessage, mine: boolean): Promise<Msg> {
  if (w.deleted || s.tombs.get(w.conv)?.has(w.seq)) return marker({ seq: w.seq, senderId: w.senderId, role: w.role, time: w.serverTime, mine });
  // An official message is plain and has no key, no epoch and no client id: it is never opened, only shown.
  if (typeof w.kind === "string") {
    return { id: `official:${w.seq}`, seq: w.seq, senderId: w.senderId, role: w.role, time: w.serverTime, mine: false, payload: null, kind: w.kind, data: isRecord(w.data) ? w.data : {}, status: "sent" };
  }
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

/**
 * Whether this chat is on screen: the contacts part is showing, this chat is open in it and the page is visible. A window beside another one
 * still shows it, so the unread badge does not count messages that arrive meanwhile.
 */
export function isShowing(conv: string | null): boolean {
  if (!conv || document.hidden) return false;
  const st = useChat.getState();
  return st.section === "contacts" && st.activeConv === conv;
}

/**
 * Whether a person is reading this chat right now: it is on screen, the window has focus and the privacy cover is not up. Only then may a read
 * receipt go out; a chat that is merely visible (window without focus) sends none until focus returns.
 */
export function isLooking(conv: string | null): boolean {
  return isShowing(conv) && document.hasFocus() && !document.documentElement.hasAttribute("data-covered");
}

/** Returns true when the message was not in the list yet. */
function addMessage(conv: string, msg: Msg): boolean {
  const st = useChat.getState();
  const list = st.messages[conv] ?? [];
  const i = list.findIndex((m) => m.id === msg.id && m.senderId === msg.senderId);
  const next = i >= 0 ? list.map((m, j) => (j === i ? msg : m)) : [...list, msg];
  next.sort((a, b) => (a.seq || Infinity) - (b.seq || Infinity) || a.time - b.time);
  patch({ messages: { ...st.messages, [conv]: next } });
  noteActive(conv, msg.time);
  // On screen means no badge (isShowing); a read receipt additionally needs focus (markRead). Anything else leaves it unread (and rings).
  if (i < 0 && !msg.mine && !isShowing(conv)) {
    patch({ unread: { ...useChat.getState().unread, [conv]: (st.unread[conv] ?? 0) + 1 } });
    // "@name " in a group message to me turns that group's badge red.
    const me = st.me;
    if (me && msg.payload?.k === "text" && !st.contacts.some((c) => c.convId === conv) && mentionsHandle(msg.payload.text, me.handle)) {
      patch({ mentions: { ...useChat.getState().mentions, [conv]: true } });
    }
    notifyIncoming(conv);
  }
  if (i < 0 && !msg.mine) markRead(conv);
  // A chat that is not open keeps only its newest messages.
  if (useChat.getState().activeConv !== conv) trimConversation(conv);
  return i < 0;
}

/** Remembers the newest message time of a conversation (the contact list is ordered by it). */
function noteActive(conv: string, time: number): void {
  const cur = useChat.getState().lastActive;
  if ((cur[conv] ?? 0) < time) patch({ lastActive: { ...cur, [conv]: time } });
}

/**
 * What the server counts as unread: messages other people wrote after my read position that have not expired or been deleted (never my own; at
 * most 100, shown as "99+"). One request covers every conversation. The server's number replaces the local one, so a deletion lowers the badge.
 */
async function loadUnread(): Promise<void> {
  const started = Date.now();
  const r = await api().get<{ conversations: { conv: string; kind?: string; unread?: number }[] }>("/conversations");
  const official = r.conversations.find((c) => c.kind === "official")?.conv;
  if (official && useChat.getState().official !== official) patch({ official });
  const st = useChat.getState();
  const looking = isShowing(st.activeConv) ? st.activeConv : null;
  const unread = { ...st.unread };
  const mentions = { ...st.mentions };
  for (const c of r.conversations) {
    // A server that does not count (older version) leaves the badge as it is rather than a guess.
    if (typeof c.unread !== "number") continue;
    // A read position sent after this request began is not in its answer: the number is stale, the local one (already lowered) stands.
    if ((s.readAt.get(c.conv) ?? 0) >= started && c.unread > (unread[c.conv] ?? 0)) continue;
    unread[c.conv] = c.conv === looking ? 0 : c.unread;
    if (unread[c.conv] === 0) mentions[c.conv] = false;
  }
  patch({ unread, mentions });
}

/** A page of older history: small, so a chat costs the server little; more come as the reader scrolls up. */
const PAGE = 20;
/** A chat keeps at most this many of its newest messages once it is left (and while it is not the open one). */
export const CACHE_MAX = 50;
interface HistoryPage {
  messages: WireMessage[];
  lastSeq: number;
  hasMore: boolean;
  peerRead?: number;
}

function wipeVoiceId(id: string): void {
  stopVoiceIf(id);
  s.voice.get(id)?.fill(0);
  s.voice.delete(id);
}
const wipeVoice = (m: Msg): void => {
  if (m.payload?.k === "voice" && m.payload.voice.id) wipeVoiceId(m.payload.voice.id);
};
const favoriteIdOf = (conv: string, m: Msg): string => `${conv}.${m.id}`.slice(0, 70);

/**
 * Removes the favourites whose message was deleted, at once on screen and then on the server in one request (the server takes up to 50 ids).
 * A failure is kept and tried again with the next deletion or reconnect; nothing is kept in the browser.
 */
async function dropFavorites(ids: ReadonlySet<string>): Promise<void> {
  const st = useChat.getState();
  const gone = st.favorites.filter((f) => ids.has(f.id));
  if (gone.length > 0) patch({ favorites: st.favorites.filter((f) => !ids.has(f.id)) });
  for (const f of gone) s.favRetry.add(`fav:${f.gen}:${f.id}`);
  await flushFavorites();
}

async function flushFavorites(): Promise<void> {
  const all = [...s.favRetry];
  for (let i = 0; i < all.length; i += 50) {
    const chunk = all.slice(i, i + 50);
    try {
      await api().post("/favorites/delete", { ids: chunk });
    } catch {
      return;
    }
    for (const id of chunk) {
      s.favRetry.delete(id);
      s.versions.delete(id);
    }
  }
  if (all.length > 0) void refreshUsage();
}

/**
 * Puts `incoming` in place of the cached messages that `keep` does not keep. Nothing is appended: a message that was cached and is gone from the
 * answer (deleted, expired) is gone from the cache too. A message that is deleted now but was readable in the cache loses its recording and favourite.
 * Does not touch unread counts, chimes or notifications: those belong to messages that arrive, not to messages that are read again.
 */
function replaceRange(conv: string, incoming: Msg[], keep: (m: Msg) => boolean): void {
  const st = useChat.getState();
  const cur = st.messages[conv] ?? [];
  const tomb = s.tombs.get(conv);
  const favs = new Set<string>();
  const fresh = incoming.map((m) => (!m.deleted && m.seq > 0 && tomb?.has(m.seq) ? marker(m) : m));
  const bySeq = new Map(fresh.filter((m) => m.seq > 0).map((m) => [m.seq, m]));
  const seen = new Set(fresh.map((m) => `${m.senderId}.${m.id}`));
  const kept: Msg[] = [];
  for (const m of cur) {
    const now = m.seq > 0 ? bySeq.get(m.seq) : undefined;
    if (keep(m) && !now && !seen.has(`${m.senderId}.${m.id}`)) {
      kept.push(m);
      continue;
    }
    if (!m.deleted && (now?.deleted || tomb?.has(m.seq))) favs.add(favoriteIdOf(conv, m));
    if (!now || now.deleted) wipeVoice(m);
  }
  const next = [...kept, ...fresh].sort((a, b) => (a.seq || Infinity) - (b.seq || Infinity) || a.time - b.time);
  patch({ messages: { ...st.messages, [conv]: next } });
  const newest = fresh.reduce((n, m) => Math.max(n, m.time), 0);
  if (newest > 0) noteActive(conv, newest);
  if (favs.size > 0) void dropFavorites(favs);
}

/** Cuts a chat down to its newest messages; what was cut is still on the server, so "load earlier" is offered again. */
function trimConversation(conv: string): void {
  const st = useChat.getState();
  const cur = st.messages[conv];
  if (!cur) return;
  const seqs = cur.filter((m) => m.seq > 0).map((m) => m.seq).sort((a, b) => b - a);
  if (seqs.length <= CACHE_MAX) return;
  const cutoff = seqs[CACHE_MAX - 1];
  const next = cur.filter((m) => m.seq === 0 || m.seq >= cutoff);
  for (const m of cur) if (m.seq > 0 && m.seq < cutoff) wipeVoice(m);
  patch({ messages: { ...st.messages, [conv]: next }, olderMore: { ...st.olderMore, [conv]: true } });
}

/** Forgets everything loaded for a chat except what is still being sent; the next time it is opened it loads from the server again. */
function dropCached(conv: string): void {
  const st = useChat.getState();
  s.loadGen.set(conv, (s.loadGen.get(conv) ?? 0) + 1);
  s.lastSeq.delete(conv);
  const cur = st.messages[conv];
  if (!cur) return;
  for (const m of cur) if (m.seq > 0) wipeVoice(m);
  const pending = cur.filter((m) => m.seq === 0);
  const messages = { ...st.messages };
  if (pending.length > 0) messages[conv] = pending;
  else delete messages[conv];
  const olderMore = { ...st.olderMore };
  delete olderMore[conv];
  patch({ messages, olderMore });
}

/**
 * Reads the newest page of a chat and makes it the whole cache (older pages that were loaded go). Called when the chat is opened, after the
 * socket reconnects, and when a gap in the sequence shows that something was missed. A slower, older answer never overwrites a newer one.
 */
export async function loadHistory(conv: string): Promise<void> {
  const token = s.api?.token ?? null;
  const myId = me().userId;
  const gen = (s.loadGen.get(conv) ?? 0) + 1;
  s.loadGen.set(conv, gen);
  const r = await api().get<HistoryPage>(`/messages?conv=${encodeURIComponent(conv)}&limit=${CACHE_MAX}`);
  const incoming = await Promise.all(r.messages.map((w) => toMsg({ ...w, conv }, w.senderId === myId)));
  if (!token || s.api?.token !== token || s.loadGen.get(conv) !== gen) return;
  replaceRange(conv, incoming, (m) => m.seq === 0 || m.seq > r.lastSeq);
  // A declined request that was missed (offline, another device): the official conversation says so, and the list of requests is read again.
  if (incoming.some((m) => m.kind === "contact_declined")) void refreshContacts().catch(() => {});
  const st = useChat.getState();
  patch({
    olderMore: { ...st.olderMore, [conv]: r.hasMore },
    ...(r.peerRead !== undefined ? { reads: { ...st.reads, [conv]: Math.max(st.reads[conv] ?? 0, r.peerRead) } } : {}),
  });
  s.lastSeq.set(conv, Math.max(r.lastSeq, ...(useChat.getState().messages[conv] ?? []).map((m) => m.seq)));
}

/** Pages back: the newest messages older than the oldest one on screen. What the cache holds for that stretch is replaced by the answer. */
export async function loadOlder(conv: string): Promise<void> {
  const token = s.api?.token ?? null;
  const myId = me().userId;
  const oldest = (useChat.getState().messages[conv] ?? []).reduce((n, m) => (m.seq > 0 ? Math.min(n, m.seq) : n), Infinity);
  if (!Number.isFinite(oldest)) return;
  const gen = s.loadGen.get(conv) ?? 0;
  const r = await api().get<HistoryPage>(`/messages?conv=${encodeURIComponent(conv)}&beforeSeq=${oldest}&limit=${PAGE}`);
  const incoming = await Promise.all(r.messages.map((w) => toMsg({ ...w, conv }, w.senderId === myId)));
  // The chat was reloaded or dropped meanwhile (reconnect, sign-out): these older messages no longer belong to what is cached.
  if (!token || s.api?.token !== token || (s.loadGen.get(conv) ?? 0) !== gen) return;
  const lo = incoming.reduce((n, m) => Math.min(n, m.seq), oldest);
  replaceRange(conv, incoming, (m) => m.seq === 0 || m.seq < lo || m.seq >= oldest);
  patch({ olderMore: { ...useChat.getState().olderMore, [conv]: r.hasMore } });
}

/** After the socket is up: whatever it missed (deletions above all) is read again. A reconnect is treated like opening the chat again. */
async function resync(reconnected: boolean): Promise<void> {
  const active = useChat.getState().activeConv;
  if (reconnected) {
    // A read mark sent over the old connection may never have arrived: the open chat sends its position again.
    s.sentRead.clear();
    for (const conv of Object.keys(useChat.getState().messages)) if (conv !== active) dropCached(conv);
    void flushFavorites();
  }
  if (active) {
    await loadHistory(active).catch(() => {});
    markRead(active);
  }
  if (reconnected) {
    await loadUnread().catch(() => {});
    // A removal that happened while the socket was down arrives only as an official message that was never pushed here.
    await refreshContacts().catch(() => {});
  }
}

export async function openConversation(conv: string | null): Promise<void> {
  const st = useChat.getState();
  const left = st.activeConv;
  patch({ activeConv: conv });
  // Opening a chat in a page nobody sees (another tab) does not read it: the badge stays until they come back (resumeView).
  if (conv && isShowing(conv)) {
    const cur = useChat.getState();
    patch({ unread: { ...cur.unread, [conv]: 0 }, mentions: { ...cur.mentions, [conv]: false } });
  }
  // Leaving a chat drops everything older than its newest messages.
  if (left && left !== conv) trimConversation(left);
  if (conv) await loadHistory(conv).catch(() => {});
  markRead(conv);
}

/** The `updated` push: an official message changed (a card was used or revoked). The cached copy is replaced; one that is not cached loads fresh when the chat opens. */
function updateOfficial(conv: string, seq: number, kind: string, data: Record<string, unknown>): void {
  const st = useChat.getState();
  const cur = st.messages[conv];
  if (!cur?.some((m) => m.seq === seq && !m.deleted)) return;
  patch({ messages: { ...st.messages, [conv]: cur.map((m) => (m.seq === seq && !m.deleted ? { ...m, kind, data } : m)) } });
}

/** An official message says a contact is gone (removed me, or deleted their account): what this device holds of that chat is destroyed, and the list is read again. */
async function onContactRemoved(data: Record<string, unknown> | undefined): Promise<void> {
  const removed = parseRemoved(data);
  if (!removed) return;
  forgetContact(removed.userId);
  await refreshContacts().catch(() => {});
}

// ---------- deleting messages ----------
/**
 * Applies a deletion to the cache: the messages become bare markers, and everything made from their text goes with them (a recording kept in
 * memory, a favourite). Safe to repeat. Works from sequence numbers, so it also serves the push, which names nothing else.
 */
function forgetDeleted(conv: string, seqs: readonly number[]): void {
  let tomb = s.tombs.get(conv);
  if (!tomb) s.tombs.set(conv, (tomb = new Set()));
  for (const n of seqs) tomb.add(n);
  const st = useChat.getState();
  const cur = st.messages[conv];
  if (!cur) return;
  const favs = new Set<string>();
  const next = cur.map((m) => {
    if (m.deleted || m.seq <= 0 || !tomb.has(m.seq)) return m;
    wipeVoice(m);
    favs.add(favoriteIdOf(conv, m));
    return marker(m);
  });
  if (favs.size === 0) return;
  patch({ messages: { ...st.messages, [conv]: next } });
  void dropFavorites(favs);
}

export interface DeleteOutcome {
  /** The numbers the server deleted: the screen follows these. */
  deleted: number[];
  /** Set when a request failed; the ones before it are done. */
  error: ApiError | null;
}

/** Deletes my own messages for everyone in the chat, in as many requests as the server's limits need (50 messages, 20 recordings each). */
export async function deleteMessages(conv: string, seqs: readonly number[]): Promise<DeleteOutcome> {
  const bySeq = new Map((useChat.getState().messages[conv] ?? []).map((m) => [m.seq, m]));
  const picked = seqs.map((n) => bySeq.get(n)).filter((m): m is Msg => m !== undefined && canDelete(m));
  const deleted: number[] = [];
  for (const b of planDeleteBatches(picked)) {
    try {
      const r = await api().post<{ deleted: number[]; voiceDeleted: string[] }>("/messages/delete", { conv, seqs: b.seqs, ...(b.voiceIds.length > 0 ? { voiceIds: b.voiceIds } : {}) });
      forgetDeleted(conv, r.deleted);
      for (const id of r.voiceDeleted) wipeVoiceId(id);
      deleted.push(...r.deleted);
    } catch (e) {
      return { deleted, error: e instanceof ApiError ? e : new ApiError(0, "internal") };
    }
  }
  return { deleted, error: null };
}

/** How many of these messages I have saved as favourites (they go with the messages). */
export function favoritesAmong(conv: string, msgs: readonly Msg[]): number {
  const ids = new Set(msgs.map((m) => favoriteIdOf(conv, m)));
  return useChat.getState().favorites.filter((f) => ids.has(f.id)).length;
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
  if (!st.activeConv || !isShowing(st.activeConv)) return;
  patch({ unread: { ...st.unread, [st.activeConv]: 0 }, mentions: { ...st.mentions, [st.activeConv]: false } });
  markRead(st.activeConv);
}

/**
 * Tells the server that I have read everything up to the latest message, while I am looking at it. In a 1:1 chat the server passes this on
 * to the other person; in a group it only keeps my own position (so the unread count is right after the next sign-in) and shows it to nobody.
 */
export function markRead(conv: string | null): void {
  if (!conv || !s.api?.token || !isLooking(conv)) return;
  const st = useChat.getState();
  const upTo = (st.messages[conv] ?? []).reduce((n, m) => (m.mine ? n : Math.max(n, m.seq)), 0);
  // What is on screen and read counts as read here at once, whatever the server answers later; the tab title and the list use this same number.
  if ((st.unread[conv] ?? 0) > 0 || st.mentions[conv]) patch({ unread: { ...st.unread, [conv]: 0 }, mentions: { ...st.mentions, [conv]: false } });
  if (upTo <= (s.sentRead.get(conv) ?? 0)) return;
  s.sentRead.set(conv, upTo);
  s.readAt.set(conv, Date.now());
  // The official conversation always goes over HTTPS, where a refusal is seen and the mark is tried again next time; a socket frame gives no answer.
  if (conv !== st.official && s.ws?.send({ t: "read", conv, upTo })) return;
  void s.api.post("/conversations/read", { conv, upTo }).catch(() => {
    if (s.sentRead.get(conv) === upTo) s.sentRead.delete(conv);
  });
}

export async function sendText(conv: string, text: string): Promise<void> {
  const clean = text.trim();
  if (!clean || Array.from(clean).length > MESSAGE_MAX_CHARS || conv === useChat.getState().official) return;
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
  if (conv === useChat.getState().official) throw new ApiError(403, "forbidden", { reason: "official_readonly" });
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
    // The storage takes the raw ciphertext bytes, not their base64 text; the server is told how many to expect and signs exactly that.
    const raw = fromB64(sealed.ct);
    if (!fitsServer(raw.length)) throw new ApiError(413, "too_large");
    const up = await api().post<{ voiceId: string; upload: UploadTarget }>("/voice", { conv, size: raw.length });
    await uploadBytes(up.upload, raw);
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
    if (e instanceof ApiError && e.status === 403 && e.code === "forbidden" && e.extra.reason !== "official_readonly") patch({ voiceOff: true });
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
      // A short-lived address for the raw ciphertext; 404 from either step (retention, wipe, an upload that never finished) is the same: gone.
      const { download } = await api().get<{ download: { url: string; expiresAt: number } }>(`/voice/${encodeURIComponent(voiceId)}`);
      ct = toB64(await downloadBytes(download.url));
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

export async function onFrame(f: Frame): Promise<void> {
  const myId = useChat.getState().me?.userId;
  if (!myId) return;
  if (f.t === "message") {
    const w = f as unknown as WireMessage;
    // Deleted before this push was handled (the delete push can overtake it): nothing to show, nothing to ring for.
    if (w.deleted || s.tombs.get(w.conv)?.has(w.seq)) return;
    const official = typeof w.kind === "string";
    if (official && useChat.getState().official !== w.conv) patch({ official: w.conv });
    if (!official && !s.epochs?.labels.has(w.epoch)) await refreshEpochs().catch(() => {});
    if (!official && !keyFor(w.conv, w.gen) && s.groupKeys.has(w.conv)) await refreshGroups().catch(() => {});
    // A jump in the sequence means something was missed (the socket was down): load what is between.
    const known = s.lastSeq.get(w.conv);
    // Counted before the gap is filled: a gap load may bring this very message in, and it still has to be acted on once.
    const unseen = !(useChat.getState().messages[w.conv] ?? []).some((m) => m.seq === w.seq);
    if (known !== undefined && w.seq > known + 1) await loadHistory(w.conv).catch(() => {});
    const isNew = addMessage(w.conv, await toMsg(w, w.senderId === myId));
    // Only a chat that has been loaded keeps a position; for the others the first open loads the newest page itself.
    if (s.lastSeq.has(w.conv)) s.lastSeq.set(w.conv, Math.max(s.lastSeq.get(w.conv) ?? 0, w.seq));
    if (isNew && w.senderId !== myId && useChat.getState().sound) playChime();
    if (unseen && w.kind === "contact_removed") await onContactRemoved(w.data);
    // The request I made was declined: it is no longer waiting.
    if (unseen && w.kind === "contact_declined") await refreshContacts().catch(() => {});
  } else if (f.t === "updated") {
    if (typeof f.kind === "string" && isRecord(f.data) && Number.isInteger(f.seq)) {
      const conv = String(f.conv);
      updateOfficial(conv, Number(f.seq), f.kind, f.data);
      // An open, visible official conversation stays read through a change too.
      if (isShowing(conv)) {
        s.sentRead.delete(conv);
        markRead(conv);
      }
    }
  } else if (f.t === "deleted") {
    // Best effort on the server's side: this frame may never come, which is why the cache is read again on every open and reconnect.
    const conv = String(f.conv);
    const seqs = Array.isArray(f.seqs) ? f.seqs.filter((n): n is number => Number.isInteger(n) && n > 0) : [];
    if (seqs.length > 0) {
      forgetDeleted(conv, seqs);
      void loadUnread().catch(() => {});
    }
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
    // (A removed contact is no longer a notice: it arrives as a `contact_removed` official message.)
    if (kind === "contact_request" || kind === "contact_accepted") await refreshContacts().catch(() => {});
    else if (kind === "account") await refreshMe().catch(() => {});
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
type WireGroup = Omit<Group, "keys"> & { lastAt?: number };

export async function refreshGroups(): Promise<void> {
  const list = (await api().get<{ groups: WireGroup[] }>("/groups")).groups;
  const groups: Group[] = [];
  for (const g of list) {
    noteActive(g.id, g.lastAt ?? 0);
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
