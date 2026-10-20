import { useRef, useState } from "react";
import type { Messages } from "../i18n";
import {
  decryptTextWithPrivateKey,
  encryptTextForPublicKey,
  generateKeyPair,
  type KeyPair,
} from "../crypto/kem";
import { Field, Output, Tabs } from "./Fields";
import { errorText } from "./errorText";
import { generateMnemonicPassword } from "../crypto/mnemonic";

type Tab = "generate" | "encrypt" | "decrypt";

/** Runs an async crypto action, tracking busy/error state. Errors never include input. */
function useAction(m: Messages) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e, m));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run, setError };
}

export function KeyExchange({ m }: { m: Messages }) {
  const [tab, setTab] = useState<Tab>("generate");
  // Lifted so a freshly generated private key can be dropped into the Decrypt tab once.
  const [priv, setPriv] = useState("");
  const tabs = [
    { id: "generate", label: m.tabGenerate, content: <Generate m={m} onGenerated={(p) => setPriv(p.privateText)} /> },
    { id: "encrypt", label: m.tabEncrypt, content: <Encrypt m={m} /> },
    { id: "decrypt", label: m.tabDecrypt, content: <Decrypt m={m} priv={priv} setPriv={setPriv} /> },
  ];
  return (
    <section>
      <p className="c-intro">{m.kxIntro}</p>
      <Tabs label={m.moduleKx} tabs={tabs} active={tab} onChange={(t) => setTab(t as Tab)} />
    </section>
  );
}

function Generate({ m, onGenerated }: { m: Messages; onGenerated: (pair: KeyPair) => void }) {
  const [pair, setPair] = useState<KeyPair | null>(null);
  const { busy, error, run } = useAction(m);
  return (
    <div>
      <button type="button" className="c-primary" disabled={busy} onClick={() =>
          run(async () => {
            const p = await generateKeyPair();
            setPair(p);
            onGenerated(p);
          })
        }>
        {m.generate}
      </button>
      {error && <p role="alert" className="c-error">{error}</p>}
      {pair && (
        <>
          <Output label={m.publicKey} value={pair.publicText} m={m} rows={6} />
          <Output label={m.privateKey} value={pair.privateText} m={m} secret rows={3} />
          <p className="c-hint" role="status">{m.privateAutofilled}</p>
          <p className="c-warn">{m.privateWarn}</p>
        </>
      )}
    </div>
  );
}

function Encrypt({ m }: { m: Messages }) {
  const [pub, setPub] = useState("");
  const [text, setText] = useState("");
  const [out, setOut] = useState<{ pub: string; text: string; value: string } | null>(null);
  const revision = useRef(0);
  const [generated, setGenerated] = useState(false);
  const { busy, error, run } = useAction(m);
  return (
    <div>
      <Field label={m.recipientPublicKey} value={pub} onChange={(value) => { revision.current++; setPub(value); setOut(null); }} m={m} rows={4} />
      <Field
        label={m.plaintext}
        value={text}
        onChange={(v) => {
          revision.current++;
          setText(v);
          setGenerated(false);
          setOut(null);
        }}
        m={m}
        tall
        action={
          <button
            type="button"
            className="c-link"
            onClick={() => {
              revision.current++;
              setText(generateMnemonicPassword());
              setGenerated(true);
              setOut(null);
            }}
          >
            {m.genPassword}
          </button>
        }
      />
      {generated && <p className="c-hint" role="status">{m.genPasswordDone}</p>}
      <button
        type="button"
        className="c-primary"
        disabled={busy}
        onClick={() => {
          const startedAt = revision.current;
          void run(async () => {
            const value = await encryptTextForPublicKey(pub, text);
            if (revision.current === startedAt) setOut({ pub, text, value });
          });
        }}
      >
        {m.encryptBtn}
      </button>
      {error && <p role="alert" className="c-error">{error}</p>}
      <Output label={m.ciphertext} value={out && out.pub === pub && out.text === text ? out.value : ""} m={m} downloadName="cipher-message.txt" tall />
    </div>
  );
}

function Decrypt({ m, priv, setPriv }: { m: Messages; priv: string; setPriv: (v: string) => void }) {
  const [ct, setCt] = useState("");
  const [out, setOut] = useState<{ priv: string; ct: string; value: string } | null>(null);
  const revision = useRef(0);
  const { busy, error, run, setError } = useAction(m);
  return (
    <div>
      <Field label={m.yourPrivateKey} value={priv} onChange={(value) => { revision.current++; setPriv(value); setOut(null); }} m={m} secret rows={2} />
      <Field label={m.ciphertext} value={ct} onChange={(value) => { revision.current++; setCt(value); setOut(null); }} m={m} tall />
      <button
        type="button"
        className="c-primary"
        disabled={busy}
        onClick={() => {
          const startedAt = revision.current;
          setOut(null);
          setError("");
          void run(async () => {
            const value = await decryptTextWithPrivateKey(priv, ct);
            if (revision.current === startedAt) setOut({ priv, ct, value });
          });
        }}
      >
        {m.decryptBtn}
      </button>
      {error && <p role="alert" className="c-error">{error}</p>}
      {out && out.priv === priv && out.ct === ct && <PlainResult label={m.result} value={out.value} m={m} />}
    </div>
  );
}

/** Plaintext may legitimately be empty, so it gets its own always-rendered box. */
function PlainResult({ label, value, m }: { label: string; value: string; m: Messages }) {
  return value === "" ? <p className="c-hint">{label}: ∅</p> : <Output label={label} value={value} m={m} tall />;
}
