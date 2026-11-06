/**
 * Characters that change how text is laid out or hide it: bidirectional overrides and isolates, zero-width and invisible format characters (the zero-width joiner stays: emoji sequences need it).
 * A message could use them to look like something else (for example to mimic a system notice), so they are removed from received text.
 */
const CONTROLS = /[\u061C\u180E\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/g;

export const stripControls = (text: string): string => text.replace(CONTROLS, "");
