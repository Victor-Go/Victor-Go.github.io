import * as pdfjs from "pdfjs-dist";
import { FORMATS, effectiveScale, type ImageFormat } from "./pages";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const ASSETS = "/pdf/pdfjs/";

export class PasswordNeeded extends Error {
  readonly wrong: boolean;
  constructor(wrong: boolean) {
    super("password");
    this.wrong = wrong;
  }
}

export async function openPdf(bytes: Uint8Array, password?: string): Promise<pdfjs.PDFDocumentProxy> {
  // pdf.js transfers the buffer to its worker, so give it a copy and keep ours.
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    password,
    isEvalSupported: false,
    // Same-origin files shipped in public/pdf/pdfjs: CJK CMaps, the 14 standard fonts, JPEG 2000 and ICC data.
    cMapUrl: `${ASSETS}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${ASSETS}standard_fonts/`,
    wasmUrl: `${ASSETS}wasm/`,
    iccUrl: `${ASSETS}iccs/`,
    useSystemFonts: true,
    stopAtErrors: false,
  });
  try {
    return await task.promise;
  } catch (e) {
    if (e instanceof Error && e.name === "PasswordException") {
      throw new PasswordNeeded((e as Error & { code?: number }).code === pdfjs.PasswordResponses.INCORRECT_PASSWORD);
    }
    throw e;
  }
}

export async function renderPage(
  doc: pdfjs.PDFDocumentProxy,
  pageNumber: number,
  scale: number,
  format: ImageFormat,
  quality: number,
): Promise<{ blob: Blob; reduced: boolean }> {
  const page = await doc.getPage(pageNumber);
  try {
    const base = page.getViewport({ scale: 1 });
    const used = effectiveScale(base.width, base.height, scale);
    const viewport = page.getViewport({ scale: used });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    // JPEG has no alpha, and a transparent PDF page would turn black.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    const mime = FORMATS.find((f) => f.id === format)!.mime;
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, mime, quality));
    canvas.width = canvas.height = 0;
    if (!blob) throw new Error("encode");
    return { blob, reduced: used < scale };
  } finally {
    page.cleanup();
  }
}
