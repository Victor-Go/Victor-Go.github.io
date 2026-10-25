import { DEFAULT_EPOCH_CURRENT, DEFAULT_EPOCH_TABLE, parseEpochs, type Epochs } from "./epochs";

/**
 * Where the epoch table comes from. Production builds ship it as the separate classic script
 * `assets/cipher-epochs.js` (see vite.config.ts), which sets `globalThis.__cipherEpochs = [table, current]`
 * only on allow-listed hostnames. The file is public, so this is not a secrecy mechanism.
 * Without it a production build refuses to run.
 *
 * Outside production the global still wins, then the `VITE_CIPHER_*` env values (.env.local), then the
 * built-in default. The `import.meta.env.VITE_CIPHER_*` references must stay inside the `!PROD` branch
 * so Vite's static replacement is tree-shaken out of production bundles.
 */
function fromGlobal(): Epochs | undefined {
  const g = (globalThis as { __cipherEpochs?: unknown }).__cipherEpochs;
  if (!Array.isArray(g) || typeof g[0] !== "string" || typeof g[1] !== "string") return undefined;
  return parseEpochs(g[0], g[1]);
}

/** Throws when no epoch table is available (always in production without the script). */
export function getEpochs(): Epochs {
  const fromScript = fromGlobal();
  if (fromScript) return fromScript;
  if (!import.meta.env.PROD) {
    return parseEpochs(
      import.meta.env.VITE_CIPHER_EPOCHS || DEFAULT_EPOCH_TABLE,
      import.meta.env.VITE_CIPHER_EPOCH_CURRENT || DEFAULT_EPOCH_CURRENT,
    );
  }
  throw new Error("Cipher epochs unavailable");
}

export function epochsAvailable(): boolean {
  try {
    getEpochs();
    return true;
  } catch {
    return false;
  }
}
