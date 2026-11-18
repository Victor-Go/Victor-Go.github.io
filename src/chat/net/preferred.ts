/**
 * Which address of the WebSocket pool the connectivity check found working (memory only, nothing in storage). The live connection starts
 * with it, so it does not have to find out again that the first address of the pool is blocked. 0 (the first) until a check has answered.
 */
let wsIndex = 0;

export function setPreferredWs(index: number): void {
  wsIndex = index;
}

export function getPreferredWs(): number {
  return wsIndex;
}
