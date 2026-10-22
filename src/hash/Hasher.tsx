import { useId, useRef, useState } from "react";
import { Field, Output, Tabs } from "../cipher/components/Fields";
import { ALGORITHMS, DEFAULT_ALGORITHM, hashHex } from "./hash";
import type { Messages } from "./i18n";

type Tab = "text" | "file";

/** Files are read fully into memory, so cap them. */
export const MAX_FILE_MB = 200;

export function Hasher({ m }: { m: Messages }) {
  const [tab, setTab] = useState<Tab>("text");
  const [algo, setAlgo] = useState(DEFAULT_ALGORITHM);
  const selectId = useId();
  const current = ALGORITHMS.find((a) => a.id === algo)!;
  const tabs = [
    { id: "text", label: m.tabText, content: <TextHash m={m} algo={algo} /> },
    { id: "file", label: m.tabFile, content: <FileHash m={m} algo={algo} /> },
  ];
  return (
    <>
      <div className="c-field">
        <label htmlFor={selectId}>{m.algoLabel}</label>
        <select id={selectId} className="h-select" value={algo} onChange={(e) => setAlgo(e.target.value)}>
          {ALGORITHMS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
        {current.weak && <div className="c-hint">{m.weakWarn(current.label)}</div>}
      </div>
      <Tabs label={m.hashTitle} tabs={tabs} active={tab} onChange={(t) => setTab(t as Tab)} className="c-modes" />
    </>
  );
}

function Digests({ hex, m }: { hex: string; m: Messages }) {
  return (
    <>
      <Output label={m.hashLower} value={hex} m={m} rows={2} />
      <Output label={m.hashUpper} value={hex.toUpperCase()} m={m} rows={2} />
    </>
  );
}

function TextHash({ m, algo }: { m: Messages; algo: string }) {
  const [text, setText] = useState("");
  return (
    <>
      <Field label={m.textLabel} value={text} onChange={setText} m={m} tall />
      {text !== "" && <Digests hex={hashHex(algo, text)} m={m} />}
    </>
  );
}

function FileHash({ m, algo }: { m: Messages; algo: string }) {
  const input = useRef<HTMLInputElement>(null);
  // The bytes are kept so switching algorithm re-hashes without picking the file again.
  const [data, setData] = useState<{ name: string; bytes: Uint8Array } | null>(null);
  const [error, setError] = useState("");

  const pick = async (file: File | undefined) => {
    setData(null);
    setError("");
    if (!file) return;
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setError(m.fileTooBig(MAX_FILE_MB));
      return;
    }
    try {
      setData({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
    } catch {
      setError(m.fileFailed);
    }
  };

  return (
    <>
      <div className="c-field h-file">
        <button type="button" onClick={() => input.current?.click()}>
          {m.fileLabel}
        </button>
        <span className="h-file-name">{data ? m.fileInfo(data.name, data.bytes.length) : m.noFile}</span>
        <input
          ref={input}
          type="file"
          hidden
          aria-label={m.fileLabel}
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      {error && <p role="alert" className="c-error">{error}</p>}
      {data && <Digests hex={hashHex(algo, data.bytes)} m={m} />}
    </>
  );
}
