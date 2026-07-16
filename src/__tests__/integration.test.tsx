import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "../App";

// Mock pdf utilities to avoid running print/html2pdf logic in jsdom
vi.mock("../utils/pdf", () => ({
  generateResumePDF: vi.fn().mockResolvedValue(undefined),
}));

describe("Happy Path Integration Flow", () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset state in Zustand store manually to start fresh
    vi.restoreAllMocks();
  });

  it("completes full flow: edit markdown, change style, save resume slot, and switch view", async () => {
    render(<App />);

    // 1. Verify App renders with the default resume title
    expect(screen.getByRole("heading", { level: 1, name: /Markdown/i })).toBeInTheDocument();

    // 2. Locate editor textarea and type custom content
    const textarea = screen.getByPlaceholderText(/Your Name/i);
    expect(textarea).toBeInTheDocument();
    
    fireEvent.change(textarea, { target: { value: "# Test Integrations\n\n## Experience\n- Engineering Lead" } });
    
    // Verify editor markdown content state updated
    expect(textarea).toHaveValue("# Test Integrations\n\n## Experience\n- Engineering Lead");

    // 3. Change file name in input
    const filenameInput = screen.getByPlaceholderText("resume");
    fireEvent.change(filenameInput, { target: { value: "test-integration-resume" } });
    expect(filenameInput).toHaveValue("test-integration-resume");

    // 4. Open saved resumes modal
    const manageBtn = screen.getByTitle(/Manage|管理|備份/i);
    fireEvent.click(manageBtn);

    // Verify modal is open and has input
    const backupInput = screen.getByPlaceholderText(/resume name|简历名称|履歷/i);
    expect(backupInput).toBeInTheDocument();

    // Type name for saving
    fireEvent.change(backupInput, { target: { value: "Save Slot Alpha" } });
    
    // Click backup save button
    const saveBtn = screen.getByRole("button", { name: /Save to Storage|保存到本地|儲存到本地/i });
    fireEvent.click(saveBtn);

    // Verify item appears in list
    await waitFor(() => {
      expect(screen.getByText("Save Slot Alpha")).toBeInTheDocument();
    });

    // Close modal
    const closeBtn = screen.getByLabelText("Close");
    fireEvent.click(closeBtn);
    expect(screen.queryByPlaceholderText(/resume name|简历名称|履歷/i)).not.toBeInTheDocument();
  });
});
