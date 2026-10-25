import { CipherError } from "../crypto/encoding";
import type { Messages } from "../i18n";

export function errorText(e: unknown, m: Messages): string {
  if (e instanceof CipherError) {
    switch (e.code) {
      case "decrypt":
        return m.decryptFailed;
      case "format":
        return m.badFormat;
      case "wrong-kind":
        return m.wrongKind;
      case "empty-password":
        return m.emptyPassword;
      case "kdf":
        return m.kdfFailed;
      case "file-format":
        return m.badFile;
    }
  }
  return m.failed;
}
