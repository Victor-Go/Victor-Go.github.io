import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  saveStylesToStorage,
  loadStylesFromStorage,
  clearStylesFromStorage,
  defaultStyles,
  type AppStyles
} from '../storage';

describe('storage utility', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('should load default styles when nothing is in storage', () => {
    const styles = loadStylesFromStorage();
    expect(styles).toEqual(defaultStyles);
  });

  it('should save and load styles successfully', () => {
    const customStyles: AppStyles = {
      ...defaultStyles,
      bodySize: 18,
      h1: {
        color: '#ff0000',
        fontFamily: 'Arial',
        bold: true,
        italic: false,
      },
    };

    const saveResult = saveStylesToStorage(customStyles);
    expect(saveResult.success).toBe(true);

    const loadedStyles = loadStylesFromStorage();
    expect(loadedStyles.bodySize).toBe(18);
    expect(loadedStyles.h1.color).toBe('#ff0000');
    expect(loadedStyles.h1.fontFamily).toBe('Arial');
    expect(loadedStyles.h1.bold).toBe(true);
    expect(loadedStyles.h1.italic).toBe(false);
  });

  it('should merge saved styles with defaults for missing sections', () => {
    // Only saving subset of properties
    const partialData = {
      bodySize: 22,
      h1: {
        color: 'blue'
      }
    };
    localStorage.setItem('markdown_resume_style_config', JSON.stringify(partialData));

    const loaded = loadStylesFromStorage();
    expect(loaded.bodySize).toBe(22);
    expect(loaded.h1.color).toBe('blue');
    // should fallback to defaults for other fields in h1
    expect(loaded.h1.bold).toBe('inherit');
    // should fallback to defaults for other sections
    expect(loaded.h2).toEqual(defaultStyles.h2);
  });

  it('should clear styles successfully', () => {
    const customStyles: AppStyles = {
      ...defaultStyles,
      bodySize: 25,
    };
    saveStylesToStorage(customStyles);
    expect(loadStylesFromStorage().bodySize).toBe(25);

    clearStylesFromStorage();
    expect(loadStylesFromStorage()).toEqual(defaultStyles);
  });

  it('should handle saving errors gracefully', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Quota exceeded');
    });
    expect(setItemSpy).toBeDefined();

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = saveStylesToStorage(defaultStyles);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Quota exceeded');
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('should handle loading errors and return default styles', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage disabled');
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const styles = loadStylesFromStorage();
    expect(styles).toEqual(defaultStyles);
    expect(consoleSpy).toHaveBeenCalled();
  });
});
