import { useEffect, useRef, useState, type RefObject } from "react";
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
import { workerKdf } from "../workers/kdfClient";
import { downloadBlob } from "../output";
import { ACTIVITY_EVENT } from "../wipe";
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

/**
 * Accepts a file dropped anywhere on the page while `ref`'s panel is the visible one. A file dropped
 * elsewhere is swallowed too, so a stray drop never navigates away and loses what was typed.
 */
function useFileDrop(ref: RefObject<HTMLElement | null>, onPick: (f: File) => void) {
  const [dragging, setDragging] = useState(false);
  const pick = useRef(onPick);
  useEffect(() => {
    pick.current = onPick;
  });
  useEffect(() => {
    const active = () => !!ref.current && !ref.current.closest("[hidden]");
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragging(active());
    };
    const leave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer?.files[0];
      if (f && active()) pick.current(f);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [ref]);
  return dragging;
}

const LARGE_FILE_BYTES = 100 * 1024 * 1024;

function LargeFileNote({ m, file }: { m: Messages; file: File | null }) {
  if (!file || file.size <= LARGE_FILE_BYTES) return null;
  return (
    <p role="note" className="c-warn">
      {m.largeFile(formatBytes(file.size))}
    </p>
  );
}

function FilePicker({ m, file, onPick }: { m: Messages; file: File | null; onPick: (f: File | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="c-field">
      <input
        ref={input}
        type="file"
        className="c-file-input"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
      <button type="button" onClick={() => input.current?.click()}>
        {m.chooseFile}
      </button>
      <div className="c-hint">{file ? m.selectedFile(file.name, formatBytes(file.size)) : m.noFile}</div>
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
  const [file, setFile] = useState<File | null>(null);
  const [compress, setCompress] = useState(false);
  const [out, setOut] = useState<Blob | null>(null);
  const revision = useRef(0);
  const job = useJob(m);
  const root = useRef<HTMLDivElement>(null);
  const dragging = useFileDrop(root, (f) => { touch(); setFile(f); });
  const canCompress = compressionSupported();
  const touch = () => {
    revision.current++;
    setOut(null);
  };
  const go = () => {
    if (!file) return;
    if (pw !== pw2) return;
    const startedAt = revision.current;
    setOut(null);
    return job.run(async (o) => {
      const blob = await encryptFile(file, pw, { ...o, compress: compress && canCompress });
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
      <FilePicker m={m} file={file} onPick={(f) => { touch(); setFile(f); }} />
      <LargeFileNote m={m} file={file} />
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
      <button type="button" className="c-primary" disabled={job.busy || !file || mismatch} onClick={go}>
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

function DecryptFile({ m }: { m: Messages }) {
  const [pw, setPw] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [out, setOut] = useState<{ blob: Blob; meta: FileMeta } | null>(null);
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
      if (revision.current === startedAt) setOut(result);
    });
  };
  const root = useRef<HTMLDivElement>(null);
  const dragging = useFileDrop(root, (f) => { touch(); setFile(f); });
  const kind = out ? previewKind(out.meta.type) : null;
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
      <FilePicker m={m} file={file} onPick={(f) => { touch(); setFile(f); }} />
      <LargeFileNote m={m} file={file} />
      <button type="button" className="c-primary" disabled={job.busy || !file} onClick={go}>
        {m.decryptBtn}
      </button>
      <Status m={m} busy={job.busy} progress={job.progress} error={job.error} />
      {out && (
        <div className="c-field c-output">
          <div className="c-field-head">
            <label>{m.fileResult}</label>
          </div>
          {!kind && (
          <dl className="c-meta">
            <dt>{m.metaName}</dt>
            <dd>{out.meta.name || "—"}</dd>
            <dt>{m.metaType}</dt>
            <dd>{out.meta.type}</dd>
            <dt>{m.metaSize}</dt>
            <dd>{formatBytes(out.meta.size)}</dd>
          </dl>
          )}
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
