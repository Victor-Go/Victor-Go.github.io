/** How long the unlock target must be held without a break, from empty to full. */
export const HOLD_MS = 3000;
/** About how long the ring takes to settle on a new value (it is 99 % of the way there after this): letting go empties it in a tenth of a second. */
export const SETTLE_MS = 100;

/** `held` is the real progress of the press; `shown` is what the ring draws, which eases towards it. */
export interface HoldState {
  held: number;
  shown: number;
}

export const EMPTY: HoldState = { held: 0, shown: 0 };

/**
 * One step of the hold-to-unlock ring, `dtMs` after the last. Two numbers, both ratios from 0 to 1:
 *
 * - `held` is the press itself: it grows at 1 / HOLD_MS per millisecond while the finger is down and **drops to 0 the moment it is let go**, so only
 *   an unbroken hold of HOLD_MS unlocks, and holding in several short goes never adds up.
 * - `shown` is the ring on the screen. It eases (a lerp) towards `held` every step, with a time constant such that it has covered 99 % of the distance
 *   after SETTLE_MS. So letting go empties the ring in about a tenth of a second, whatever was in it, and pressing again while it is still emptying
 *   needs no waiting: `held` starts from 0 at once and the ring simply follows it.
 *
 * Pure, so the screen and the tests use the same rule.
 */
export function stepHold(s: HoldState, dtMs: number, holding: boolean): HoldState {
  const dt = Math.max(0, dtMs);
  const held = holding ? Math.min(1, s.held + dt / HOLD_MS) : 0;
  const k = 1 - Math.exp((-dt * Math.log(100)) / SETTLE_MS); // frame-rate independent: the same however often it is called
  let shown = s.shown + (held - s.shown) * k;
  if (Math.abs(held - shown) < 0.002) shown = held; // close enough: land on it, so a finished ring really is at rest
  return { held, shown };
}
