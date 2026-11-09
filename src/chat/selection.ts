import type { Msg } from "./store";

/** The server takes at most this many messages, and at most this many recordings, in one delete request. */
export const DELETE_MAX = 50;
export const DELETE_MAX_VOICE = 20;

/**
 * Only my own messages that the server has accepted can be deleted (never one still sending or failed, never one already gone).
 * Any message of my official conversation can be deleted: it is all addressed to me.
 */
export const canDelete = (m: Pick<Msg, "mine" | "seq" | "deleted" | "status"> & { kind?: string }): boolean =>
  (m.mine || m.kind !== undefined) && m.seq > 0 && !m.deleted && m.status === "sent";

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
