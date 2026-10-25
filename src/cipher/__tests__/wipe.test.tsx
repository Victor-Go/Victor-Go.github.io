import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { App } from '../App';
import { attachWipeListeners } from '../wipe';
import { track, trackedCount, wipeTracked } from '../crypto/secrets';

/** The app starts in Chinese; most assertions below use the English labels. */
function renderEnPassword() {
  render(<App />);
  const switchToEnglish = screen.queryByRole('button', { name: 'Switch to English' });
  if (switchToEnglish) fireEvent.click(switchToEnglish);
}

/** Most tests below exercise key exchange, which is not the default mode. */
function renderEn() {
  renderEnPassword();
  fireEvent.click(screen.getByRole('tab', { name: 'Key exchange' }));
}

/** Panels of inactive tabs stay mounted but hidden; only the visible match counts. */
function field(label: RegExp | string): HTMLTextAreaElement {
  const visible = screen.getAllByLabelText(label).filter((el) => !el.closest('[hidden]'));
  expect(visible).toHaveLength(1);
  return visible[0] as HTMLTextAreaElement;
}

function typeInto(label: RegExp | string, value: string) {
  fireEvent.change(field(label), { target: { value } });
}

function openEncryptTab() {
  fireEvent.click(screen.getByRole('tab', { name: 'Encrypt' }));
}

function allTextareaValues(): string[] {
  return Array.from(document.querySelectorAll('textarea')).map((t) => t.value);
}

function pageshow(persisted: boolean) {
  const e = new Event('pageshow');
  Object.defineProperty(e, 'persisted', { value: persisted });
  window.dispatchEvent(e);
}

afterEach(() => {
  vi.useRealTimers();
  wipeTracked();
});

describe('wipe on page lifecycle', () => {
  function fill() {
    renderEn();
    openEncryptTab();
    typeInto(/Recipient/, 'cipher1-pub.AAAA');
    typeInto('Plaintext', 'top secret');
    expect(allTextareaValues()).toContain('top secret');
  }

  it('clears all state on pagehide', () => {
    fill();
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(allTextareaValues().every((v) => v === '')).toBe(true);
  });

  it('clears all state on pageshow from bfcache but not on a normal pageshow', () => {
    fill();
    act(() => pageshow(false));
    expect(allTextareaValues()).toContain('top secret');
    act(() => pageshow(true));
    expect(allTextareaValues().every((v) => v === '')).toBe(true);
  });

  it('clears via the clear-everything button', () => {
    fill();
    fireEvent.click(screen.getByRole('button', { name: /Clear everything/ }));
    expect(allTextareaValues().every((v) => v === '')).toBe(true);
  });

  it('clears generated keys and zeroes tracked buffers on wipe', async () => {
    renderEn();
    fireEvent.click(screen.getByRole('button', { name: 'Generate key pair' }));
    const priv = await waitFor(() => field(/Private key/));
    expect(priv.value.startsWith('cipher1-priv.')).toBe(true);
    const buf = track(Uint8Array.of(1, 2, 3));
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(allTextareaValues().some((v) => v.startsWith('cipher1-priv.'))).toBe(false);
    expect(Array.from(buf)).toEqual([0, 0, 0]);
    expect(trackedCount()).toBe(0);
  });

  it('wipes after five minutes of inactivity and resets on interaction', () => {
    vi.useFakeTimers();
    const onWipe = vi.fn();
    const detach = attachWipeListeners(onWipe);
    vi.advanceTimersByTime(4 * 60 * 1000);
    window.dispatchEvent(new Event('pointerdown'));
    vi.advanceTimersByTime(4 * 60 * 1000);
    expect(onWipe).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60 * 1000);
    expect(onWipe).toHaveBeenCalledTimes(1);
    detach();
  });
});

describe('auto-clear switch', () => {
  it('is on by default, wipes after ten minutes idle, and can be switched off', () => {
    vi.useFakeTimers();
    renderEn();
    openEncryptTab();
    const sw = screen.getByRole('switch', { name: /Auto-clear everything after 10 minutes/ });
    expect(sw).toHaveAttribute('aria-checked', 'true');
    typeInto('Plaintext', 'top secret');
    act(() => {
      vi.advanceTimersByTime(9 * 60 * 1000);
    });
    expect(allTextareaValues()).toContain('top secret');
    act(() => {
      vi.advanceTimersByTime(60 * 1000);
    });
    expect(allTextareaValues().every((v) => v === '')).toBe(true);

    fireEvent.click(screen.getByRole('switch'));
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    typeInto('Plaintext', 'stay');
    act(() => {
      vi.advanceTimersByTime(60 * 60 * 1000);
    });
    expect(allTextareaValues()).toContain('stay');
  });
});

describe('page hardening', () => {
  it('refuses to run when opened by another window', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'opener');
    Object.defineProperty(window, 'opener', { value: {}, configurable: true });
    try {
      render(<App />);
      expect(screen.getByRole('alert')).toHaveTextContent(/拒绝在 iframe|refuses to run inside an iframe/);
      expect(document.querySelectorAll('textarea').length).toBe(0);
    } finally {
      if (original) Object.defineProperty(window, 'opener', original);
      else Object.defineProperty(window, 'opener', { value: null, configurable: true });
    }
  });

  it('uses no form element, only type=button buttons and autofill-proof textareas', () => {
    renderEn();
    openEncryptTab();
    expect(document.querySelector('form')).toBeNull();
    // The only inputs are the file pickers of the File mode.
    expect(document.querySelector('input:not([type="file"])')).toBeNull();
    document.querySelectorAll('button').forEach((b) => expect(b.getAttribute('type')).toBe('button'));
    document.querySelectorAll('textarea').forEach((t) => {
      expect(t.getAttribute('autocomplete')).toBe('off');
      expect(t.getAttribute('autocorrect')).toBe('off');
      expect(t.getAttribute('autocapitalize')).toBe('off');
      expect(t.getAttribute('spellcheck')).toBe('false');
    });
  });

  it('masks password fields without type=password and flags password managers off', () => {
    renderEn();
    fireEvent.click(screen.getByRole('tab', { name: 'Password' }));
    const pw = screen.getByRole('textbox', { name: 'Password' }) as HTMLTextAreaElement;
    expect(pw.tagName).toBe('TEXTAREA');
    expect(pw.className).toContain('c-masked');
    for (const a of ['data-1p-ignore', 'data-lpignore', 'data-bwignore']) expect(pw.hasAttribute(a)).toBe(true);
  });

  it('round-trips through the key-exchange UI', async () => {
    renderEn();
    fireEvent.click(screen.getByRole('button', { name: 'Generate key pair' }));
    const pub = await waitFor(() => field(/Public key/));
    const priv = field(/Private key/).value;
    const pubVal = pub.value;
    openEncryptTab();
    typeInto(/Recipient/, pubVal);
    typeInto('Plaintext', 'hello 你好');
    fireEvent.click(screen.getByRole('button', { name: 'Encrypt' }));
    const ct = await waitFor(() => field('Ciphertext'));
    expect(ct.value.startsWith('cipher1-kx.')).toBe(true);
    const ctVal = ct.value;
    fireEvent.click(screen.getByRole('tab', { name: 'Decrypt' }));
    expect(field(/Your private key/).value).toBe(priv); // auto-filled when the pair was generated
    typeInto('Ciphertext', ctVal);
    fireEvent.click(screen.getByRole('button', { name: 'Decrypt' }));
    await waitFor(() => expect(field('Result').value).toBe('hello 你好'));
    typeInto('Ciphertext', ctVal + 'x');
    expect(screen.queryByRole('textbox', { name: 'Result' })).toBeNull();
  });

  it('hides key-exchange results after edits and discards an in-flight result', async () => {
    renderEn();
    fireEvent.click(screen.getByRole('button', { name: 'Generate key pair' }));
    const pub = (await waitFor(() => field(/Public key/))).value;
    openEncryptTab();
    typeInto(/Recipient/, pub);
    typeInto('Plaintext', 'first');
    fireEvent.click(screen.getByRole('button', { name: 'Encrypt' }));
    await waitFor(() => expect(field('Ciphertext').value).toMatch(/^cipher1-kx\./));

    typeInto('Plaintext', 'second');
    expect(screen.queryByRole('textbox', { name: 'Ciphertext' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Encrypt' }));
    typeInto(/Recipient/, pub + 'x');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Encrypt' })).not.toBeDisabled());
    expect(screen.queryByRole('textbox', { name: 'Ciphertext' })).toBeNull();
  });
});

describe('default language', () => {
  it('starts in Chinese and allows switching without persistence', () => {
    const lang = vi.spyOn(navigator, 'language', 'get').mockReturnValue('zh-CN');
    try {
      render(<App />);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Cipher 加密工具');
      fireEvent.click(screen.getByRole('button', { name: 'Switch to English' }));
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Cipher');
    } finally {
      lang.mockRestore();
    }
  });
  it('starts in Chinese even for non-Chinese browsers', () => {
    const lang = vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-CA');
    try {
      render(<App />);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Cipher 加密工具');
      expect(document.documentElement.lang).toBe('zh-CN');
    } finally {
      lang.mockRestore();
    }
  });
});

describe('tab switching', () => {
  it('keeps typed content and generated keys when switching tabs and modules', async () => {
    renderEn();
    fireEvent.click(screen.getByRole('button', { name: 'Generate key pair' }));
    const pub = (await waitFor(() => field(/Public key/))).value;
    openEncryptTab();
    typeInto('Plaintext', 'keep me');
    fireEvent.click(screen.getByRole('tab', { name: 'Decrypt' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Password' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Key exchange' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Encrypt' }));
    expect(field('Plaintext').value).toBe('keep me');
    fireEvent.click(screen.getByRole('tab', { name: 'Generate keys' }));
    expect(field(/Public key/).value).toBe(pub);
  });

  it('keeps content when switching language', () => {
    renderEn();
    openEncryptTab();
    typeInto('Plaintext', 'still here');
    fireEvent.click(screen.getByRole('button', { name: '切换到中文' }));
    expect(allTextareaValues()).toContain('still here');
  });
});

describe('mode tabs', () => {
  it('lists Password first and selects it by default', () => {
    renderEnPassword();
    const modes = screen.getAllByRole('tab').slice(0, 3);
    expect(modes.map((t) => t.textContent)).toEqual(['Password', 'File', 'Key exchange']);
    expect(modes[0]).toHaveAttribute('aria-selected', 'true');
    expect(modes[1]).toHaveAttribute('aria-selected', 'false');
    expect(modes[2]).toHaveAttribute('aria-selected', 'false');
  });
});

describe('mnemonic button', () => {
  it('fills the plaintext with 24 BIP-39 words joined by hyphens in the key-exchange encrypt tab', () => {
    renderEn();
    openEncryptTab();
    fireEvent.click(screen.getByRole('button', { name: 'Generate 24 mnemonic words (BIP-39)' }));
    const v = field('Plaintext').value;
    expect(v.split('-')).toHaveLength(24);
    expect(v.endsWith('-')).toBe(false);
    expect(screen.getByRole('status')).toHaveTextContent(/256-bit/);
    typeInto('Plaintext', v + 'x');
    expect(screen.queryByText(/256-bit entropy/)).toBeNull();
  });
});
