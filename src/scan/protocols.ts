import type { AddrType } from "./derive";
import type { MnemonicScheme } from "./mnemonic";

/** Display order: the types a newcomer meets first, then the early pay-to-pubkey. */
const ORDER: readonly AddrType[] = ["p2pkh", "p2sh-p2wpkh", "p2wpkh", "p2tr", "p2pk"];

/** What a newcomer meets in today's wallets and exchanges: 1…, 3…, bc1q… and bc1p…. */
export const MAINSTREAM: readonly AddrType[] = ["p2pkh", "p2sh-p2wpkh", "p2wpkh", "p2tr"];

/** What was pasted, as far as it tells us which protocols could be in play. */
export type Format =
  | { kind: "pubkey"; compressed: boolean }
  | { kind: "mnemonic"; scheme: MnemonicScheme }
  | { kind: "extkey"; flavor: "xpub" | "ypub" | "zpub" };

/**
 * Every protocol this format can possibly hold coins under.
 * - An uncompressed key predates SegWit (which needs compressed keys): only P2PKH and the original
 *   pay-to-pubkey. A compressed key can be any of the five.
 * - A BIP39 phrase maps to the four BIP44/49/84/86 purposes; Electrum seeds have one native type.
 * - An xpub does not say which script type it serves, so all four; ypub and zpub are specific
 *   (SLIP-132). Hierarchical wallets did not exist in the pay-to-pubkey era, so none include P2PK.
 */
export function possibleProtocols(f: Format): AddrType[] {
  switch (f.kind) {
    case "pubkey":
      return f.compressed ? [...ORDER] : ["p2pkh", "p2pk"];
    case "mnemonic":
      return f.scheme === "bip39" ? [...MAINSTREAM] : f.scheme === "electrum-segwit" ? ["p2wpkh"] : ["p2pkh"];
    case "extkey":
      return f.flavor === "xpub" ? [...MAINSTREAM] : f.flavor === "ypub" ? ["p2sh-p2wpkh"] : ["p2wpkh"];
  }
}

/**
 * What to look up for a pasted format: the mainstream protocols the format can produce, plus the
 * must-query list, which is every other protocol the format could possibly use. Mainstream types the
 * format cannot produce (a SegWit address from an uncompressed key, say) are skipped: they would not
 * be real addresses.
 */
export function lookupList(f: Format): AddrType[] {
  const possible = possibleProtocols(f);
  const mainstream = MAINSTREAM.filter((t) => possible.includes(t));
  const mustQuery = possible.filter((t) => !MAINSTREAM.includes(t));
  return ORDER.filter((t) => mainstream.includes(t) || mustQuery.includes(t));
}
