#!/usr/bin/env node
// The operator's tool for the signed address list (src/chat/net/endpoints.ts). The private key never goes in the repository.
//
//   node scripts/chat-endpoints.mjs keygen  <private-key.pem>            makes a key pair; prints the PUBLIC key for the build
//   node scripts/chat-endpoints.mjs sign    <private-key.pem> [options]   writes public/chat/endpoints.json (signed, seq = previous + 1)
//        --api  https://api.example.com,https://api2.example.com         (default: the addresses already in the file)
//        --ws   wss://ws.example.com,wss://ws2.example.com
//   node scripts/chat-endpoints.mjs verify  <public-key-base64>           checks public/chat/endpoints.json
//
// The signed text must stay the same as `canonical()` in src/chat/net/endpoints.ts.

import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const FILE = fileURLToPath(new URL("../public/chat/endpoints.json", import.meta.url));

const canonical = (e) => ["chat-endpoints-v1", String(e.seq), e.api.join(","), e.ws.join(",")].join("\n");
const rawPublic = (publicKey) => Buffer.from(publicKey.export({ format: "jwk" }).x, "base64url");
const list = (v) => (v ?? "").split(/[\s,]+/).filter(Boolean);
const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};
const read = () => (existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : { v: 1, seq: 0, api: [], ws: [] });
const options = (argv) => {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith("--")) fail(`unexpected ${argv[i]}`);
    out[argv[i].slice(2)] = argv[i + 1];
  }
  return out;
};

const [cmd, arg, ...rest] = process.argv.slice(2);

if (cmd === "keygen") {
  if (!arg) fail("usage: keygen <private-key.pem>");
  if (existsSync(arg)) fail(`${arg} exists; it is not overwritten (that would lose the key the pages trust)`);
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  writeFileSync(arg, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  console.log(`private key written to ${arg}: back it up, and keep it out of every repository.`);
  console.log(`CHAT_ENDPOINTS_KEY (a GitHub Actions variable, and a Vercel environment variable) = ${rawPublic(publicKey).toString("base64")}`);
} else if (cmd === "sign") {
  if (!arg) fail("usage: sign <private-key.pem> [--api a,b] [--ws a,b]");
  const o = options(rest);
  const prev = read();
  const next = { seq: prev.seq + 1, api: o.api !== undefined ? list(o.api) : prev.api, ws: o.ws !== undefined ? list(o.ws) : prev.ws };
  for (const u of next.api) if (!u.startsWith("https://")) fail(`api address must be https: ${u}`);
  for (const u of next.ws) if (!u.startsWith("wss://")) fail(`ws address must be wss: ${u}`);
  const privateKey = createPrivateKey(readFileSync(arg));
  const sig = sign(null, Buffer.from(canonical(next)), privateKey).toString("base64");
  writeFileSync(FILE, JSON.stringify({ v: 1, ...next, sig }, null, 2) + "\n");
  console.log(`written ${FILE}: seq ${next.seq}, ${next.api.length} api, ${next.ws.length} ws`);
  console.log(`public key of this signature: ${rawPublic(createPublicKey(privateKey)).toString("base64")}`);
} else if (cmd === "verify") {
  if (!arg) fail("usage: verify <public-key-base64>");
  const e = read();
  const der = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(arg, "base64")]);
  const ok = verify(null, Buffer.from(canonical(e)), createPublicKey({ key: der, format: "der", type: "spki" }), Buffer.from(e.sig ?? "", "base64"));
  console.log(ok ? `OK: seq ${e.seq}` : "NOT VALID");
  process.exit(ok ? 0 : 1);
} else {
  fail("usage: chat-endpoints.mjs keygen|sign|verify (see the top of the file)");
}
