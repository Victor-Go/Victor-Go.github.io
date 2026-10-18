import { DEFAULT_EPOCH_CURRENT, DEFAULT_EPOCH_TABLE, parseEpochs } from "./epochs";

/** Build-time epoch table (GitHub Actions variables CIPHER_EPOCHS / CIPHER_EPOCH_CURRENT). */
export const buildEpochs = parseEpochs(
  import.meta.env.VITE_CIPHER_EPOCHS || DEFAULT_EPOCH_TABLE,
  import.meta.env.VITE_CIPHER_EPOCH_CURRENT || DEFAULT_EPOCH_CURRENT,
);
