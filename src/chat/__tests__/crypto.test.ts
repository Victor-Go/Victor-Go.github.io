// @vitest-environment node
import { describe, it, expect } from "vitest";
import { toB64, fromB64 } from "../crypto/b64";
import { generateIdentity, publicKeyOf, toEpochs } from "../crypto/keys";
import { unwrapKey, wrapKey } from "../crypto/kx";
import { decryptMessage, encryptMessage, type Binding } from "../crypto/message";
import { openFavoriteBytes, openFavoriteText, sealFavoriteBytes, sealFavoriteText } from "../crypto/favorite";
import { newMasterKey, openRecord, sealRecord, unwrapMasterKey, wrapMasterKey } from "../crypto/vault";
import { leadingZeroBits, solvePart, type Challenge } from "../workers/solve";

const epochs = toEpochs([{ id: 100, constant: "constA_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }, { id: 101, constant: "constB_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }], 101);
const binding: Binding = { conv: "conv1", senderId: "alice", clientMsgId: "m1", gen: 0 };
const key = new Uint8Array(32).fill(9);

describe("messages", () => {
  it("round-trips text and voice payloads", async () => {
    const { epoch, ct } = await encryptMessage(key, epochs, { k: "text", text: "你好 hello", sentAt: 5 }, binding);
    expect(epoch).toBe(101);
    expect(await decryptMessage(key, epochs, ct, binding)).toEqual({ k: "text", text: "你好 hello", sentAt: 5 });
    const v = await encryptMessage(key, epochs, { k: "voice", voice: { id: "v1", ms: 4000 }, sentAt: 6 }, binding);
    expect((await decryptMessage(key, epochs, v.ct, binding)).k).toBe("voice");
  });

  it("uses a fresh salt and nonce every time", async () => {
    const a = await encryptMessage(key, epochs, { k: "text", text: "same", sentAt: 1 }, binding);
    const b = await encryptMessage(key, epochs, { k: "text", text: "same", sentAt: 1 }, binding);
    expect(a.ct).not.toBe(b.ct);
  });

  it("is bound to chat, sender, message id and key generation", async () => {
    const { ct } = await encryptMessage(key, epochs, { k: "text", text: "x", sentAt: 1 }, binding);
    for (const other of [{ conv: "conv2" }, { senderId: "mallory" }, { clientMsgId: "m2" }, { gen: 1 }]) {
      await expect(decryptMessage(key, epochs, ct, { ...binding, ...other })).rejects.toThrow();
    }
    await expect(decryptMessage(new Uint8Array(32).fill(1), epochs, ct, binding)).rejects.toThrow();
  });

  it("rejects tampering and truncation", async () => {
    const { ct } = await encryptMessage(key, epochs, { k: "text", text: "x", sentAt: 1 }, binding);
    const bytes = fromB64(ct);
    bytes[bytes.length - 1] ^= 1;
    await expect(decryptMessage(key, epochs, toB64(bytes), binding)).rejects.toThrow();
    await expect(decryptMessage(key, epochs, ct.slice(0, 20), binding)).rejects.toThrow();
    await expect(decryptMessage(key, epochs, "!!!", binding)).rejects.toThrow();
  });

  it("stops decrypting once the epoch is dropped", async () => {
    const { ct } = await encryptMessage(key, epochs, { k: "text", text: "old", sentAt: 1 }, binding);
    const later = toEpochs([{ id: 102, constant: "constC_cccccccccccccccccccccccccccccccc" }], 102);
    await expect(decryptMessage(key, later, ct, binding)).rejects.toThrow();
  });

  it("depends on the epoch constant, not just its id", async () => {
    const { ct } = await encryptMessage(key, epochs, { k: "text", text: "x", sentAt: 1 }, binding);
    const swapped = toEpochs([{ id: 101, constant: "constX_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }], 101);
    await expect(decryptMessage(key, swapped, ct, binding)).rejects.toThrow();
  });

  it("refuses to encrypt when the current epoch is unknown", async () => {
    await expect(encryptMessage(key, { current: 5, labels: new Map() }, { k: "text", text: "x", sentAt: 1 }, binding)).rejects.toThrow();
  });
});

describe("key wrapping", () => {
  it("wraps a chat key to an identity and only that identity opens it", async () => {
    const id = generateIdentity();
    const chatKey = new Uint8Array(32).map((_, i) => i);
    const wrapped = await wrapKey(id.publicKey, chatKey, epochs);
    expect(await unwrapKey(id.seed, wrapped, epochs)).toEqual(chatKey);
    await expect(unwrapKey(generateIdentity().seed, wrapped, epochs)).rejects.toThrow();
    expect(publicKeyOf(id.seed)).toBe(id.publicKey);
  });

  it("cannot be opened after the epoch retires", async () => {
    const id = generateIdentity();
    const wrapped = await wrapKey(id.publicKey, key, epochs);
    await expect(unwrapKey(id.seed, wrapped, toEpochs([{ id: 150, constant: "constZ_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz" }], 150))).rejects.toThrow();
  });
});

describe("vault", () => {
  it("wraps the master key with the password key", async () => {
    const mk = newMasterKey();
    const kek = new Uint8Array(32).fill(3);
    const wrapped = await wrapMasterKey(mk, kek);
    expect(await unwrapMasterKey(wrapped, kek)).toEqual(mk);
    await expect(unwrapMasterKey(wrapped, new Uint8Array(32).fill(4))).rejects.toThrow();
  });

  it("seals records per id, user and version", async () => {
    const mk = newMasterKey();
    const ct = await sealRecord(mk, "u1", "contact:a", 3, { name: "A", key: "k" });
    expect(await openRecord(mk, "u1", "contact:a", 3, ct)).toEqual({ name: "A", key: "k" });
    await expect(openRecord(mk, "u2", "contact:a", 3, ct)).rejects.toThrow();
    await expect(openRecord(mk, "u1", "contact:b", 3, ct)).rejects.toThrow();
    await expect(openRecord(mk, "u1", "contact:a", 2, ct)).rejects.toThrow();
    await expect(openRecord(newMasterKey(), "u1", "contact:a", 3, ct)).rejects.toThrow();
  });
});

describe("proof of work solver", () => {
  // Known answer produced by the simulator's reference solver (chat-server sim/pow.js).
  const challenge: Challenge = { id: "vec-1", salt: "BwcHBwcHBwcHBwcHBwcHBw", parts: 3, bits: 3, memKiB: 64, iterations: 1, multiplier: 1, expiresAt: 0 };

  it("finds the same nonces as the server's reference", () => {
    expect([0, 1, 2].map((i) => solvePart(challenge, i))).toEqual([5, 2, 0]);
  });

  it("can be stopped", () => {
    expect(solvePart({ ...challenge, bits: 40 }, 0, () => true)).toBeNull();
  });

  it("counts leading zero bits", () => {
    expect(leadingZeroBits(Uint8Array.of(0, 0, 0x10))).toBe(19);
    expect(leadingZeroBits(Uint8Array.of(0x80))).toBe(0);
    expect(leadingZeroBits(Uint8Array.of(0, 0))).toBe(16);
  });
});

describe("favourites and the archive constant", () => {
  const archive = { gen: 1, constant: "archive_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" };

  it("round-trips while the archive constant exists", async () => {
    const mk = newMasterKey();
    const sealed = await sealFavoriteText(mk, archive, "u1", "fav1", "keep this 你好");
    expect(sealed).not.toContain("keep this");
    expect(await openFavoriteText(mk, archive, "u1", "fav1", 1, sealed)).toBe("keep this 你好");
  });

  it("cannot be opened after a wipe: a new generation and constant", async () => {
    const mk = newMasterKey();
    const sealed = await sealFavoriteText(mk, archive, "u1", "fav1", "secret");
    const wiped = { gen: 2, constant: "archive_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" };
    await expect(openFavoriteText(mk, wiped, "u1", "fav1", 1, sealed)).rejects.toThrow();
    // even claiming the new generation does not help: the constant is part of the key
    await expect(openFavoriteText(mk, wiped, "u1", "fav1", 2, sealed)).rejects.toThrow();
    // and the old constant on its own (say, from a backup) is useless without the vault key
    await expect(openFavoriteText(newMasterKey(), archive, "u1", "fav1", 1, sealed)).rejects.toThrow();
  });

  it("seals a voice message or picture as raw bytes, bound like the text and never interchangeable with it", async () => {
    const mk = newMasterKey();
    const bytes = Uint8Array.from({ length: 3000 }, (_, i) => (i * 7) % 256);
    const sealed = await sealFavoriteBytes(mk, archive, "u1", "fav1", bytes);
    expect(sealed.length).toBe(bytes.length + 12 + 16); // nonce | ciphertext | tag: the exact size the server is told
    expect(Array.from(await openFavoriteBytes(mk, archive, "u1", "fav1", 1, sealed))).toEqual(Array.from(bytes));
    await expect(openFavoriteBytes(mk, archive, "u2", "fav1", 1, sealed)).rejects.toThrow();
    await expect(openFavoriteBytes(mk, archive, "u1", "fav2", 1, sealed)).rejects.toThrow();
    await expect(openFavoriteBytes(newMasterKey(), archive, "u1", "fav1", 1, sealed)).rejects.toThrow();
    const wiped = { gen: 2, constant: "archive_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" };
    await expect(openFavoriteBytes(mk, wiped, "u1", "fav1", 2, sealed)).rejects.toThrow(); // a new constant: the file cannot be opened any more
    const tampered = sealed.slice();
    tampered[20] ^= 1;
    await expect(openFavoriteBytes(mk, archive, "u1", "fav1", 1, tampered)).rejects.toThrow();
  });

  it("is bound to its user and its id", async () => {
    const mk = newMasterKey();
    const sealed = await sealFavoriteText(mk, archive, "u1", "fav1", "x");
    await expect(openFavoriteText(mk, archive, "u2", "fav1", 1, sealed)).rejects.toThrow();
    await expect(openFavoriteText(mk, archive, "u1", "fav2", 1, sealed)).rejects.toThrow();
  });
});
