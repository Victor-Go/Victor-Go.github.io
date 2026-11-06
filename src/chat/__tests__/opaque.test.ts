// @vitest-environment node
import { describe, it, expect } from "vitest";
import * as lib from "@serenity-kit/opaque";
import { toB64 } from "../crypto/b64";
import { PasswordFlow, SERVER_ID, kekFromExportKey } from "../crypto/opaque";

/** Runs the real library (the WASM works in Node) against the library's own server half, with the identities of docs/opaque.md. */
await lib.ready;
const setup = lib.server.createSetup();
const userId = "user-id-1";
const ids = { client: userId, server: SERVER_ID };

async function register(password: string) {
  const flow = new PasswordFlow(password);
  const registrationRequest = await flow.startRegistration();
  const { registrationResponse } = lib.server.createRegistrationResponse({ serverSetup: setup, userIdentifier: userId, registrationRequest });
  const done = await flow.finishRegistration(registrationResponse, userId);
  flow.wipe();
  return done;
}

async function login(password: string, record: string) {
  const flow = new PasswordFlow(password);
  const startLoginRequest = await flow.startLogin();
  const s = lib.server.startLogin({ serverSetup: setup, registrationRecord: record, startLoginRequest, userIdentifier: userId, identifiers: ids });
  const done = await flow.finishLogin(s.loginResponse, userId);
  if (done) lib.server.finishLogin({ serverLoginState: s.serverLoginState, finishLoginRequest: done.finishLoginRequest, identifiers: ids });
  flow.wipe();
  return done;
}

describe("OPAQUE password flow (real library)", () => {
  it("registers, signs in with the same key-encryption key, and rejects a wrong password", async () => {
    const reg = await register("Correct horse 1");
    expect(reg.kek).toHaveLength(32);

    const ok = await login("Correct horse 1", reg.registrationRecord);
    expect(ok).not.toBeNull();
    expect(ok!.kek).toEqual(reg.kek);

    expect(await login("Correct horse 2", reg.registrationRecord)).toBeNull();
  }, 60_000);

  it("normalises the password so keyboards agree", async () => {
    const reg = await register("Ａbcdefghij１k");
    const ok = await login("Abcdefghij1k", reg.registrationRecord);
    expect(ok?.kek).toEqual(reg.kek);
  }, 60_000);

  it("treats a server answer for another user id like a wrong password (unknown handle)", async () => {
    const reg = await register("Correct horse 1");
    const flow = new PasswordFlow("Correct horse 1");
    const startLoginRequest = await flow.startLogin();
    const s = lib.server.startLogin({ serverSetup: setup, registrationRecord: reg.registrationRecord, startLoginRequest, userIdentifier: userId, identifiers: ids });
    expect(await flow.finishLogin(s.loginResponse, "someone-else")).toBeNull();
  }, 60_000);

  it("refuses to be used after wipe()", async () => {
    const flow = new PasswordFlow("Correct horse 1");
    flow.wipe();
    await expect(flow.startLogin()).rejects.toThrow();
  });

  it("derives the key from the export key with HKDF, not raw", () => {
    const raw = toB64(new Uint8Array(64).fill(1));
    const a = kekFromExportKey(raw);
    expect(a).toHaveLength(32);
    expect(kekFromExportKey(raw)).toEqual(a);
    expect(kekFromExportKey(toB64(new Uint8Array(64).fill(2)))).not.toEqual(a);
  });
});
