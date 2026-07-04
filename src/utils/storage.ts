export interface ElementStyle {
  color: string;
  fontFamily: string;
  bold: boolean | "inherit";
  italic: boolean | "inherit";
}

export interface AppStyles {
  bodySize: number;
  h1Size: number;
  h2Size: number;
  h3Size: number;
  h4Size: number;
  h5Size: number;
  h6Size: number;
  global: ElementStyle; // Overall / Global overrides
  h1: ElementStyle;
  h2: ElementStyle;
  h3: ElementStyle;
  p: ElementStyle;
  strong: ElementStyle;
  em: ElementStyle;
  a: ElementStyle;
}

export const defaultStyles: AppStyles = {
  bodySize: 15,
  h1Size: 28,
  h2Size: 20,
  h3Size: 16,
  h4Size: 14,
  h5Size: 13,
  h6Size: 12,
  global: {
    color: "inherit",
    fontFamily: "inherit",
    bold: "inherit",
    italic: "inherit",
  },
  h1: {
    color: "inherit",
    fontFamily: "inherit",
    bold: "inherit",
    italic: "inherit",
  },
  h2: {
    color: "inherit",
    fontFamily: "inherit",
    bold: "inherit",
    italic: "inherit",
  },
  h3: {
    color: "inherit",
    fontFamily: "inherit",
    bold: "inherit",
    italic: "inherit",
  },
  p: {
    color: "inherit",
    fontFamily: "inherit",
    bold: "inherit",
    italic: "inherit",
  },
  strong: {
    color: "inherit",
    fontFamily: "inherit",
    bold: "inherit",
    italic: "inherit",
  },
  em: {
    color: "inherit",
    fontFamily: "inherit",
    bold: "inherit",
    italic: "inherit",
  },
  a: {
    color: "inherit",
    fontFamily: "inherit",
    bold: "inherit",
    italic: "inherit",
  },
};

const STORAGE_KEY = "markdown_resume_style_config";

export function saveStylesToStorage(styles: AppStyles): { success: boolean; error?: string } {
  try {
    const dataStr = JSON.stringify(styles);
    localStorage.setItem(STORAGE_KEY, dataStr);
    return { success: true };
  } catch (err: any) {
    console.error("Failed to save styles to localStorage:", err);
    return {
      success: false,
      error: err?.message || "Storage access failed or quota exceeded.",
    };
  }
}

export function loadStylesFromStorage(): AppStyles {
  try {
    const dataStr = localStorage.getItem(STORAGE_KEY);
    if (!dataStr) {
      return defaultStyles;
    }
    const parsed = JSON.parse(dataStr);
    
    // Ensure deep merging/validation with defaultStyles to handle structure changes gracefully
    return {
      ...defaultStyles,
      ...parsed,
      global: { ...defaultStyles.global, ...parsed.global },
      h1: { ...defaultStyles.h1, ...parsed.h1 },
      h2: { ...defaultStyles.h2, ...parsed.h2 },
      h3: { ...defaultStyles.h3, ...parsed.h3 },
      p: { ...defaultStyles.p, ...parsed.p },
      strong: { ...defaultStyles.strong, ...parsed.strong },
      em: { ...defaultStyles.em, ...parsed.em },
      a: { ...defaultStyles.a, ...parsed.a },
    };
  } catch (err) {
    console.error("Failed to load styles from localStorage:", err);
    return defaultStyles;
  }
}

export function clearStylesFromStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error("Failed to clear styles from localStorage:", err);
  }
}
