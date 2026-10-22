import { mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { HDKey } from "@scure/bip32";
import { hmac } from "@noble/hashes/hmac.js";
import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { addressFor, type AddressableType } from "./derive";
import { lookupList } from "./protocols";

/** BIP39 (English), or Electrum's own seed format in its two single-signature flavours. */
export type MnemonicScheme = "bip39" | "electrum-standard" | "electrum-segwit";

export interface WalletAddress {
  type: AddressableType;
  /** Derivation path, e.g. m/84'/0'/0'/0/3. */
  path: string;
  address: string;
}

const BIP39_LENGTHS = new Set([12, 15, 18, 21, 24]);
const MIN_WORDS = 12;
const PER_TYPE_DEFAULT = 5;

/** The words of a phrase, lower-cased and single-spaced; undefined unless it could be a seed phrase at all. */
function words(input: string): string[] | undefined {
  const w = input.normalize("NFKD").trim().toLowerCase().split(/\s+/);
  return w.length >= MIN_WORDS && w.every((x) => /^[a-z]+$/.test(x)) ? w : undefined;
}

/** Electrum tells its seed types apart by a version prefix in an HMAC of the phrase, not by a checksum. */
function electrumVersion(phrase: string): "standard" | "segwit" | undefined {
  const v = bytesToHex(hmac(sha512, utf8ToBytes("Seed version"), utf8ToBytes(phrase)));
  if (v.startsWith("01")) return "standard";
  if (v.startsWith("100")) return "segwit";
  return undefined;
}

/**
 * Decides whether the input is a seed phrase. Cheap: no key stretching happens here.
 * Returns undefined when it does not look like one, "invalid" when it does but is not valid.
 */
export function detectMnemonic(input: string): { scheme: MnemonicScheme; phrase: string } | "invalid" | undefined {
  const w = words(input);
  if (!w) return undefined;
  const phrase = w.join(" ");
  if (BIP39_LENGTHS.has(w.length) && validateMnemonic(phrase, wordlist)) return { scheme: "bip39", phrase };
  const e = electrumVersion(phrase);
  if (e) return { scheme: e === "segwit" ? "electrum-segwit" : "electrum-standard", phrase };
  return "invalid";
}

/** The BIP44/49/84/86 purpose number of each script type. */
const BIP39_PURPOSES: Record<AddressableType, number> = { p2pkh: 44, "p2sh-p2wpkh": 49, p2wpkh: 84, p2tr: 86 };

/**
 * First `count` receive addresses of account 0 for each script type the scheme uses. This runs the
 * 2048-round key stretching, so call it on demand, not on every keystroke. Everything stays local.
 */
export function deriveWallet(scheme: MnemonicScheme, phrase: string, passphrase: string, count = PER_TYPE_DEFAULT): WalletAddress[] {
  const seed =
    scheme === "bip39"
      ? mnemonicToSeedSync(phrase, passphrase)
      : pbkdf2(sha512, utf8ToBytes(phrase), utf8ToBytes("electrum" + passphrase.normalize("NFKD")), { c: 2048, dkLen: 64 });
  const root = HDKey.fromMasterSeed(seed);
  const types = lookupList({ kind: "mnemonic", scheme }).filter((t): t is AddressableType => t !== "p2pk");
  const plans = types.map((type) => ({
    type,
    base: scheme === "bip39" ? `m/${BIP39_PURPOSES[type]}'/0'/0'/0` : scheme === "electrum-segwit" ? "m/0'/0" : "m/0",
  }));
  try {
    return plans.flatMap(({ type, base }) => {
      const chain = root.derive(base);
      return Array.from({ length: count }, (_, i) => ({
        type,
        path: `${base}/${i}`,
        address: addressFor(type, chain.deriveChild(i).publicKey!),
      }));
    });
  } finally {
    root.wipePrivateData();
  }
}
