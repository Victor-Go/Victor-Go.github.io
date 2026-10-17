import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { App } from '../App';
import { attachWipeListeners } from '../wipe';
import { track, trackedCount, wipeTracked } from '../crypto/secrets';

/** The app starts in Chinese; most assertions below use the English labels. */
function renderEn() {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Switch to English' }));
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

  it('never wipes on a timer', () => {
    vi.useFakeTimers();
    const onWipe = vi.fn();
    const detach = attachWipeListeners(onWipe);
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(onWipe).not.toHaveBeenCalled();
    detach();
  });
});

describe('page hardening', () => {
  it('refuses to run when opened by another window', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'opener');
    Object.defineProperty(window, 'opener', { value: {}, configurable: true });
    try {
      render(<App />);
      expect(screen.getByRole('alert')).toHaveTextContent(/拒绝在 iframe/);
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
    expect(document.querySelector('input')).toBeNull();
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
  });
});

describe('default language', () => {
  it('starts in Chinese regardless of browser language and can switch to English', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Cipher 加密工具');
    expect(document.documentElement.lang).toBe('zh-CN');
    fireEvent.click(screen.getByRole('button', { name: 'Switch to English' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Cipher');
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
