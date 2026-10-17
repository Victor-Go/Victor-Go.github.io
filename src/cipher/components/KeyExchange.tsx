import { useState } from "react";
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
  const [out, setOut] = useState("");
  const [generated, setGenerated] = useState(false);
  const { busy, error, run } = useAction(m);
  return (
    <div>
      <Field label={m.recipientPublicKey} value={pub} onChange={setPub} m={m} rows={4} />
      <Field
        label={m.plaintext}
        value={text}
        onChange={(v) => {
          setText(v);
          setGenerated(false);
        }}
        m={m}
        rows={5}
        action={
          <button
            type="button"
            className="c-link"
            onClick={() => {
              setText(generateMnemonicPassword());
              setGenerated(true);
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
        onClick={() => run(async () => setOut(await encryptTextForPublicKey(pub, text)))}
      >
        {m.encryptBtn}
      </button>
      {error && <p role="alert" className="c-error">{error}</p>}
      <Output label={m.ciphertext} value={out} m={m} downloadName="cipher-message.txt" />
    </div>
  );
}

function Decrypt({ m, priv, setPriv }: { m: Messages; priv: string; setPriv: (v: string) => void }) {
  const [ct, setCt] = useState("");
  const [out, setOut] = useState<string | null>(null);
  const { busy, error, run, setError } = useAction(m);
  return (
    <div>
      <Field label={m.yourPrivateKey} value={priv} onChange={setPriv} m={m} secret rows={2} />
      <Field label={m.ciphertext} value={ct} onChange={setCt} m={m} rows={5} />
      <button
        type="button"
        className="c-primary"
        disabled={busy}
        onClick={() => {
          setOut(null);
          setError("");
          void run(async () => setOut(await decryptTextWithPrivateKey(priv, ct)));
        }}
      >
        {m.decryptBtn}
      </button>
      {error && <p role="alert" className="c-error">{error}</p>}
      {out !== null && <PlainResult label={m.result} value={out} m={m} />}
    </div>
  );
}

/** Plaintext may legitimately be empty, so it gets its own always-rendered box. */
function PlainResult({ label, value, m }: { label: string; value: string; m: Messages }) {
  return value === "" ? <p className="c-hint">{label}: ∅</p> : <Output label={label} value={value} m={m} />;
}
