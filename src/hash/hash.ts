import { blake2b, blake2s } from "@noble/hashes/blake2.js";
import { blake3 } from "@noble/hashes/blake3.js";
import { md5, ripemd160, sha1 } from "@noble/hashes/legacy.js";
import { sha224, sha256, sha384, sha512, sha512_256 } from "@noble/hashes/sha2.js";
import { keccak_256, sha3_224, sha3_256, sha3_384, sha3_512 } from "@noble/hashes/sha3.js";
import { bytesToHex } from "@noble/hashes/utils.js";

export interface Algorithm {
  id: string;
  label: string;
  fn: (data: Uint8Array) => Uint8Array;
  /** Collision-broken: fine for checksums, not for security. */
  weak?: boolean;
}

export const ALGORITHMS: Algorithm[] = [
  { id: "md5", label: "MD5", fn: md5, weak: true },
  { id: "sha1", label: "SHA-1", fn: sha1, weak: true },
  { id: "sha224", label: "SHA-224", fn: sha224 },
  { id: "sha256", label: "SHA-256", fn: sha256 },
  { id: "sha384", label: "SHA-384", fn: sha384 },
  { id: "sha512", label: "SHA-512", fn: sha512 },
  { id: "sha512-256", label: "SHA-512/256", fn: sha512_256 },
  { id: "sha3-224", label: "SHA3-224", fn: sha3_224 },
  { id: "sha3-256", label: "SHA3-256", fn: sha3_256 },
  { id: "sha3-384", label: "SHA3-384", fn: sha3_384 },
  { id: "sha3-512", label: "SHA3-512", fn: sha3_512 },
  { id: "keccak256", label: "Keccak-256", fn: keccak_256 },
  { id: "ripemd160", label: "RIPEMD-160", fn: ripemd160 },
  { id: "blake2b", label: "BLAKE2b-512", fn: (d) => blake2b(d) },
  { id: "blake2s", label: "BLAKE2s-256", fn: (d) => blake2s(d) },
  { id: "blake3", label: "BLAKE3-256", fn: (d) => blake3(d) },
];

export const DEFAULT_ALGORITHM = "sha256";

export function hashHex(id: string, data: Uint8Array | string): string {
  const algo = ALGORITHMS.find((a) => a.id === id);
  if (!algo) throw new Error(`Unknown hash algorithm: ${id}`);
  return bytesToHex(algo.fn(typeof data === "string" ? new TextEncoder().encode(data) : data));
}
