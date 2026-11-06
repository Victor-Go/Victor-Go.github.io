export const HANDLE_MIN = 3;
export const HANDLE_MAX = 32;
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 256;
export const INVITE_MAX = 64;

/** Names nobody may register; compared in lower case. The server keeps its own copy of this list. */
const RESERVED = new Set(["admin", "administrator", "root", "support", "system", "chat", "official", "moderator", "owner", "null", "undefined"]);

/** Typed or pasted text becomes a handle candidate: no leading @, ASCII letters, digits, `_` and `-` only. */
export function sanitizeHandleInput(text: string): string {
  return text.replace(/^[@＠\s]+/, "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, HANDLE_MAX);
}

export type HandleProblem = "empty" | "short" | "long" | "chars" | "startDash" | "reserved";

/** `handle` is what the user typed after the @. Returns null when it is acceptable. */
export function checkHandle(handle: string): HandleProblem | null {
  if (handle.length === 0) return "empty";
  if (!/^[A-Za-z0-9_-]*$/.test(handle)) return "chars";
  if (handle.length < HANDLE_MIN) return "short";
  if (handle.length > HANDLE_MAX) return "long";
  if (handle.startsWith("-")) return "startDash";
  if (RESERVED.has(handle.toLowerCase())) return "reserved";
  return null;
}

/** Handles compare case-insensitively; the server stores this form. */
export const canonicalHandle = (handle: string): string => handle.toLowerCase();

/** Same text on every keyboard and OS: compatibility-normalised, never trimmed or case-folded. */
export const normalizePassword = (password: string): string => password.normalize("NFKC");

export type PasswordProblem = "length" | "upper" | "lower" | "digit" | "control" | "tooLong";

/** Every rule the password still breaks; empty when it is acceptable. */
export function checkPassword(password: string): PasswordProblem[] {
  const p = normalizePassword(password);
  const problems: PasswordProblem[] = [];
  const length = Array.from(p).length;
  if (length < PASSWORD_MIN) problems.push("length");
  if (length > PASSWORD_MAX) problems.push("tooLong");
  if (!/[A-Z]/.test(p)) problems.push("upper");
  if (!/[a-z]/.test(p)) problems.push("lower");
  if (!/[0-9]/.test(p)) problems.push("digit");
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(p)) problems.push("control");
  return problems;
}

export type Strength = "weak" | "fair" | "strong";

/** Bits are a rough upper bound (see cipher/crypto/strength.ts). 60+ bits is what resists offline guessing for decades. */
export const strengthOf = (bits: number): Strength => (bits < 40 ? "weak" : bits < 60 ? "fair" : "strong");

export const sanitizeInvite = (text: string): string => text.replace(/[^A-Za-z0-9_-]/g, "").slice(0, INVITE_MAX);
