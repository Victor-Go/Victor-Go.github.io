import html2pdf from "html2pdf.js";

/**
 * Capture the preview DOM container and export it as an A4 PDF on the client side.
 * @param elementId The DOM element ID of the preview container.
 * @param filename The downloaded file name.
 */
export async function generateResumePDF(
  elementId: string,
  filename: string = "resume.pdf"
): Promise<void> {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Element #${elementId} not found.`);
  }

  // Configure html2pdf with A4 specs and clean 12mm margins
  const options = {
    margin: 12, // A4 margin: 12mm (within 10mm-15mm range)
    filename: filename,
    image: { type: "png" as const, quality: 2 },
    html2canvas: {
      scale: 4, // 2x scale for higher resolution print quality
      useCORS: true,
      logging: false,
      letterRendering: true,
      scrollX: 0,
      scrollY: 0,
    },
    jsPDF: {
      unit: "mm" as const,
      format: "a4" as const,
      orientation: "portrait" as const,
    },
    pagebreak: {
      mode: ["avoid-all", "css"],
      // Force page-breaks to avoid splitting paragraphs, section blocks, list elements, or headings
      avoid: [
        ".resume-section",
        ".resume-item",
        "li",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "p",
      ],
    },
  };

  // Add rendering state class to hide layout boundaries or outline helpers
  element.classList.add("pdf-exporting");

  try {
    await html2pdf().from(element).set(options).save();
  } catch (error) {
    console.error("PDF generation failed:", error);
    throw error;
  } finally {
    // Always clean up formatting class
    element.classList.remove("pdf-exporting");
  }
}
