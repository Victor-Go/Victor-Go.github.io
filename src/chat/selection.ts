import type { Msg } from "./store";

/** The server takes at most this many messages, and at most this many recordings, in one delete request. */
export const DELETE_MAX = 50;
export const DELETE_MAX_VOICE = 20;

/** Only my own messages that the server has accepted can be deleted (never one still sending or failed, never one already gone). */
export const canDelete = (m: Pick<Msg, "mine" | "seq" | "deleted" | "status">): boolean => m.mine && m.seq > 0 && !m.deleted && m.status === "sent";

export interface DeleteBatch {
  seqs: number[];
  voiceIds: string[];
}

/** Splits a selection into requests that respect both limits. The server refuses a request over either one. */
export function planDeleteBatches(msgs: readonly Msg[]): DeleteBatch[] {
  const batches: DeleteBatch[] = [];
  let cur: DeleteBatch = { seqs: [], voiceIds: [] };
  for (const m of [...msgs].sort((a, b) => a.seq - b.seq)) {
    const voice = m.payload?.k === "voice" && m.payload.voice.id ? m.payload.voice.id : null;
    if (cur.seqs.length >= DELETE_MAX || (voice !== null && cur.voiceIds.length >= DELETE_MAX_VOICE)) {
      batches.push(cur);
      cur = { seqs: [], voiceIds: [] };
    }
    cur.seqs.push(m.seq);
    if (voice !== null) cur.voiceIds.push(voice);
  }
  if (cur.seqs.length > 0) batches.push(cur);
  return batches;
}
