import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8 } from "../../cipher/crypto/aead";
import { fromB64 } from "./b64";
import { normalizePassword } from "../validation";

/**
 * Password authentication: OPAQUE (RFC 9807; ristretto255, SHA-512, 3DH) with Argon2id as the key-stretching function,
 * through `@serenity-kit/opaque` (Rust `opaque-ke` compiled to WASM, inlined in the bundle, so it is served from our own origin).
 * The server never sees the password. Contract: chat-server docs/opaque.md. This is the only module that knows how a password
 * becomes a credential or a key.
 */

/** The fixed server identity both sides put into the protocol (never a URL). */
export const SERVER_ID = "chat.victor-go";

/**
 * The library's `memory-constrained` Argon2id (3 iterations, 64 MiB, 4 lanes), the default and the server's assumption.
 * TODO: calibrate on a real phone before launch.
 */
export const KEY_STRETCHING = "memory-constrained" as const;

type Lib = typeof import("@serenity-kit/opaque");
type Client = Lib["client"];
type StartedRegistration = ReturnType<Client["startRegistration"]>;
type StartedLogin = ReturnType<Client["startLogin"]>;

let lib: Promise<Lib> | null = null;
/** Loads the WASM on first use (its own chunk) and waits until it is ready. */
const load = (): Promise<Lib> =>
  (lib ??= import("@serenity-kit/opaque").then(async (m) => {
    await m.ready;
    return m;
  }));

/** Lets the page paint the "deriving" step before the (synchronous, memory-hard) stretching blocks the thread. */
const paint = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

const identifiers = (userId: string) => ({ client: userId, server: SERVER_ID });

/** The 32-byte key that wraps the vault master key: derived from the OPAQUE export key, never used raw. */
export function kekFromExportKey(exportKey: string): Uint8Array {
  const raw = fromB64(exportKey.replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_"));
  try {
    return hkdf(sha256, raw, undefined, utf8("chat/opaque/kek/v1"), 32);
  } finally {
    raw.fill(0);
  }
}

/**
 * One password in flight. The normalised password lives only as long as this object; `wipe()` drops the library states.
 * (JavaScript strings cannot be overwritten, so the string is only released for garbage collection.)
 */
export class PasswordFlow {
  private password: string | null;
  private reg: StartedRegistration | null = null;
  private login: StartedLogin | null = null;

  constructor(password: string) {
    this.password = normalizePassword(password);
  }

  private pw(): string {
    if (this.password === null) throw new Error("password flow already wiped");
    return this.password;
  }

  async startRegistration(): Promise<string> {
    const { client } = await load();
    this.reg = client.startRegistration({ password: this.pw() });
    return this.reg.registrationRequest;
  }

  /** Needs the user id the server chose. Returns the record to send and the key that wraps the master key. */
  async finishRegistration(registrationResponse: string, userId: string): Promise<{ registrationRecord: string; kek: Uint8Array }> {
    const { client } = await load();
    if (!this.reg) throw new Error("registration not started");
    await paint();
    const r = client.finishRegistration({
      password: this.pw(),
      registrationResponse,
      clientRegistrationState: this.reg.clientRegistrationState,
      identifiers: identifiers(userId),
      keyStretching: KEY_STRETCHING,
    });
    this.reg = null;
    const kek = kekFromExportKey(r.exportKey);
    return { registrationRecord: r.registrationRecord, kek };
  }

  async startLogin(): Promise<string> {
    const { client } = await load();
    this.login = client.startLogin({ password: this.pw() });
    return this.login.startLoginRequest;
  }

  /** `null` when the password is wrong (the library cannot open the server's envelope): the caller must not call finish. */
  async finishLogin(loginResponse: string, userId: string): Promise<{ finishLoginRequest: string; kek: Uint8Array } | null> {
    const { client } = await load();
    if (!this.login) throw new Error("login not started");
    await paint();
    let r: ReturnType<Client["finishLogin"]>;
    try {
      r = client.finishLogin({
        password: this.pw(),
        loginResponse,
        clientLoginState: this.login.clientLoginState,
        identifiers: identifiers(userId),
        keyStretching: KEY_STRETCHING,
      });
    } catch {
      // A malformed answer is treated like a wrong password: nothing is sent on.
      r = undefined;
    }
    this.login = null;
    if (!r) return null;
    return { finishLoginRequest: r.finishLoginRequest, kek: kekFromExportKey(r.exportKey) };
  }

  wipe(): void {
    this.password = null;
    this.reg = null;
    this.login = null;
  }
}
