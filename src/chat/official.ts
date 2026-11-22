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

export type GroupDeletedReason = "owner" | "admin" | "owner_deleted";

export interface GroupDeleted {
  groupId: string;
  name: string;
  reason: GroupDeletedReason;
  /** Who dissolved it; missing when the AWS operator did (no account). */
  by: { userId: string; handle: string } | null;
}

/** `group_deleted`: sent to every member of a dissolved group except the one who dissolved it (the group is gone, so its name is in the message). */
export interface GroupOwnerTaken {
  groupId: string;
  name: string;
  by: { userId: string; handle: string } | null;
}

/** `group_owner_taken`: sent to the former owner of a group that an administrator took over without asking. */
export function parseGroupOwnerTaken(data: unknown): GroupOwnerTaken | null {
  if (!isRecord(data)) return null;
  const groupId = text(data.groupId);
  const name = text(data.name, 100);
  if (!groupId || name === null) return null;
  const by = isRecord(data.by) && text(data.by.userId) ? { userId: text(data.by.userId) as string, handle: text(data.by.handle) ?? "" } : null;
  return { groupId, name, by };
}

export function parseGroupDeleted(data: unknown): GroupDeleted | null {
  if (!isRecord(data)) return null;
  const groupId = text(data.groupId);
  const name = text(data.name, 100);
  if (!groupId || name === null) return null;
  const reason: GroupDeletedReason = data.reason === "admin" || data.reason === "owner_deleted" ? data.reason : "owner";
  const by = isRecord(data.by) && text(data.by.userId) ? { userId: text(data.by.userId) as string, handle: text(data.by.handle) ?? "" } : null;
  return { groupId, name, reason, by };
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
