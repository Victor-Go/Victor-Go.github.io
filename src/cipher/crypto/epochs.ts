/**
 * Rolling key epochs. Each epoch pairs a two-byte id (written into the ciphertext header) with a
 * constant mixed into key derivation. New ciphertext always uses `current`; dropping an epoch from
 * the table makes its ciphertext undecryptable here. The constants ship inside the public bundle,
 * so this retires old data on schedule; it is not a secret.
 */
export interface Epochs {
  /** Epoch written by new ciphertext. Never 0. */
  readonly current: number;
  /** id -> constant. Id 0 is the pre-epoch (v1) format and carries no constant. */
  readonly labels: ReadonlyMap<number, string>;
}

/** Ciphertext written before epochs existed. Readable only while the table lists id 0. */
export const LEGACY_EPOCH = 0;

const ID_RE = /^\d{1,5}$/;
/** Ids are written as an unsigned 16-bit integer. */
export const MAX_EPOCH_ID = 65535;
const LABEL_RE = /^[A-Za-z0-9_-]{1,64}$/;

function parseId(text: string, what: string): number {
  const id = ID_RE.test(text) ? Number(text) : NaN;
  if (!(id >= 0 && id <= MAX_EPOCH_ID)) throw new Error(`Invalid cipher epoch ${what}`);
  return id;
}

/**
 * `table` is a comma-separated list of `id:constant` entries (ids 1-65535), plus an optional bare `0`
 * to keep v1 ciphertext readable. Constants are letters, digits, `_` and `-`, at most 64 characters.
 * Throws on anything malformed; messages never include the constants.
 */
export function parseEpochs(table: string, current: string): Epochs {
  const labels = new Map<number, string>();
  for (const raw of table.split(",")) {
    const [idText, label, ...rest] = raw.trim().split(":");
    const id = parseId(idText, "id");
    if (labels.has(id) || rest.length > 0) throw new Error("Invalid cipher epoch table");
    if (id === LEGACY_EPOCH) {
      if (label !== undefined) throw new Error("Invalid cipher epoch table");
      labels.set(id, "");
    } else {
      if (label === undefined || !LABEL_RE.test(label)) throw new Error("Invalid cipher epoch table");
      labels.set(id, label);
    }
  }
  const cur = parseId(current.trim(), "current");
  if (cur === LEGACY_EPOCH || !labels.has(cur)) throw new Error("Invalid cipher epoch current");
  return { current: cur, labels };
}

/** Used when no table is configured (local dev and tests). Deployments set their own. */
export const DEFAULT_EPOCH_TABLE = "0,1:dev";
export const DEFAULT_EPOCH_CURRENT = "1";
