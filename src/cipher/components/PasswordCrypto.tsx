import { useState } from "react";
import type { Messages } from "../i18n";
import { decryptTextWithPassword, encryptTextWithPassword, type PasswordOptions } from "../crypto/password";
import { workerKdf } from "../workers/kdfClient";
import { Field, Output, Tabs } from "./Fields";
import { errorText } from "./errorText";
import { estimateBits, isWeak } from "../crypto/strength";

type Tab = "encrypt" | "decrypt";

const options: PasswordOptions = { kdf: workerKdf };

export function PasswordCrypto({ m }: { m: Messages }) {
  const [tab, setTab] = useState<Tab>("encrypt");
  const tabs = [
    { id: "encrypt", label: m.tabEncrypt, content: <Encrypt m={m} /> },
    { id: "decrypt", label: m.tabDecrypt, content: <Decrypt m={m} /> },
  ];
  return (
    <section>
      <p className="c-intro">{m.pwIntro}</p>
      <Tabs label={m.modulePw} tabs={tabs} active={tab} onChange={(t) => setTab(t as Tab)} />
    </section>
  );
}

function Encrypt({ m }: { m: Messages }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [text, setText] = useState("");
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const go = async () => {
    setError("");
    setOut("");
    if (pw !== pw2) return setError(m.mismatch);
    setBusy(true);
    try {
      setOut(await encryptTextWithPassword(text, pw, options));
    } catch (e) {
      setError(errorText(e, m));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <Field label={m.password} value={pw} onChange={setPw} m={m} secret singleLine />
      {pw && (
        <p role="status" className={isWeak(pw) ? "c-error" : "c-hint"}>
          {isWeak(pw) ? m.strengthWeak(estimateBits(pw)) : m.strengthOk(estimateBits(pw))}
        </p>
      )}
      <Field label={m.passwordRepeat} value={pw2} onChange={setPw2} m={m} secret singleLine />
      <Field label={m.plaintext} value={text} onChange={setText} m={m} rows={5} />
      <button type="button" className="c-primary" disabled={busy} onClick={go}>
        {m.encryptBtn}
      </button>
      {busy && <p role="status" className="c-hint">{m.working}</p>}
      {error && <p role="alert" className="c-error">{error}</p>}
      <Output label={m.ciphertext} value={out} m={m} downloadName="cipher-message.txt" />
    </div>
  );
}

function Decrypt({ m }: { m: Messages }) {
  const [pw, setPw] = useState("");
  const [ct, setCt] = useState("");
  const [out, setOut] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const go = async () => {
    setError("");
    setOut(null);
    setBusy(true);
    try {
      setOut(await decryptTextWithPassword(ct, pw, options));
    } catch (e) {
      setError(errorText(e, m));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <Field label={m.password} value={pw} onChange={setPw} m={m} secret singleLine />
      <Field label={m.ciphertext} value={ct} onChange={setCt} m={m} rows={5} />
      <button type="button" className="c-primary" disabled={busy} onClick={go}>
        {m.decryptBtn}
      </button>
      {busy && <p role="status" className="c-hint">{m.working}</p>}
      {error && <p role="alert" className="c-error">{error}</p>}
      {out === "" && <p className="c-hint">{m.result}: ∅</p>}
      {out && <Output label={m.result} value={out} m={m} />}
    </div>
  );
}
