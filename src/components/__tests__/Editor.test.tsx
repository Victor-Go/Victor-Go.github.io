import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Editor } from "../Editor";

describe("Editor Component Search and Replace", () => {
  it("renders successfully", () => {
    const onChangeMock = vi.fn();
    render(<Editor markdown="Hello World" onChange={onChangeMock} lang="en" />);
    expect(screen.getByPlaceholderText(/Your Name/i)).toBeInTheDocument();
  });

  it("opens find panel and highlights matched terms", async () => {
    const onChangeMock = vi.fn();
    const { container } = render(
      <Editor markdown="Hello World\nThis is a test of World" onChange={onChangeMock} lang="en" />
    );

    // Trigger Ctrl+F shortcut to open the panel
    fireEvent.keyDown(window, { key: "f", ctrlKey: true });

    // Verify find panel is open
    const findInput = screen.getByPlaceholderText(/Find/i);
    expect(findInput).toBeInTheDocument();

    // Type query "World"
    fireEvent.change(findInput, { target: { value: "World" } });

    // Verify match status (should be 1 of 2 matches)
    const status = container.querySelector(".find-replace-status");
    expect(status).toHaveTextContent(/1 of 2/i);
  });

  it("supports case sensitive searching", async () => {
    const onChangeMock = vi.fn();
    const { container } = render(
      <Editor markdown="World\nworld" onChange={onChangeMock} lang="en" />
    );

    fireEvent.keyDown(window, { key: "f", ctrlKey: true });
    const findInput = screen.getByPlaceholderText(/Find/i);
    fireEvent.change(findInput, { target: { value: "World" } });

    // Enable Match Case toggle
    const matchCaseBtn = screen.getByTitle(/Match Case|Aa/i);
    fireEvent.click(matchCaseBtn);

    const status = container.querySelector(".find-replace-status");
    expect(status).toHaveTextContent(/1 of 1/);
  });

  it("supports whole word matching", async () => {
    const onChangeMock = vi.fn();
    const { container } = render(
      <Editor markdown="test testing test" onChange={onChangeMock} lang="en" />
    );

    fireEvent.keyDown(window, { key: "f", ctrlKey: true });
    const findInput = screen.getByPlaceholderText(/Find/i);
    fireEvent.change(findInput, { target: { value: "test" } });

    // Enable Whole Word toggle
    const wholeWordBtn = screen.getByTitle(/Whole Word|W/i);
    fireEvent.click(wholeWordBtn);

    const status = container.querySelector(".find-replace-status");
    expect(status).toHaveTextContent(/1 of 2/); // "test" matches, "testing" does not
  });

  it("supports regex searching", async () => {
    const onChangeMock = vi.fn();
    const { container } = render(
      <Editor markdown="cat bat rat" onChange={onChangeMock} lang="en" />
    );

    fireEvent.keyDown(window, { key: "f", ctrlKey: true });
    const findInput = screen.getByPlaceholderText(/Find/i);
    fireEvent.change(findInput, { target: { value: "[c|b]at" } });

    // Enable Regex toggle
    const regexBtn = screen.getByTitle(/Expression|\.\*/i);
    fireEvent.click(regexBtn);

    const status = container.querySelector(".find-replace-status");
    expect(status).toHaveTextContent(/1 of 2/); // "cat" and "bat" match
  });

  it("triggers replace all literals", async () => {
    const onChangeMock = vi.fn();
    render(
      <Editor markdown="apple orange apple" onChange={onChangeMock} lang="en" />
    );

    // Open find/replace panel using Ctrl+H (or Ctrl+F then clicking row)
    fireEvent.keyDown(window, { key: "h", ctrlKey: true });

    const findInput = screen.getByPlaceholderText(/Find/i);
    fireEvent.change(findInput, { target: { value: "apple" } });

    const replaceInput = screen.getByPlaceholderText(/Replace/i);
    fireEvent.change(replaceInput, { target: { value: "banana" } });

    // Click Replace All button
    const replaceAllBtn = screen.getByTitle(/Replace All/i);
    fireEvent.click(replaceAllBtn);

    // Verification check: onChange should be called with replaced text
    expect(onChangeMock).toHaveBeenCalledWith("banana orange banana");
  });
});
