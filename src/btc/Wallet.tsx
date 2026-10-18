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
  return <Tabs label={m.btcTitle} tabs={tabs} active={tab} onChange={(t) => setTab(t as Tab)} />;
}

function Addresses({ list, m }: { list: Address[]; m: Messages }) {
  return (
    <>
      <Output label={m.addresses} value={list.map((a) => a.address).join("\n")} m={m} rows={list.length} />
      <p className="c-hint">{m.addrPath}</p>
      <Output label={m.privKeys} value={list.map((a) => a.wif).join("\n")} m={m} secret rows={list.length} />
    </>
  );
}

function NewWallet({ m }: { m: Messages }) {
  const [extra, setExtra] = useState("");
  const [phrase, setPhrase] = useState("");
  const [list, setList] = useState<Address[]>([]);
  const [error, setError] = useState("");
  const go = () => {
    setError("");
    try {
      const mnemonic = generateMnemonic24(extra);
      setPhrase(mnemonic);
      setList(deriveAddresses(mnemonic));
    } catch {
      setPhrase("");
      setList([]);
      setError(m.randomFailed);
    }
  };
  return (
    <div>
      <Field label={m.extraLabel} value={extra} onChange={setExtra} m={m} rows={2} />
      <p className="c-hint">{m.extraHint}</p>
      <button type="button" className="c-primary" onClick={go}>
        {m.generateWallet}
      </button>
      {error && <p role="alert" className="c-error">{error}</p>}
      {phrase && (
        <>
          <Output label={m.mnemonic} value={phrase} m={m} secret rows={4} />
          <p className="c-warn">{m.mnemonicWarn}</p>
          <p className="c-warn">{m.addrWarn}</p>
          <Addresses list={list} m={m} />
        </>
      )}
    </div>
  );
}

function Restore({ m }: { m: Messages }) {
  const [text, setText] = useState("");
  const [list, setList] = useState<Address[] | null>(null);
  const [error, setError] = useState("");
  const go = () => {
    if (!isValidMnemonic24(text)) {
      setList(null);
      return setError(m.invalidMnemonic);
    }
    setError("");
    setList(deriveAddresses(text));
  };
  return (
    <div>
      <Field label={m.mnemonicInput} value={text} onChange={setText} m={m} secret rows={4} />
      <button type="button" className="c-primary" onClick={go}>
        {m.restoreBtn}
      </button>
      {error && <p role="alert" className="c-error">{error}</p>}
      {list && (
        <>
          <p className="c-hint" role="status">{m.validMnemonic}</p>
          <Addresses list={list} m={m} />
        </>
      )}
    </div>
  );
}
