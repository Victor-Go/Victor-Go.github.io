/** Official messages (protocol 2): plain system messages in the person's own read-only conversation. Their `data` comes off the wire, so it is checked before use. */

export const OFFICIAL_SENDER = "official";

export type RemovedReason = "removed" | "self_deleted" | "admin_deleted";

export interface Removed {
  userId: string;
  handle: string;
  reason: RemovedReason;
}

export interface Card {
  cardId: string;
  subjectId: string;
  /** The handle when the card was made; the subject may have renamed since (tapping asks for the current one). */
  subjectHandle: string;
  expiresAt: number;
  state: "active" | "used" | "revoked";
  /** Why a revoked card is dead (`revoked_by_admin`). */
  reason: string;
}

/** What a card shows as: its state, or "expired" once its time has passed (judged with the server's clock). */
export type CardStatus = "active" | "used" | "revoked" | "expired";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown, max = 200): string | null => (typeof v === "string" && v.length <= max ? v : null);

export function parseRemoved(data: unknown): Removed | null {
  if (!isRecord(data)) return null;
  const userId = text(data.userId);
  const handle = text(data.handle) ?? "";
  if (!userId) return null;
  const reason: RemovedReason = data.reason === "self_deleted" || data.reason === "admin_deleted" ? data.reason : "removed";
  return { userId, handle, reason };
}

export interface Declined {
  userId: string;
  handle: string;
}

/** `contact_declined`: sent to the person whose contact request was declined (data: who declined). */
export function parseDeclined(data: unknown): Declined | null {
  if (!isRecord(data)) return null;
  const userId = text(data.userId);
  return userId ? { userId, handle: text(data.handle) ?? "" } : null;
}

export function parseCard(data: unknown): Card | null {
  if (!isRecord(data)) return null;
  const cardId = text(data.cardId);
  const subjectId = text(data.subjectId);
  const subjectHandle = text(data.subjectHandle) ?? "";
  const expiresAt = typeof data.expiresAt === "number" && Number.isFinite(data.expiresAt) ? data.expiresAt : null;
  if (!cardId || !subjectId || expiresAt === null) return null;
  const state = data.state === "used" || data.state === "revoked" ? data.state : "active";
  return { cardId, subjectId, subjectHandle, expiresAt, state, reason: text(data.reason) ?? "" };
}

/** `skew` is the server's clock minus this device's (ms). The server decides in the end; this only decides what to show. */
export function cardStatus(card: Card, now: number, skew: number): CardStatus {
  if (card.state !== "active") return card.state;
  return now + skew > card.expiresAt ? "expired" : "active";
}
