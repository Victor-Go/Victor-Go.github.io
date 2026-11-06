import { base64urlnopad } from "@scure/base";

/** Binary values on the wire are base64url without padding (protocol §3). */
export const toB64 = (bytes: Uint8Array): string => base64urlnopad.encode(bytes);
export const fromB64 = (text: string): Uint8Array => base64urlnopad.decode(text);
