import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Output } from '../components/Fields';
import { messages } from '../i18n';

const m = messages.zh;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('copy button feedback', () => {
  it('shows "copied" on the button, then returns to normal after one second', async () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined), readText: vi.fn().mockResolvedValue('') },
    });
    render(<Output label="x" value="hello" m={m} />);
    const btn = screen.getByRole('button', { name: m.copy });
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(btn).toHaveTextContent(m.copied);
    expect(btn).toHaveClass('c-copied');
    await act(async () => {
      vi.advanceTimersByTime(999);
    });
    expect(btn).toHaveTextContent(m.copied);
    await act(async () => {
      vi.advanceTimersByTime(2);
    });
    expect(btn).toHaveTextContent(m.copy);
    expect(btn).not.toHaveClass('c-copied');
  });

  it('shows a failure message on the button when the clipboard is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    render(<Output label="x" value="hello" m={m} />);
    const btn = screen.getByRole('button', { name: m.copy });
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(btn).toHaveTextContent(m.copyFailed);
  });
});
