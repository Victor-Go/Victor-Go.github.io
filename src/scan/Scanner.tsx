import { useEffect, useRef, useState } from "react";
import { Field, Output } from "../cipher/components/Fields";
import {
  BadResponseError,
  NetworkError,
  NotFoundError,
  lookupAddress,
  lookupTx,
  type AddressResult,
  type TxInfo,
  type TxIO,
  type TxResult,
} from "./api";
import { classify, formatBtc, type DerivedAddress } from "./query";
import type { Messages } from "./i18n";

const MAX_ROWS = 50;

type Result =
  | { kind: "tx"; data: TxResult }
  | { kind: "address"; data: AddressResult }
  | { kind: "pubkey"; data: { type: DerivedAddress["type"]; result: AddressResult }[] };

export function Scanner({ m }: { m: Messages }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const ctl = useRef<AbortController | null>(null);

  // Leaving the page (or the wipe remounting this component) cancels anything in flight.
  useEffect(() => () => ctl.current?.abort(), []);

  const query = classify(text);

  const run = async (input: string) => {
    const q = classify(input);
    setResult(null);
    if (q.kind === "invalid") {
      setError(q.reason === "empty" ? m.errEmpty : q.reason === "pubkey" ? m.errPubkey : m.errFormat);
      return;
    }
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setError("");
    setBusy(true);
    try {
      if (q.kind === "tx") setResult({ kind: "tx", data: await lookupTx(q.txid, c.signal) });
      else if (q.kind === "address") setResult({ kind: "address", data: await lookupAddress(q.address, c.signal) });
      else {
        const all = await Promise.all(
          q.addresses.map(async (a) => ({ type: a.type, result: await lookupAddress(a.address, c.signal) })),
        );
        setResult({ kind: "pubkey", data: all });
      }
    } catch (e) {
      if (c.signal.aborted) return;
      setError(
        e instanceof NotFoundError
          ? m.errNotFound
          : e instanceof NetworkError
            ? m.errNetwork
            : e instanceof BadResponseError
              ? m.errBad
              : m.errRetry,
      );
    } finally {
      if (ctl.current === c) setBusy(false);
    }
  };

  // Clicking an address or txid inside a result looks that one up.
  const follow = (value: string) => {
    setText(value);
    void run(value);
  };

  const kindLabel =
    query.kind === "tx" ? m.kindTx : query.kind === "address" ? m.kindAddress : query.kind === "pubkey" ? m.kindPubkey : "";

  return (
    <div className="c-panel s-panel">
      <Field label={m.inputLabel} value={text} onChange={setText} m={m} rows={3} />
      <p className="c-hint">{m.inputHint}</p>
      {kindLabel && (
        <p className="c-hint" role="status">
          {m.detected}
          {kindLabel}
        </p>
      )}
      <button type="button" className="c-primary" disabled={busy} onClick={() => void run(text)}>
        {busy ? m.searching : m.search}
      </button>
      {error && <p role="alert" className="c-error">{error}</p>}
      {result?.kind === "tx" && <TxCard data={result.data} m={m} follow={follow} />}
      {result?.kind === "address" && <AddressCard data={result.data} m={m} follow={follow} />}
      {result?.kind === "pubkey" && (
        <>
          <p className="c-hint">{m.pubkeyNote}</p>
          <div className="c-cols">
            {result.data.map((r) => (
              <AddressCard key={r.type} data={r.result} label={m.typeLabel(r.type)} m={m} follow={follow} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

type Follow = (value: string) => void;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="s-kv">
      <span className="s-k">{label}</span>
      <span className="s-v">{children}</span>
    </div>
  );
}

function Link({ value, m, follow, children }: { value: string; m: Messages; follow: Follow; children?: React.ReactNode }) {
  return (
    <button type="button" className="c-link s-mono" title={m.lookupThis} onClick={() => follow(value)}>
      {children ?? value}
    </button>
  );
}

function IoList({ rows, title, m, follow }: { rows: TxIO[]; title: string; m: Messages; follow: Follow }) {
  return (
    <section className="s-io" aria-label={title}>
      <p className="b-group-title">{title}</p>
      {rows.slice(0, MAX_ROWS).map((r, i) => (
        <div key={i} className="s-io-row">
          <span className="s-io-addr">
            {r.coinbase ? m.coinbase : r.address ? <Link value={r.address} m={m} follow={follow} /> : m.noAddress}
          </span>
          {!r.coinbase && <span className="s-amount">{formatBtc(r.value)}</span>}
        </div>
      ))}
      {rows.length > MAX_ROWS && <p className="c-hint">{m.moreRows(rows.length - MAX_ROWS)}</p>}
    </section>
  );
}

function feeRate(tx: TxInfo): string | undefined {
  if (tx.fee === undefined || tx.weight === 0) return undefined;
  return (tx.fee / (tx.weight / 4)).toFixed(2);
}

function TxCard({ data, m, follow }: { data: TxResult; m: Messages; follow: Follow }) {
  const { tx, confirmations } = data;
  const rate = feeRate(tx);
  return (
    <article className="b-card" aria-label={m.txTitle}>
      <header className="b-card-head">
        <strong>{m.txTitle}</strong>
      </header>
      <Output label={m.txid} value={tx.txid} m={m} rows={2} />
      <Row label={m.status}>{tx.confirmed ? m.statusConfirmed(confirmations) : m.statusUnconfirmed}</Row>
      {tx.confirmed && tx.height !== undefined && <Row label={m.block}>{tx.height}</Row>}
      {tx.time !== undefined && <Row label={m.time}>{new Date(tx.time * 1000).toLocaleString()}</Row>}
      {tx.fee !== undefined && (
        <Row label={m.fee}>
          {formatBtc(tx.fee)} BTC{rate && ` (${m.feeRate(rate)})`}
        </Row>
      )}
      <Row label={m.size}>{m.sizeValue(tx.size, tx.weight)}</Row>
      <div className="c-cols">
        <IoList rows={tx.vin} title={m.inputs(tx.vin.length)} m={m} follow={follow} />
        <IoList rows={tx.vout} title={m.outputs(tx.vout.length)} m={m} follow={follow} />
      </div>
    </article>
  );
}

function AddressCard({ data, label, m, follow }: { data: AddressResult; label?: string; m: Messages; follow: Follow }) {
  return (
    <article className="b-card" aria-label={label ?? m.addrTitle}>
      <header className="b-card-head">
        <strong>{label ?? m.addrTitle}</strong>
      </header>
      <Output label={m.addrTitle} value={data.address} m={m} rows={1} />
      <Row label={m.balance}>{formatBtc(data.balance)} BTC</Row>
      {data.unconfirmed !== 0 && <Row label={m.pending}>{formatBtc(data.unconfirmed)} BTC</Row>}
      <Row label={m.received}>{formatBtc(data.received)} BTC</Row>
      <Row label={m.txCount}>{data.txCount}</Row>
      {data.txCount === 0 ? (
        <p className="c-hint">{m.noTxs}</p>
      ) : (
        <section aria-label={m.recentTxs(data.txs.length, data.txCount)}>
          <p className="b-group-title">{m.recentTxs(data.txs.length, data.txCount)}</p>
          {data.txs.map(({ tx, net }) => (
            <div key={tx.txid} className="s-io-row">
              <span className="s-io-addr">
                <Link value={tx.txid} m={m} follow={follow} />
                <span className="c-hint">
                  {tx.confirmed ? ` #${tx.height}` : ` ${m.unconfirmedMark}`}
                </span>
              </span>
              <span className={net >= 0 ? "s-amount s-pos" : "s-amount s-neg"}>
                {net > 0 ? "+" : ""}
                {formatBtc(net)}
              </span>
            </div>
          ))}
        </section>
      )}
    </article>
  );
}
