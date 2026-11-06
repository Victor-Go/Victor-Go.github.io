import { describe, it, expect } from "vitest";
import { hslToHex, avatarUri } from "../avatar";
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

describe("avatar background", () => {
  it("converts hsl to hex", () => {
    expect(hslToHex(0, 1, 0.5)).toBe("#ff0000");
    expect(hslToHex(120, 1, 0.5)).toBe("#00ff00");
    expect(hslToHex(240, 1, 0.5)).toBe("#0000ff");
    expect(hslToHex(50, 0.6, 0.88)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("gives users different pastel backgrounds", () => {
    const backs = new Set(
      ["u1", "u2", "u3", "u4", "u5", "u6"].map((id) => /<rect[^>]*fill="(#[0-9a-f]{6})"/i.exec(decodeURIComponent(avatarUri(id).split(",")[1]))?.[1]),
    );
    expect(backs.size).toBeGreaterThan(3);
    for (const b of backs) expect(b).toBeTruthy();
  });
});
