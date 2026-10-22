import { NETWORK, p2pkh, p2sh, p2tr, p2wpkh } from "@scure/btc-signer";

export type AddrType = "p2pkh" | "p2sh-p2wpkh" | "p2wpkh" | "p2tr" | "p2pk";

/** The types that have an address form (everything except the 2009-era pay-to-pubkey). */
export type AddressableType = Exclude<AddrType, "p2pk">;

/** Mainnet address of a compressed (or, for P2PKH, uncompressed) public key. */
export function addressFor(type: AddressableType, pubkey: Uint8Array): string {
  switch (type) {
    case "p2pkh":
      return p2pkh(pubkey, NETWORK).address!;
    case "p2sh-p2wpkh":
      return p2sh(p2wpkh(pubkey, NETWORK), NETWORK).address!;
    case "p2wpkh":
      return p2wpkh(pubkey, NETWORK).address!;
    case "p2tr":
      return p2tr(pubkey.slice(1), undefined, NETWORK).address!;
  }
}
