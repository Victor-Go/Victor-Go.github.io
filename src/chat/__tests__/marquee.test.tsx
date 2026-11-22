import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { Marquee } from "../components/ui";

const widths = (scroll: number, client: number) => {
  Object.defineProperty(HTMLElement.prototype, "scrollWidth", { configurable: true, get: () => scroll });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => client });
};
afterEach(() => {
  cleanup();
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollWidth;
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth;
});

describe("a name that is wider than its box", () => {
  it("scrolls by exactly the part that does not fit", () => {
    widths(320, 200);
    const { container } = render(<Marquee>@victor-go [HelloHelloHello]</Marquee>);
    const inner = container.querySelector(".ch-marq-in") as HTMLElement;
    expect(inner.dataset.run).toBe("true");
    expect(inner.style.getPropertyValue("--ch-shift")).toBe("-120px");
  });

  it("a short name is not measured at all", () => {
    widths(999, 10);
    const { container } = render(<Marquee>@boss</Marquee>);
    expect(container.querySelector(".ch-marq-in")).toBeNull();
    expect(container.textContent).toBe("@boss");
  });

  it("stays still when it fits", () => {
    widths(150, 200);
    const { container } = render(<Marquee>@victor-go-go [gogo] (Test)</Marquee>);
    const inner = container.querySelector(".ch-marq-in") as HTMLElement;
    expect(inner.dataset.run).toBeUndefined();
  });
});
