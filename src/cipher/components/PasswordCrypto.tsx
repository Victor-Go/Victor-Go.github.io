import { useRef, useState } from "react";
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
  const [out, setOut] = useState<{ pw: string; pw2: string; text: string; value: string } | null>(null);
  const revision = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const go = async () => {
    const startedAt = revision.current;
    setError("");
    setOut(null);
    if (pw !== pw2) return setError(m.mismatch);
    setBusy(true);
    try {
      const value = await encryptTextWithPassword(text, pw, options);
      if (revision.current === startedAt) setOut({ pw, pw2, text, value });
    } catch (e) {
      setError(errorText(e, m));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <Field label={m.password} value={pw} onChange={(value) => { revision.current++; setPw(value); setOut(null); }} m={m} secret singleLine />
      {pw && (
        <p role="status" className={isWeak(pw) ? "c-error" : "c-hint"}>
          {isWeak(pw) ? m.strengthWeak(estimateBits(pw)) : m.strengthOk(estimateBits(pw))}
        </p>
      )}
      <Field label={m.passwordRepeat} value={pw2} onChange={(value) => { revision.current++; setPw2(value); setOut(null); }} m={m} secret singleLine />
      <Field label={m.plaintext} value={text} onChange={(value) => { revision.current++; setText(value); setOut(null); }} m={m} rows={5} />
      <button type="button" className="c-primary" disabled={busy} onClick={go}>
        {m.encryptBtn}
      </button>
      {busy && <p role="status" className="c-hint">{m.working}</p>}
      {error && <p role="alert" className="c-error">{error}</p>}
      <Output label={m.ciphertext} value={out && out.pw === pw && out.pw2 === pw2 && out.text === text ? out.value : ""} m={m} downloadName="cipher-message.txt" />
    </div>
  );
}

function Decrypt({ m }: { m: Messages }) {
  const [pw, setPw] = useState("");
  const [ct, setCt] = useState("");
  const [out, setOut] = useState<{ pw: string; ct: string; value: string } | null>(null);
  const revision = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const go = async () => {
    const startedAt = revision.current;
    setError("");
    setOut(null);
    setBusy(true);
    try {
      const value = await decryptTextWithPassword(ct, pw, options);
      if (revision.current === startedAt) setOut({ pw, ct, value });
    } catch (e) {
      setError(errorText(e, m));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <Field label={m.password} value={pw} onChange={(value) => { revision.current++; setPw(value); setOut(null); }} m={m} secret singleLine />
      <Field label={m.ciphertext} value={ct} onChange={(value) => { revision.current++; setCt(value); setOut(null); }} m={m} rows={5} />
      <button type="button" className="c-primary" disabled={busy} onClick={go}>
        {m.decryptBtn}
      </button>
      {busy && <p role="status" className="c-hint">{m.working}</p>}
      {error && <p role="alert" className="c-error">{error}</p>}
      {out && out.pw === pw && out.ct === ct && out.value === "" && <p className="c-hint">{m.result}: ∅</p>}
      {out && out.pw === pw && out.ct === ct && <Output label={m.result} value={out.value} m={m} />}
    </div>
  );
}
