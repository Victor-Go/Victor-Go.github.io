import { useEffect, useRef, useState } from "react";
import { TextPreview } from "./TextPreview";
import type { Messages } from "../i18n";
import {
  EFILE_EXTENSION,
  compressionSupported,
  decryptFile,
  encryptFile,
  previewKind,
  safeFileName,
  type FileMeta,
  type FileOptions,
} from "../crypto/file";
import { isBundle, packBundle, unpackBundle, type BundleEntry } from "../crypto/bundle";
import { workerKdf } from "../workers/kdfClient";
import { downloadBlob } from "../output";
import { ACTIVITY_EVENT } from "../wipe";
import { useFileDrop } from "../useFileDrop";
import { moveItem } from "../reorder";
import { estimateBits, isWeak } from "../crypto/strength";
import { Field, Tabs } from "./Fields";
import { ImageViewer } from "./ImageViewer";
import { PdfViewer } from "./PdfViewer";
import { errorText } from "./errorText";

type Tab = "encrypt" | "decrypt";

export function FileCrypto({ m }: { m: Messages }) {
  const [tab, setTab] = useState<Tab>("encrypt");
  const tabs = [
    { id: "encrypt", label: m.tabEncrypt, content: <EncryptFile m={m} /> },
    { id: "decrypt", label: m.tabDecrypt, content: <DecryptFile m={m} /> },
  ];
  return (
    <section>
      <p className="c-intro">{m.fileIntro}</p>
      <Tabs label={m.moduleFile} tabs={tabs} active={tab} onChange={(t) => setTab(t as Tab)} />
    </section>
  );
}

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

/** Shared state machine of both tabs: busy flag, progress, error, abort on unmount. */
function useJob(m: Messages) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const run = async (work: (o: FileOptions) => Promise<void>) => {
    controller.current?.abort();
    const ctl = new AbortController();
    controller.current = ctl;
    setError("");
    setProgress(0);
    setBusy(true);
    window.dispatchEvent(new Event(ACTIVITY_EVENT));
    try {
      await work({
        kdf: workerKdf,
        signal: ctl.signal,
        onProgress: (done, total) => {
          setProgress(total > 0 ? Math.floor((done / total) * 100) : 100);
          window.dispatchEvent(new Event(ACTIVITY_EVENT));
        },
      });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) setError(errorText(e, m));
    } finally {
      if (controller.current === ctl) setBusy(false);
    }
  };
  return { busy, progress, error, run };
}

const LARGE_FILE_BYTES = 100 * 1024 * 1024;

function LargeFileNote({ m, size }: { m: Messages; size: number }) {
  if (size <= LARGE_FILE_BYTES) return null;
  return (
    <p role="note" className="c-warn">
      {m.largeFile(formatBytes(size))}
    </p>
  );
}

function FilePicker({ m, files, onPick, multiple }: { m: Messages; files: File[]; onPick: (f: File[]) => void; multiple?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const total = files.reduce((n, f) => n + f.size, 0);
  const [drag, setDrag] = useState<number | null>(null);
  return (
    <div className="c-field">
      <input
        ref={input}
        type="file"
        multiple={multiple}
        className="c-file-input"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          onPick(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <button type="button" onClick={() => input.current?.click()}>
        {multiple ? m.chooseFiles : m.chooseFile}
      </button>
      <div className="c-hint">
        {files.length === 0
          ? m.noFile
          : files.length === 1
            ? m.selectedFile(files[0].name, formatBytes(files[0].size))
            : m.selectedFiles(files.length, formatBytes(total))}
      </div>
      {multiple && files.length > 0 && (
        <>
          <ul className="c-file-list">
            {files.map((f, i) => (
              <li key={i} data-file-index={i} className={drag === i ? "c-file-item c-file-dragging" : "c-file-item"}>
                {files.length > 1 && (
                  <span
                    className="c-drag-handle"
                    role="img"
                    aria-label={m.dragToReorder}
                    title={m.dragToReorder}
                    onPointerDown={(e) => {
                      setDrag(i);
                      try {
                        e.currentTarget.setPointerCapture(e.pointerId);
                      } catch {
                        // Not capturable (e.g. a synthetic event); the row under the pointer is still tracked.
                      }
                    }}
                    onPointerMove={(e) => {
                      if (drag === null) return;
                      // The pointer is captured by the handle, so the row under it is found by position.
                      const row = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-file-index]");
                      const to = row ? Number(row.getAttribute("data-file-index")) : drag;
                      if (to !== drag) {
                        onPick(moveItem(files, drag, to));
                        setDrag(to);
                      }
                    }}
                    onPointerUp={() => setDrag(null)}
                    onPointerCancel={() => setDrag(null)}
                  >
                    ⠿
                  </span>
                )}
                <span className="c-file-name">{f.name}</span>
                <span className="c-hint c-file-size">({formatBytes(f.size)})</span>
                <button
                  type="button"
                  className="c-file-remove"
                  aria-label={m.removeFileLabel(f.name)}
                  title={m.removeFileLabel(f.name)}
                  onClick={() => onPick(files.filter((_, j) => j !== i))}
                >
                  {m.removeFile}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => onPick([])}>
            {m.clearFiles}
          </button>
        </>
      )}
    </div>
  );
}

function Status({ m, busy, progress, error }: { m: Messages; busy: boolean; progress: number; error: string }) {
  return (
    <>
      {busy && (
        <p role="status" className="c-hint">
          {m.workingFile(progress)}
        </p>
      )}
      {error && (
        <p role="alert" className="c-error">
          {error}
        </p>
      )}
    </>
  );
}

function EncryptFile({ m }: { m: Messages }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [compress, setCompress] = useState(false);
  const [out, setOut] = useState<Blob | null>(null);
  const revision = useRef(0);
  const job = useJob(m);
  const root = useRef<HTMLDivElement>(null);
  const dragging = useFileDrop(root, (f) => { touch(); setFiles((prev) => [...prev, ...f]); });
  const canCompress = compressionSupported();
  const touch = () => {
    revision.current++;
    setOut(null);
  };
  const go = () => {
    if (files.length === 0) return;
    if (pw !== pw2) return;
    const startedAt = revision.current;
    setOut(null);
    return job.run(async (o) => {
      // Several files are packed into one zip first, then that single archive is encrypted.
      const input = files.length === 1 ? files[0] : await packBundle(files);
      const blob = await encryptFile(input, pw, { ...o, compress: compress && canCompress });
      if (revision.current === startedAt) setOut(blob);
    });
  };
  const mismatch = pw !== pw2;
  return (
    <div ref={root} className={dragging ? "c-drop c-dragging" : "c-drop"}>
      <Field label={m.password} value={pw} onChange={(v) => { touch(); setPw(v); }} m={m} secret singleLine />
      {pw && (
        <p role="status" className={isWeak(pw) ? "c-error" : "c-hint"}>
          {isWeak(pw) ? m.strengthWeak(estimateBits(pw)) : m.strengthOk(estimateBits(pw))}
        </p>
      )}
      <Field label={m.passwordRepeat} value={pw2} onChange={(v) => { touch(); setPw2(v); }} m={m} secret singleLine />
      <FilePicker m={m} files={files} multiple onPick={(f) => { touch(); setFiles(f); }} />
      <LargeFileNote m={m} size={files.reduce((n, f) => n + f.size, 0)} />
      <button
        type="button"
        role="switch"
        aria-checked={compress && canCompress}
        disabled={!canCompress}
        className="c-switch"
        onClick={() => { touch(); setCompress((v) => !v); }}
      >
        <span className="c-switch-box" aria-hidden="true">{compress && canCompress ? "✓" : ""}</span>
        {m.compress}
      </button>
      <div className="c-hint">{canCompress ? m.compressHint : m.compressUnsupported}</div>
      <button type="button" className="c-primary" disabled={job.busy || files.length === 0 || mismatch} onClick={go}>
        {m.encryptBtn}
      </button>
      {mismatch && pw2 !== "" && <p role="alert" className="c-error">{m.mismatch}</p>}
      <Status m={m} busy={job.busy} progress={job.progress} error={job.error} />
      {out && (
        <div className="c-field c-output">
          <p role="status" className="c-hint">{m.fileEncrypted(formatBytes(out.size))}</p>
          <div className="c-actions">
            <button type="button" onClick={() => downloadBlob(`encrypted${EFILE_EXTENSION}`, out)}>
              {m.downloadEfile}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface Decrypted {
  blob: Blob;
  meta: FileMeta;
  /** Set when the .efile held several packed files. */
  entries?: BundleEntry[];
}

function DecryptFile({ m }: { m: Messages }) {
  const [pw, setPw] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [out, setOut] = useState<Decrypted | null>(null);
  const [url, setUrl] = useState("");
  const [full, setFull] = useState(false);
  const revision = useRef(0);
  const job = useJob(m);
  const touch = () => {
    revision.current++;
    setOut(null);
    setFull(false);
  };
  const go = () => {
    if (!file) return;
    const startedAt = revision.current;
    setOut(null);
    return job.run(async (o) => {
      const result = await decryptFile(file, pw, o);
      const entries = isBundle(result.meta.type) ? await unpackBundle(result.blob) : undefined;
      if (revision.current === startedAt) setOut({ ...result, entries });
    });
  };
  const root = useRef<HTMLDivElement>(null);
  const dragging = useFileDrop(root, (f) => { touch(); setFile(f[0]); });
  const kind = out && !out.entries ? previewKind(out.meta.type) : null;
  useEffect(() => {
    if (!out || !kind) {
      setUrl("");
      return;
    }
    const u = URL.createObjectURL(out.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [out, kind]);
  return (
    <div ref={root} className={dragging ? "c-drop c-dragging" : "c-drop"}>
      <Field label={m.password} value={pw} onChange={(v) => { touch(); setPw(v); }} m={m} secret singleLine />
      <FilePicker m={m} files={file ? [file] : []} onPick={(f) => { touch(); setFile(f[0] ?? null); }} />
      <LargeFileNote m={m} size={file?.size ?? 0} />
      <button type="button" className="c-primary" disabled={job.busy || !file} onClick={go}>
        {m.decryptBtn}
      </button>
      <Status m={m} busy={job.busy} progress={job.progress} error={job.error} />
      {out?.entries && <BundleResult m={m} zip={out.blob} entries={out.entries} />}
      {out && !out.entries && (
        <div className="c-field c-output">
          <div className="c-field-head">
            <label>{m.fileResult}</label>
          </div>
          {kind !== "image" && kind !== "video" && kind !== "pdf" && (
          <dl className="c-meta">
            <dt>{m.metaName}</dt>
            <dd>{out.meta.name || "—"}</dd>
            <dt>{m.metaType}</dt>
            <dd>{out.meta.type}</dd>
            <dt>{m.metaSize}</dt>
            <dd>{formatBytes(out.meta.size)}</dd>
          </dl>
          )}
          {kind === "text" && <TextPreview blob={out.blob} m={m} />}
          {url && kind === "image" && (
            <button type="button" className="c-thumb-btn" aria-label={m.openFullscreen} onClick={() => setFull(true)}>
              <img src={url} alt="" className="c-thumb" draggable={false} />
            </button>
          )}
          {url && kind === "video" && <video src={url} className="c-thumb" controls playsInline preload="metadata" />}
          {url && kind === "pdf" && (
            <>
              <div className="c-actions">
                <button type="button" onClick={() => setFull(true)}>{m.openPdfFullscreen}</button>
              </div>
              <iframe src={url} title={m.pdfTitle} className="c-pdf" />
            </>
          )}
          {url && kind !== "pdf" && <div className="c-hint">{kind === "image" ? m.previewHint : m.previewVideoHint}</div>}
          {url && kind === "pdf" && <div className="c-hint">{m.previewPdfHint}</div>}
          <div className="c-actions">
            <button type="button" onClick={() => downloadBlob(safeFileName(out.meta.name), out.blob)}>
              {m.downloadPlain}
            </button>
          </div>
        </div>
      )}
      {full && url && kind === "image" && <ImageViewer src={url} m={m} onClose={() => setFull(false)} />}
      {full && url && kind === "pdf" && <PdfViewer src={url} m={m} onClose={() => setFull(false)} />}
    </div>
  );
}

/** Several decrypted files: every previewable one is listed, the rest are counted and downloadable. */
function BundleResult({ m, zip, entries }: { m: Messages; zip: Blob; entries: BundleEntry[] }) {
  const shown = entries.filter((e) => previewKind(e.blob.type));
  const others = entries.filter((e) => !previewKind(e.blob.type));
  const [urls, setUrls] = useState<string[]>([]);
  const [full, setFull] = useState<number | null>(null);
  useEffect(() => {
    const made = entries.filter((e) => previewKind(e.blob.type)).map((e) => URL.createObjectURL(e.blob));
    setUrls(made);
    return () => made.forEach((u) => URL.revokeObjectURL(u));
  }, [entries]);
  const fullKind = full !== null ? previewKind(shown[full].blob.type) : null;
  // Full-screen images can be paged through; PDFs and videos are skipped.
  const images = shown.flatMap((e, i) => (previewKind(e.blob.type) === "image" ? [i] : []));
  const at = full !== null ? images.indexOf(full) : -1;
  return (
    <div className="c-field c-output">
      <div className="c-actions">
        <button type="button" className="c-primary" onClick={() => downloadBlob("decrypted-files.zip", zip)}>
          {m.downloadAll(entries.length)}
        </button>
      </div>
      <div className="c-field-head">
        <label>{m.bundleResult(entries.length)}</label>
      </div>
      {shown.map((e, i) => {
        const kind = previewKind(e.blob.type);
        const url = urls[i];
        return (
          <div className="c-bundle-item" key={i}>
            <div className="c-bundle-name">
              {e.name} <span className="c-hint">({formatBytes(e.size)})</span>
            </div>
            {kind === "text" && <TextPreview blob={e.blob} m={m} />}
            {url && kind === "image" && (
              <button type="button" className="c-thumb-btn" aria-label={m.openFullscreen} onClick={() => setFull(i)}>
                <img src={url} alt="" className="c-thumb" draggable={false} />
              </button>
            )}
            {url && kind === "video" && <video src={url} className="c-thumb" controls playsInline preload="metadata" />}
            {url && kind === "pdf" && (
              <>
                <div className="c-actions">
                  <button type="button" onClick={() => setFull(i)}>{m.openPdfFullscreen}</button>
                </div>
                <iframe src={url} title={`${m.pdfTitle}: ${e.name}`} className="c-pdf" />
              </>
            )}
            <div className="c-actions">
              <button type="button" onClick={() => downloadBlob(e.name, e.blob)}>
                {m.downloadOne}
              </button>
            </div>
          </div>
        );
      })}
      {others.length > 0 && (
        <div className="c-bundle-item">
          <p role="note" className="c-warn">{m.unpreviewable(others.length, shown.length > 0)}</p>
          <ul className="c-file-list">
            {others.map((e, i) => (
              <li key={i}>
                <span className="c-file-name">{e.name}</span>
                <span className="c-hint c-file-size">({formatBytes(e.size)})</span>
                <button type="button" onClick={() => downloadBlob(e.name, e.blob)}>
                  {m.downloadOne}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {shown.some((e) => previewKind(e.blob.type) === "image") && <div className="c-hint">{m.previewHint}</div>}
      {shown.some((e) => previewKind(e.blob.type) === "pdf") && <div className="c-hint">{m.previewPdfHint}</div>}
      {full !== null && urls[full] && fullKind === "image" && (
        <ImageViewer
          src={urls[full]}
          m={m}
          onClose={() => setFull(null)}
          onPrev={at > 0 ? () => setFull(images[at - 1]) : undefined}
          onNext={at >= 0 && at < images.length - 1 ? () => setFull(images[at + 1]) : undefined}
          position={images.length > 1 ? `${at + 1} / ${images.length}` : undefined}
        />
      )}
      {full !== null && urls[full] && fullKind === "pdf" && <PdfViewer src={urls[full]} m={m} onClose={() => setFull(null)} />}
    </div>
  );
}
