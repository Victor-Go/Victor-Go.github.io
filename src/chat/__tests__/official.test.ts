import { describe, expect, it } from "vitest";
import { cardStatus, parseCard, parseDeclined, parseRemoved } from "../official";
import { canDelete } from "../selection";

const card = { cardId: "c1", subjectId: "u2", subjectHandle: "bob", expiresAt: 10_000, state: "active" };

describe("parsing what an official message carries", () => {
  it("reads a contact_removed record, with the reasons the server names", () => {
    expect(parseRemoved({ userId: "u1", handle: "ann", reason: "removed" })).toEqual({ userId: "u1", handle: "ann", reason: "removed" });
    expect(parseRemoved({ userId: "u1", handle: "ann", reason: "self_deleted" })?.reason).toBe("self_deleted");
    expect(parseRemoved({ userId: "u1", handle: "ann", reason: "admin_deleted" })?.reason).toBe("admin_deleted");
  });

  it("treats an unknown reason as a plain removal, and refuses a record without a user", () => {
    expect(parseRemoved({ userId: "u1", handle: "ann", reason: "new_reason" })?.reason).toBe("removed");
    expect(parseRemoved({ handle: "ann" })).toBeNull();
    expect(parseRemoved(null)).toBeNull();
    expect(parseRemoved("x")).toBeNull();
  });

  it("reads a card and refuses one that is missing what it needs", () => {
    expect(parseCard(card)).toEqual({ ...card, reason: "" });
    expect(parseCard({ ...card, state: "revoked", reason: "revoked_by_admin" })).toMatchObject({ state: "revoked", reason: "revoked_by_admin" });
    expect(parseCard({ ...card, state: "used" })?.state).toBe("used");
    expect(parseCard({ ...card, state: "anything else" })?.state).toBe("active");
    expect(parseCard({ ...card, cardId: undefined })).toBeNull();
    expect(parseCard({ ...card, subjectId: "" })).toBeNull();
    expect(parseCard({ ...card, expiresAt: "soon" })).toBeNull();
    expect(parseCard([])).toBeNull();
  });
});

describe("when a card shows as expired", () => {
  const c = parseCard(card)!;

  it("is active until the server's clock passes expiresAt", () => {
    expect(cardStatus(c, 9_999, 0)).toBe("active");
    expect(cardStatus(c, 10_001, 0)).toBe("expired");
  });

  it("uses the server's clock, not the device's", () => {
    // The device is 5 s slow: at device time 8 000 the server already says 13 000.
    expect(cardStatus(c, 8_000, 5_000)).toBe("expired");
    // The device is 5 s fast: at device time 12 000 the server still says 7 000.
    expect(cardStatus(c, 12_000, -5_000)).toBe("active");
  });

  it("never turns a used or revoked card back into anything else", () => {
    expect(cardStatus({ ...c, state: "used" }, 99_999, 0)).toBe("used");
    expect(cardStatus({ ...c, state: "revoked" }, 0, 0)).toBe("revoked");
  });
});

describe("deleting official messages", () => {
  it("any accepted official message can be deleted, though none is 'mine'", () => {
    expect(canDelete({ mine: false, seq: 3, status: "sent", kind: "card" })).toBe(true);
    expect(canDelete({ mine: false, seq: 3, status: "sent" })).toBe(false);
    expect(canDelete({ mine: false, seq: 3, status: "sent", kind: "card", deleted: true })).toBe(false);
  });
});

describe("contact_declined", () => {
  it("reads who declined, and refuses a record without a user", () => {
    expect(parseDeclined({ userId: "u2", handle: "bob" })).toEqual({ userId: "u2", handle: "bob" });
    expect(parseDeclined({ userId: "u2" })).toEqual({ userId: "u2", handle: "" });
    expect(parseDeclined({ handle: "bob" })).toBeNull();
    expect(parseDeclined(null)).toBeNull();
  });
});
