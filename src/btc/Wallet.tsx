import { useState } from "react";
import { Field, Output, Tabs } from "../cipher/components/Fields";
import { deriveAddresses, generateMnemonic24, isValidMnemonic24, type Address } from "./crypto/wallet";
import type { Messages } from "./i18n";

type Tab = "new" | "restore";

export function Wallet({ m }: { m: Messages }) {
  const [tab, setTab] = useState<Tab>("new");
  const tabs = [
    { id: "new", label: m.tabNew, content: <NewWallet m={m} /> },
    { id: "restore", label: m.tabRestore, content: <Restore m={m} /> },
  ];
  return <Tabs label={m.btcTitle} tabs={tabs} active={tab} onChange={(t) => setTab(t as Tab)} className="c-modes" />;
}

function Addresses({ list, m }: { list: Address[]; m: Messages }) {
  return (
    <section className="b-group" aria-label={m.addresses}>
      <p className="b-group-title">{m.addresses}</p>
      <p className="c-hint">{m.addrPath}</p>
      <div className="c-cols">
        {list.map((a) => (
          <article key={a.index} className="b-card">
            <header className="b-card-head">
              <strong>{m.cardTitle(a.index)}</strong>
              <code>{a.path}</code>
            </header>
            <Output label={m.receiveAddress} value={a.address} m={m} rows={1} />
            <div className="b-key">
              <Output label={m.keyLabel} value={a.wif} m={m} secret rows={1} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function NewWallet({ m }: { m: Messages }) {
  const [extra, setExtra] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [phrase, setPhrase] = useState("");
  const [usedPassphrase, setUsedPassphrase] = useState(false);
  const [list, setList] = useState<Address[]>([]);
  const [error, setError] = useState("");

  // Shown addresses belong to the passphrase they were made with, so editing it clears them.
  const clear = () => {
    setPhrase("");
    setList([]);
    setError("");
  };

  const go = () => {
    setError("");
    // A typo here would silently create a different wallet, so it must be typed twice.
    if (passphrase !== "" && passphrase !== confirm) {
      clear();
      setError(m.passphraseMismatch);
      return;
    }
    try {
      const mnemonic = generateMnemonic24(extra);
      setPhrase(mnemonic);
      setList(deriveAddresses(mnemonic, 5, passphrase));
      setUsedPassphrase(passphrase !== "");
    } catch {
      clear();
      setError(m.randomFailed);
    }
  };
  return (
    <div>
      <Field label={m.extraLabel} value={extra} onChange={setExtra} m={m} rows={2} />
      <p className="c-hint">{m.extraHint}</p>
      <Field
        label={m.passphraseLabel}
        value={passphrase}
        onChange={(v) => {
          setPassphrase(v);
          clear();
        }}
        m={m}
        secret
        singleLine
      />
      <p className="c-hint">{m.passphraseHint}</p>
      {passphrase !== "" && (
        <Field
          label={m.passphraseConfirmLabel}
          value={confirm}
          onChange={(v) => {
            setConfirm(v);
            clear();
          }}
          m={m}
          secret
          singleLine
        />
      )}
      <button type="button" className="c-primary" onClick={go}>
        {m.generateWallet}
      </button>
      {error && <p role="alert" className="c-error">{error}</p>}
      {phrase && (
        <>
          <Output label={m.mnemonic} value={phrase} m={m} secret rows={4} />
          <p className="c-warn">{m.mnemonicWarn}</p>
          {usedPassphrase && <p className="c-warn">{m.passphraseUsed}</p>}
          <p className="c-warn">{m.addrWarn}</p>
          <Addresses list={list} m={m} />
        </>
      )}
    </div>
  );
}

function Restore({ m }: { m: Messages }) {
  const [text, setText] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [result, setResult] = useState<{ mnemonic: string; passphrase: string; addresses: Address[] } | null>(null);
  const [error, setError] = useState("");
  const go = () => {
    if (!isValidMnemonic24(text)) {
      setResult(null);
      return setError(m.invalidMnemonic);
    }
    setError("");
    setResult({ mnemonic: text, passphrase, addresses: deriveAddresses(text, 5, passphrase) });
  };
  return (
    <div>
      <Field label={m.mnemonicInput} value={text} onChange={(value) => {
        setText(value);
        setResult(null);
        setError("");
      }} m={m} secret rows={4} />
      <Field label={m.passphraseLabel} value={passphrase} onChange={(value) => {
        setPassphrase(value);
        setResult(null);
        setError("");
      }} m={m} secret singleLine />
      <p className="c-hint">{m.restorePassphraseHint}</p>
      <button type="button" className="c-primary" onClick={go}>
        {m.restoreBtn}
      </button>
      {error && <p role="alert" className="c-error">{error}</p>}
      {result && result.mnemonic === text && result.passphrase === passphrase && (
        <>
          <p className="c-hint" role="status">{m.validMnemonic}</p>
          <Addresses list={result.addresses} m={m} />
        </>
      )}
    </div>
  );
}
