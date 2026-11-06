import type { KeyboardEvent } from "react";

/** Enter runs `action`, except while an input method is still composing text. */
export const onEnter =
  (action: (() => void) | undefined) =>
  (e: KeyboardEvent<HTMLElement>): void => {
    if (action && e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      action();
    }
  };
