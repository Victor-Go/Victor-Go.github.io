import { afterEach, expect, it, vi } from 'vitest';
import { generateResumePDF } from '../pdf';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

it('waits for formula fonts before printing and restores the document title', async () => {
  document.body.innerHTML = '<div id="preview-container"></div>';
  document.title = 'Editor';
  let ready!: () => void;
  const fontsReady = new Promise<void>((resolve) => { ready = resolve; });
  const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
  Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: fontsReady } });
  const print = vi.spyOn(window, 'print').mockImplementation(() => {
    expect(document.title).toBe('Math');
  });
  try {
    const pending = generateResumePDF('preview-container', 'Math.pdf');
    expect(print).not.toHaveBeenCalled();
    ready();
    await pending;
    expect(print).toHaveBeenCalledOnce();
    expect(document.title).toBe('Editor');
  } finally {
    if (originalFonts) Object.defineProperty(document, 'fonts', originalFonts);
    else Reflect.deleteProperty(document, 'fonts');
  }
});
