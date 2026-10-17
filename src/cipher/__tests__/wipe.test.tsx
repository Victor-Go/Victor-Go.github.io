import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { App } from '../App';
import { attachWipeListeners, IDLE_MS } from '../wipe';
import { track, trackedCount, wipeTracked } from '../crypto/secrets';

function typeInto(label: RegExp | string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
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
    render(<App />);
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
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Generate key pair' }));
    const priv = await screen.findByLabelText(/Private key/);
    expect((priv as HTMLTextAreaElement).value.startsWith('cipher1-priv.')).toBe(true);
    const buf = track(Uint8Array.of(1, 2, 3));
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(screen.queryByLabelText(/Private key/)).toBeNull();
    expect(Array.from(buf)).toEqual([0, 0, 0]);
    expect(trackedCount()).toBe(0);
  });

  it('wipes after five idle minutes, and activity postpones it', () => {
    vi.useFakeTimers();
    const onWipe = vi.fn();
    const detach = attachWipeListeners(onWipe);
    vi.advanceTimersByTime(IDLE_MS - 1000);
    window.dispatchEvent(new Event('keydown'));
    vi.advanceTimersByTime(IDLE_MS - 1000);
    expect(onWipe).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1500);
    expect(onWipe).toHaveBeenCalledTimes(1);
    detach();
  });
});

describe('page hardening', () => {
  it('refuses to run when opened by another window', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'opener');
    Object.defineProperty(window, 'opener', { value: {}, configurable: true });
    try {
      render(<App />);
      expect(screen.getByRole('alert')).toHaveTextContent(/refuses to run/);
      expect(document.querySelectorAll('textarea').length).toBe(0);
    } finally {
      if (original) Object.defineProperty(window, 'opener', original);
      else Object.defineProperty(window, 'opener', { value: null, configurable: true });
    }
  });

  it('uses no form element, only type=button buttons and autofill-proof textareas', () => {
    render(<App />);
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
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: 'Password' }));
    const pw = screen.getByRole('textbox', { name: 'Password' }) as HTMLTextAreaElement;
    expect(pw.tagName).toBe('TEXTAREA');
    expect(pw.className).toContain('c-masked');
    for (const a of ['data-1p-ignore', 'data-lpignore', 'data-bwignore']) expect(pw.hasAttribute(a)).toBe(true);
  });

  it('round-trips through the key-exchange UI', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Generate key pair' }));
    const pub = (await screen.findByLabelText(/Public key/)) as HTMLTextAreaElement;
    const priv = (screen.getByLabelText(/Private key/) as HTMLTextAreaElement).value;
    const pubVal = pub.value;
    openEncryptTab();
    typeInto(/Recipient/, pubVal);
    typeInto('Plaintext', 'hello 你好');
    fireEvent.click(screen.getByRole('button', { name: 'Encrypt' }));
    const ct = (await screen.findByLabelText('Ciphertext')) as HTMLTextAreaElement;
    expect(ct.value.startsWith('cipher1-kx.')).toBe(true);
    const ctVal = ct.value;
    fireEvent.click(screen.getByRole('tab', { name: 'Decrypt' }));
    typeInto(/Your private key/, priv);
    typeInto('Ciphertext', ctVal);
    fireEvent.click(screen.getByRole('button', { name: 'Decrypt' }));
    expect(((await screen.findByLabelText('Result')) as HTMLTextAreaElement).value).toBe('hello 你好');
  });
});
