import { useEffect, useId, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { downloadBlob } from "../cipher/output";
import { ACTIVITY_EVENT } from "../cipher/wipe";
import { useFileDrop } from "../cipher/useFileDrop";
import { FORMATS, MAX_FILE_MB, parsePages, type ImageFormat } from "./pages";
import { PasswordNeeded, openPdf, renderPage } from "./render";
import { makeZip } from "../cipher/crypto/zip";
import type { Messages } from "./i18n";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 2 : 1)} ${units[i]}`;
}

const pad = (n: number, total: number) => String(n).padStart(String(total).length, "0");
// eslint-disable-next-line no-control-regex
const baseName = (name: string) => name.replace(/\.pdf$/i, "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_") || "document";

interface Result {
  name: string;
  blob: Blob;
  count: number;
}

export function ToImages({ m }: { m: Messages }) {
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLElement>(null);
  const doc = useRef<PDFDocumentProxy | null>(null);
  const bytes = useRef<Uint8Array | null>(null);
  const pending = useRef<{ name: string; size: number } | null>(null);
  const run = useRef(0);
  const formatId = useId();
  const scaleId = useId();
  const qualityId = useId();
  const rangeId = useId();
  const pwId = useId();

  const [file, setFile] = useState<{ name: string; size: number; pages: number } | null>(null);
  const [needPw, setNeedPw] = useState<"no" | "ask" | "wrong">("no");
  const [pw, setPw] = useState("");
  const [format, setFormat] = useState<ImageFormat>("png");
  const [scale, setScale] = useState(2);
  const [quality, setQuality] = useState(90);
  const [range, setRange] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<[number, number]>([0, 0]);
  const [error, setError] = useState("");
  const [reduced, setReduced] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const release = () => {
    run.current++;
    void doc.current?.destroy();
    doc.current = null;
    bytes.current?.fill(0);
    bytes.current = null;
  };

  // Drop the parsed document and its bytes when the tool unmounts (wipe or page close).
  useEffect(() => release, []);

  const reset = () => {
    release();
    setFile(null);
    setNeedPw("no");
    setPw("");
    setError("");
    setResult(null);
    setBusy(false);
    setReduced(false);
  };

  const load = async (name: string, size: number, data: Uint8Array, password?: string) => {
    try {
      const d = await openPdf(data, password);
      doc.current = d;
      bytes.current = data;
      setNeedPw("no");
      setFile({ name, size, pages: d.numPages });
    } catch (e) {
      if (e instanceof PasswordNeeded) {
        bytes.current = data;
        pending.current = { name, size };
        setFile(null);
        setNeedPw(e.wrong ? "wrong" : "ask");
      } else {
        data.fill(0);
        bytes.current = null;
        setNeedPw("no");
        setError(m.notPdf);
      }
    }
  };

  const pick = async (f: File | undefined) => {
    reset();
    if (!f) return;
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      setError(m.fileTooBig(MAX_FILE_MB));
      return;
    }
    let data: Uint8Array;
    try {
      data = new Uint8Array(await f.arrayBuffer());
    } catch {
      setError(m.notPdf);
      return;
    }
    await load(f.name, f.size, data);
  };

  const unlock = async () => {
    const p = pending.current;
    if (!p || !bytes.current) return;
    setError("");
    await load(p.name, p.size, bytes.current, pw);
  };

  const dragging = useFileDrop(root, (files) => void pick(files[0]));

  const pages = file ? parsePages(range, file.pages) : null;
  const rangeBad = !!file && pages === null;

  const convert = async () => {
    const d = doc.current;
    if (!d || !file || !pages) return;
    const id = ++run.current;
    setBusy(true);
    setError("");
    setResult(null);
    setReduced(false);
    setProgress([0, pages.length]);
    window.dispatchEvent(new Event(ACTIVITY_EVENT));
    const fmt = FORMATS.find((f) => f.id === format)!;
    const base = baseName(file.name);
    const out: { name: string; data: Uint8Array }[] = [];
    try {
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        const { blob, reduced: r } = await renderPage(d, p, scale, format, quality / 100);
        if (id !== run.current) return;
        if (r) setReduced(true);
        out.push({ name: `${base}-${pad(p, d.numPages)}.${fmt.ext}`, data: new Uint8Array(await blob.arrayBuffer()) });
        setProgress([i + 1, pages.length]);
        window.dispatchEvent(new Event(ACTIVITY_EVENT));
      }
      setResult(
        out.length === 1
          ? { name: out[0].name, blob: new Blob([out[0].data as Uint8Array<ArrayBuffer>], { type: fmt.mime }), count: 1 }
          : { name: `${base}-images.zip`, blob: await makeZip(out), count: out.length },
      );
    } catch {
      if (id === run.current) setError(m.convertFailed);
    } finally {
      if (id === run.current) setBusy(false);
    }
  };

  return (
    <section ref={root} className={dragging ? "c-drop c-dragging" : "c-drop"}>
      <p className="c-intro">{m.imagesIntro}</p>
      <div className="c-field p-file">
        <button type="button" onClick={() => input.current?.click()}>
          {m.pickPdf}
        </button>
        <span className="p-file-name">{file ? m.pdfInfo(file.name, formatBytes(file.size), file.pages) : m.noPdf}</span>
        <input
          ref={input}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          aria-label={m.pickPdf}
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      {needPw !== "no" && (
        <div className="c-field">
          <label htmlFor={pwId}>{m.passwordLabel}</label>
          <p className="c-hint">{needPw === "wrong" ? m.wrongPassword : m.needPassword}</p>
          <input
            id={pwId}
            type="password"
            className="p-text"
            autoComplete="off"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void unlock()}
          />
          <button type="button" onClick={() => void unlock()}>
            {m.unlock}
          </button>
        </div>
      )}

      {file && (
        <>
          <div className="c-field">
            <label htmlFor={formatId}>{m.formatLabel}</label>
            <select id={formatId} className="p-select" value={format} onChange={(e) => setFormat(e.target.value as ImageFormat)}>
              {FORMATS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div className="c-field">
            <label htmlFor={scaleId}>{m.scaleLabel}</label>
            <select id={scaleId} className="p-select" value={scale} onChange={(e) => setScale(Number(e.target.value))}>
              <option value={1}>{m.scale1}</option>
              <option value={2}>{m.scale2}</option>
              <option value={3}>{m.scale3}</option>
            </select>
          </div>
          {format === "jpeg" && (
            <div className="c-field">
              <label htmlFor={qualityId}>{m.qualityLabel(quality)}</label>
              <input
                id={qualityId}
                type="range"
                className="p-range"
                min={50}
                max={100}
                step={5}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
              />
            </div>
          )}
          <div className="c-field">
            <label htmlFor={rangeId}>{m.pagesLabel}</label>
            <input
              id={rangeId}
              type="text"
              className="p-text"
              autoComplete="off"
              spellCheck={false}
              value={range}
              onChange={(e) => setRange(e.target.value)}
            />
            <div className="c-hint">{m.pagesHint}</div>
            {rangeBad && <p role="alert" className="c-error">{m.pagesInvalid(file.pages)}</p>}
          </div>
          <button type="button" className="c-primary" disabled={busy || rangeBad} onClick={() => void convert()}>
            {m.convert}
          </button>
        </>
      )}

      {busy && <p role="status" className="c-hint">{m.converting(progress[0], progress[1])}</p>}
      {reduced && <p role="note" className="c-hint">{m.scaleReduced}</p>}
      {error && <p role="alert" className="c-error">{error}</p>}
      {result && (
        <div className="c-field c-output">
          <p role="status" className="c-hint">{m.done(result.count, formatBytes(result.blob.size))}</p>
          <div className="c-actions">
            <button type="button" onClick={() => downloadBlob(result.name, result.blob)}>
              {result.count === 1 ? m.downloadImage : m.downloadZip}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
