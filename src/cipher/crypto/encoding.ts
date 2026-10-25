export type Kind = "public" | "private" | "kx" | "pw";

/** Readable prefixes so a public key, private key and either ciphertext can't be mixed up. */
export const PREFIX: Record<Kind, string> = {
  public: "cipher1-pub.",
  private: "cipher1-priv.",
  kx: "cipher1-kx.",
  pw: "cipher1-pw.",
};

export const DECRYPT_FAILED = "解密失败(密码/密钥错误或数据被篡改)";

export type ErrorCode = "format" | "wrong-kind" | "decrypt" | "empty-password" | "kdf" | "file-format";

/** Errors carry a code only; they never include any part of the user's input. */
export class CipherError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message?: string) {
    super(message ?? (code === "decrypt" ? DECRYPT_FAILED : code));
    this.name = "CipherError";
    this.code = code;
  }
}

const B64URL = /^[A-Za-z0-9_-]*$/;

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  if (!B64URL.test(text) || text.length % 4 === 1) throw new CipherError("format");
  const std = text.replace(/-/g, "+").replace(/_/g, "/");
  let bin: string;
  try {
    bin = atob(std + "=".repeat((4 - (std.length % 4)) % 4));
  } catch {
    throw new CipherError("format");
  }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encode(kind: Kind, bytes: Uint8Array): string {
  return PREFIX[kind] + toBase64Url(bytes);
}

/** Removes all whitespace so wrapped or indented pastes still work. */
function clean(text: string): string {
  return text.replace(/\s+/g, "");
}

export function detectKind(text: string): Kind | null {
  const t = clean(text);
  for (const kind of Object.keys(PREFIX) as Kind[]) {
    if (t.startsWith(PREFIX[kind])) return kind;
  }
  return null;
}

export function decode(kind: Kind, text: string): Uint8Array {
  const t = clean(text);
  if (!t.startsWith(PREFIX[kind])) {
    throw new CipherError(detectKind(t) ? "wrong-kind" : "format");
  }
  return fromBase64Url(t.slice(PREFIX[kind].length));
}
