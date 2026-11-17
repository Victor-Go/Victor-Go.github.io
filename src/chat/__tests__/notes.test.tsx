import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { setLang } from "../lang";
import { PATH, go } from "../route";
import { initialState, useChat } from "../store";

const addNote = vi.fn(async (_text: string) => {});
const editNote = vi.fn(async (_id: string, _text: string) => {});
vi.mock("../client", async (orig) => ({ ...(await orig<typeof import("../client")>()), addNote: (t: string) => addNote(t), editNote: (i: string, t: string) => editNote(i, t) }));
import { MePage } from "../components/MePage";

const me = { userId: "u1", handle: "vera", role: "user" as const, publicKey: "" };

beforeEach(() => {
  addNote.mockClear();
  setLang("en");
  go(PATH.favourites);
  useChat.setState({ ...initialState, phase: "ready", me });
});

describe("notes in the favourites", () => {
  it("a note shows as a note by its creator, who is the person themself", () => {
    useChat.setState({ favorites: [{ id: "note-a1", conv: "", from: "vera", text: "buy milk", time: 1, savedAt: 1, gen: 1, kind: "note" }] });
    render(<MePage />);
    expect(screen.getByText("buy milk")).toBeTruthy();
    expect(screen.getByText(/Note · @vera/)).toBeTruthy();
  });

  it("the plus opens a text box that stops at 1024 characters and saves the text", async () => {
    render(<MePage />);
    fireEvent.click(screen.getByLabelText("Write a note"));
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "x".repeat(1100) } });
    expect(Array.from(box.value).length).toBe(1024);
    fireEvent.change(box, { target: { value: "remember this" } });
    fireEvent.click(screen.getByText("Save note"));
    await waitFor(() => expect(addNote).toHaveBeenCalledWith("remember this"));
    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
  });
});

describe("editing notes", () => {
  const favs = [
    { id: "note-a1", conv: "", from: "vera", text: "mine", time: 1, savedAt: 1, gen: 1, kind: "note" as const },
    { id: "c.m1", conv: "c", from: "bob", text: "said", time: 1, savedAt: 1, gen: 1, kind: "text" as const },
  ];
  it("only a note can be edited, not a saved chat message", () => {
    useChat.setState({ favorites: favs });
    render(<MePage />);
    expect(screen.getAllByText("Edit").length).toBe(1);
  });

  it("editing opens the note's text and saves the change under the same id", async () => {
    useChat.setState({ favorites: favs });
    render(<MePage />);
    fireEvent.click(screen.getByText("Edit"));
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(box.value).toBe("mine");
    fireEvent.change(box, { target: { value: "mine, changed" } });
    fireEvent.click(screen.getByText("Save note"));
    await waitFor(() => expect(editNote).toHaveBeenCalledWith("note-a1", "mine, changed"));
  });
});
