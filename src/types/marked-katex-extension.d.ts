// The package exposes its implementation .ts as types, which fails
// noUnusedParameters. Describe its public API without checking vendor sources.
declare module 'marked-katex-extension' {
  import type { KatexOptions } from 'katex';
  import type { MarkedExtension } from 'marked';

  export default function markedKatex(
    options?: KatexOptions & { nonStandard?: boolean },
  ): MarkedExtension;
}
