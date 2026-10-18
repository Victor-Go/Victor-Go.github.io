import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from '../App';

afterEach(() => vi.unstubAllGlobals());

describe('password result binding', () => {
  it('clears ciphertext on edits and ignores an in-flight KDF result', async () => {
    const workers: FakeWorker[] = [];
    class FakeWorker {
      onmessage: ((event: MessageEvent<{ key: Uint8Array }>) => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() { workers.push(this); }
      postMessage() {}
      terminate() {}
      respond() { this.onmessage?.({ data: { key: new Uint8Array(32) } } as MessageEvent<{ key: Uint8Array }>); }
    }
    vi.stubGlobal('Worker', FakeWorker);
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Switch to English' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Password' }), { target: { value: 'password' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Repeat password' }), { target: { value: 'password' } });
    const plaintext = screen.getByRole('textbox', { name: 'Plaintext' });
    fireEvent.change(plaintext, { target: { value: 'first' } });
    fireEvent.click(screen.getByRole('button', { name: 'Encrypt' }));
    await waitFor(() => expect(workers).toHaveLength(1));
    await act(async () => workers[0].respond());
    await waitFor(() => expect((screen.getByRole('textbox', { name: 'Ciphertext' }) as HTMLTextAreaElement).value).toMatch(/^cipher1-pw\./));
    const ciphertext = (screen.getByRole('textbox', { name: 'Ciphertext' }) as HTMLTextAreaElement).value;

    fireEvent.change(plaintext, { target: { value: 'second' } });
    expect(screen.queryByRole('textbox', { name: 'Ciphertext' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Encrypt' }));
    await waitFor(() => expect(workers).toHaveLength(2));
    fireEvent.change(plaintext, { target: { value: 'third' } });
    await act(async () => workers[1].respond());
    expect(screen.queryByRole('textbox', { name: 'Ciphertext' })).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Decrypt' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Password' }), { target: { value: 'password' } });
    const encryptedInput = screen.getByRole('textbox', { name: 'Ciphertext' });
    fireEvent.change(encryptedInput, { target: { value: ciphertext } });
    fireEvent.click(screen.getByRole('button', { name: 'Decrypt' }));
    await waitFor(() => expect(workers).toHaveLength(3));
    await act(async () => workers[2].respond());
    await waitFor(() => expect((screen.getByRole('textbox', { name: 'Result' }) as HTMLTextAreaElement).value).toBe('first'));
    fireEvent.change(encryptedInput, { target: { value: ciphertext + 'x' } });
    expect(screen.queryByRole('textbox', { name: 'Result' })).toBeNull();
  });
});
