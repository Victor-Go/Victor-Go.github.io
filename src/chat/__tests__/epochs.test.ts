import { describe, expect, it } from "vitest";
import { toEpochs } from "../crypto/keys";
import { KX_EPOCHS, unwrapKey, wrapKey } from "../crypto/kx";
import { decryptMessage, encryptMessage, epochOfCiphertext } from "../crypto/message";
import { generateIdentity } from "../crypto/keys";
import { randomBytes } from "../../cipher/crypto/secrets";
import { stripControls } from "../text";

const binding = { conv: "c", senderId: "s", clientMsgId: "m", gen: 0 };
const payload = { k: "text" as const, text: "hello", sentAt: 1 };

describe("message epochs", () => {
  it("reads the epoch id out of the ciphertext header", async () => {
    const key = randomBytes(32);
    const { epoch, ct } = await encryptMessage(key, toEpochs([{ id: 7, constant: "week_seven" }], 7), payload, binding);
    expect(epoch).toBe(7);
    expect(epochOfCiphertext(ct)).toBe(7);
    expect(epochOfCiphertext("not base64 !!")).toBeNull();
    expect(epochOfCiphertext("AAAA")).toBeNull();
  });

  it("cannot be opened once the epoch's constant is gone, even with the chat key", async () => {
    const key = randomBytes(32);
    const { ct } = await encryptMessage(key, toEpochs([{ id: 7, constant: "week_seven" }], 7), payload, binding);
    expect((await decryptMessage(key, toEpochs([{ id: 7, constant: "week_seven" }], 7), ct, binding)).k).toBe("text");
    await expect(decryptMessage(key, toEpochs([{ id: 8, constant: "week_eight" }], 8), ct, binding)).rejects.toThrow();
    // a different constant under the same id is no help either
    await expect(decryptMessage(key, toEpochs([{ id: 7, constant: "forged_one" }], 7), ct, binding)).rejects.toThrow();
  });
});

describe("key exchange does not depend on message epochs", () => {
  it("opens however much later, with the fixed public label only", async () => {
    const me = generateIdentity();
    const key = randomBytes(32);
    const wrapped = await wrapKey(me.publicKey, key, KX_EPOCHS);
    expect(await unwrapKey(me.seed, wrapped, KX_EPOCHS)).toEqual(key);
    // a table of message epochs is not what it was made with
    await expect(unwrapKey(me.seed, wrapped, toEpochs([{ id: 9, constant: "other" }], 9))).rejects.toThrow();
  });
});

describe("stripControls", () => {
  it("removes direction overrides, isolates and zero-width characters, and nothing else", () => {
    const sneaky = "ok‮evil‬ ​hidden⁦x⁩﻿ end";
    expect(stripControls(sneaky)).toBe("okevil hiddenx end");
    expect(stripControls("消息密码已销毁 😀 abc")).toBe("消息密码已销毁 😀 abc");
    expect(stripControls("👨‍👩‍👧")).toBe("👨‍👩‍👧"); // emoji joiners survive
  });
});
