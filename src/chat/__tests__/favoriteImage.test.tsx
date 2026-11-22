import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FavoriteMedia } from "../components/FavoriteMedia";
import { setLang } from "../lang";
import type { Favorite } from "../store";

const client = vi.hoisted(() => ({
  favoriteImageUrl: vi.fn(async (_f: unknown) => "blob:thumb"),
  favoriteFullImageUrl: vi.fn(async (_f: unknown) => "blob:full"),
  playFavoriteVoice: vi.fn(async () => true),
}));
vi.mock("../client", async (orig) => ({ ...(await orig<typeof import("../client")>()), ...client }));

const fav = (over: Partial<Favorite> = {}): Favorite => ({ id: "c.m1", conv: "c", from: "peer", text: "", time: 1, savedAt: 2, gen: 1, kind: "image", w: 1600, h: 1200, ...over });
const shown = () => document.querySelector<HTMLImageElement>(".ch-viewer-img")?.getAttribute("src") ?? null;

beforeEach(() => {
  setLang("en");
  client.favoriteImageUrl.mockClear();
  client.favoriteFullImageUrl.mockClear();
  client.favoriteFullImageUrl.mockImplementation(async () => "blob:full");
});

describe("a picture in the favourites", () => {
  it("shows the picture, and a tap opens it full screen like a picture in a chat; the close button closes it", async () => {
    render(<FavoriteMedia f={fav()} />);
    const open = await screen.findByRole("button", { name: /view picture/i });
    expect(document.querySelector(".ch-viewer")).toBeNull();
    fireEvent.click(open);
    expect(shown()).toBe("blob:thumb");
    // no preview (an older favourite): the picture on show is the whole one, there is nothing more to fetch
    expect(client.favoriteFullImageUrl).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(document.querySelector(".ch-viewer")).toBeNull();
  });

  it("opens at once with the preview and swaps in the whole picture when it has come", async () => {
    let done: (u: string) => void = () => {};
    client.favoriteFullImageUrl.mockImplementation(() => new Promise<string>((r) => (done = r)));
    render(<FavoriteMedia f={fav({ t: 5000 })} />);
    fireEvent.click(await screen.findByRole("button", { name: /view picture/i }));
    expect(shown()).toBe("blob:thumb");
    expect(client.favoriteFullImageUrl).toHaveBeenCalledTimes(1);
    await act(async () => done("blob:full"));
    await waitFor(() => expect(shown()).toBe("blob:full"));
  });

  it("does not bring the viewer back when the whole picture arrives after it was closed", async () => {
    let done: (u: string) => void = () => {};
    client.favoriteFullImageUrl.mockImplementation(() => new Promise<string>((r) => (done = r)));
    render(<FavoriteMedia f={fav({ t: 5000 })} />);
    fireEvent.click(await screen.findByRole("button", { name: /view picture/i }));
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    await act(async () => done("blob:full"));
    expect(document.querySelector(".ch-viewer")).toBeNull();
  });

  it("keeps the preview in the viewer when the whole picture cannot be fetched", async () => {
    client.favoriteFullImageUrl.mockImplementation(async () => {
      throw new Error("network");
    });
    render(<FavoriteMedia f={fav({ t: 5000 })} />);
    fireEvent.click(await screen.findByRole("button", { name: /view picture/i }));
    await act(async () => {});
    expect(shown()).toBe("blob:thumb");
  });
});
