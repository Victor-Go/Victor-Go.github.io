/**
 * Triggers the browser's native print interface for vector PDF rendering.
 * @param elementId The DOM element ID of the preview container.
 * @param filename The downloaded file name (used to set default print file name).
 */
export async function generateResumePDF(
  elementId: string,
  filename: string = "resume.pdf"
): Promise<void> {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Element #${elementId} not found.`);
  }

  // Use document title temporarily to set default PDF filename in browser print dialog
  const originalTitle = document.title;
  const cleanTitle = filename.endsWith(".pdf") ? filename.slice(0, -4) : filename;
  document.title = cleanTitle;

  try {
    window.print();
  } catch (error) {
    console.error("Print failed:", error);
    throw error;
  } finally {
    // Restore original document title
    document.title = originalTitle;
  }
}
