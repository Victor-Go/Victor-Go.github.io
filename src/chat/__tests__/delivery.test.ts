import { describe, it, expect } from "vitest";
import { avatarUri } from "../avatar";
import { deliveryOf } from "../delivery";

describe("deliveryOf", () => {
  it("passes sending and failed through", () => {
    expect(deliveryOf({ status: "sending", seq: 0 }, 5, true)).toBe("sending");
    expect(deliveryOf({ status: "failed", seq: 0 }, 5, true)).toBe("failed");
  });

  it("shows a check once the server has it, and an eye once the other person read that far", () => {
    expect(deliveryOf({ status: "sent", seq: 3 }, 0, true)).toBe("sent");
    expect(deliveryOf({ status: "sent", seq: 3 }, 2, true)).toBe("sent");
    expect(deliveryOf({ status: "sent", seq: 3 }, 3, true)).toBe("read");
    expect(deliveryOf({ status: "sent", seq: 3 }, 9, true)).toBe("read");
  });

  it("never shows an eye in a group", () => {
    expect(deliveryOf({ status: "sent", seq: 3 }, 99, false)).toBe("sent");
  });

  it("does not treat an unnumbered message as read", () => {
    expect(deliveryOf({ status: "sent", seq: 0 }, 99, true)).toBe("sent");
  });
});

describe("avatar", () => {
  it("is a stable SVG data URI per user id", () => {
    const uri = avatarUri("u1");
    expect(uri).toMatch(/^data:image\/svg\+xml/);
    expect(avatarUri("u1")).toBe(uri);
  });

  it("gives different users different pictures", () => {
    const uris = new Set(["u1", "u2", "u3", "u4", "u5", "u6"].map(avatarUri));
    expect(uris.size).toBeGreaterThan(3);
  });
});
