/** Registry of live secret buffers so a page wipe can zero them even mid-operation. */
const live = new Set<Uint8Array>();

export function track<T extends Uint8Array>(bytes: T): T {
  live.add(bytes);
  return bytes;
}

export function release(...buffers: Uint8Array[]): void {
  for (const b of buffers) {
    b.fill(0);
    live.delete(b);
  }
}

export function wipeTracked(): void {
  for (const b of live) b.fill(0);
  live.clear();
}

export function trackedCount(): number {
  return live.size;
}

/** Only source of randomness in this module tree. */
export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
}
