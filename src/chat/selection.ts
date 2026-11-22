import type { Msg } from "./store";

/** The server takes at most this many messages, and at most this many recordings, in one delete request. */
export const DELETE_MAX = 50;
export const DELETE_MAX_VOICE = 20;

/**
 * Only my own messages that the server has accepted can be deleted (never one still sending or failed, never one already gone).
 * Any message of my official conversation can be deleted: it is all addressed to me. In a group the owner and an administrator with
 * `groups.delete_messages` (`moderator`) may delete anybody's.
 */
export const canDelete = (m: Pick<Msg, "mine" | "seq" | "deleted" | "status"> & { kind?: string }, moderator = false): boolean =>
  (m.mine || m.kind !== undefined || moderator) && m.seq > 0 && !m.deleted && m.status === "sent";

/** Whether the person moderates this group: its owner, or an administrator whose permissions include `groups.delete_messages`. */
export const moderatesGroup = (group: { ownerId: string } | undefined, meId: string, permissions: readonly string[]): boolean =>
  !!group && (group.ownerId === meId || permissions.includes("groups.delete_messages"));

export interface DeleteBatch {
  seqs: number[];
  fileIds: string[];
}

/** Splits a selection into requests that respect both limits. The server refuses a request over either one. */
export function planDeleteBatches(msgs: readonly Msg[]): DeleteBatch[] {
  const batches: DeleteBatch[] = [];
  let cur: DeleteBatch = { seqs: [], fileIds: [] };
  for (const m of [...msgs].sort((a, b) => a.seq - b.seq)) {
    // Recordings and pictures both are files on the server and are removed with `fileIds`.
    const voice = m.payload?.k === "voice" && m.payload.voice.id ? m.payload.voice.id : m.payload?.k === "image" && m.payload.image.id ? m.payload.image.id : null;
    if (cur.seqs.length >= DELETE_MAX || (voice !== null && cur.fileIds.length >= DELETE_MAX_VOICE)) {
      batches.push(cur);
      cur = { seqs: [], fileIds: [] };
    }
    cur.seqs.push(m.seq);
    if (voice !== null) cur.fileIds.push(voice);
  }
  if (cur.seqs.length > 0) batches.push(cur);
  return batches;
}
