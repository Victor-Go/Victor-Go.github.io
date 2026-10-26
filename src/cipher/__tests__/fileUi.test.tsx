import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { App } from '../App';
import { ImageViewer } from '../components/ImageViewer';
import { Links } from '../components/Links';
import { messages } from '../i18n';

const m = messages.en;

function renderEn() {
  render(<App />);
  const toEnglish = screen.queryByRole('button', { name: 'Switch to English' });
  if (toEnglish) fireEvent.click(toEnglish);
}

describe('File mode', () => {
  it('is a top-level mode with compression off by default and a warned download', () => {
    renderEn();
    fireEvent.click(screen.getByRole('tab', { name: 'File' }));
    const compress = screen.getByRole('switch', { name: new RegExp(m.compress.slice(0, 20)) });
    expect(compress).toHaveAttribute('aria-checked', 'false');
    const picker = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(picker).not.toBeNull();
    // Encrypting needs a file and matching passwords.
    expect(screen.getAllByRole('button', { name: 'Encrypt' }).find((b) => !b.closest('[hidden]'))).toBeDisabled();
  });
});

describe('File mode drop and size note', () => {
  const dropOn = (el: Element, file: File) =>
    fireEvent.drop(el, { dataTransfer: { types: ['Files'], files: [file] } });

  it('selects a file dropped anywhere on the page and warns only above 100 MB', () => {
    renderEn();
    fireEvent.click(screen.getByRole('tab', { name: 'File' }));
    const panel = document.body; // anywhere on the page, not just on the panel
    dropOn(panel, new File(['x'], 'small.txt'));
    expect(screen.getByText(m.selectedFile('small.txt', '1 B'))).toBeInTheDocument();
    expect(document.querySelector('.c-warn')).toBeNull();
    const big = new File(['x'], 'big.bin');
    Object.defineProperty(big, 'size', { value: 150 * 1024 * 1024 });
    dropOn(panel, big);
    expect(document.querySelector('.c-warn')).toHaveTextContent(m.largeFile('150.0 MB'));
  });
});

describe('File mode multi-file drop', () => {
  it('encrypt takes several dropped files at once, decrypt only the first', () => {
    renderEn();
    fireEvent.click(screen.getByRole('tab', { name: 'File' }));
    const files = [new File(['a'], 'a.png'), new File(['bb'], 'b.pdf'), new File(['c'], 'c.txt')];
    fireEvent.drop(document.body, { dataTransfer: { types: ['Files'], files } });
    expect(screen.getByText(m.selectedFiles(3, '4 B'))).toBeInTheDocument();
    for (const f of files) expect(screen.getByText(f.name)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('tab', { name: 'Decrypt' }).find((t) => !t.closest('[hidden]'))!);
    fireEvent.drop(document.body, { dataTransfer: { types: ['Files'], files } });
    expect(screen.getByText(m.selectedFile('a.png', '1 B'))).toBeInTheDocument();
  });
});

describe('File mode removing selected files', () => {
  it('removes one file or clears all of them', () => {
    renderEn();
    fireEvent.click(screen.getByRole('tab', { name: 'File' }));
    const files = [new File(['a'], 'a.png'), new File(['bb'], 'b.pdf'), new File(['c'], 'c.txt')];
    fireEvent.drop(document.body, { dataTransfer: { types: ['Files'], files } });
    fireEvent.click(screen.getByRole('button', { name: m.removeFileLabel('b.pdf') }));
    expect(screen.getByText(m.selectedFiles(2, '2 B'))).toBeInTheDocument();
    expect(screen.queryByText('b.pdf')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: m.removeFileLabel('a.png') }));
    expect(screen.getByText(m.selectedFile('c.txt', '1 B'))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: m.clearFiles }));
    expect(screen.getAllByText(m.noFile).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: m.clearFiles })).toBeNull();
  });
});

describe('File mode drag to reorder', () => {
  it('moves a file when its grip is dragged over another row', () => {
    renderEn();
    fireEvent.click(screen.getByRole('tab', { name: 'File' }));
    const files = [new File(['a'], 'a.png'), new File(['b'], 'b.pdf'), new File(['c'], 'c.txt')];
    fireEvent.drop(document.body, { dataTransfer: { types: ['Files'], files } });
    const names = () => Array.from(document.querySelectorAll('[data-file-index] .c-file-name')).map((n) => n.textContent!);
    expect(names()).toEqual(['a.png', 'b.pdf', 'c.txt']);
    const grips = screen.getAllByRole('img', { name: m.dragToReorder });
    const rows = document.querySelectorAll('[data-file-index]');
    document.elementFromPoint = () => rows[2];
    fireEvent.pointerDown(grips[0], { pointerId: 1 });
    fireEvent.pointerMove(grips[0], { pointerId: 1, clientX: 1, clientY: 1 });
    fireEvent.pointerUp(grips[0], { pointerId: 1 });
    expect(names()).toEqual(['b.pdf', 'c.txt', 'a.png']);
  });
});

describe('ImageViewer paging', () => {
  const swipe = (el: Element, from: number, to: number, pointerType = 'touch') => {
    fireEvent.pointerDown(el, { pointerId: 1, pointerType, clientX: from, clientY: 100 });
    fireEvent.pointerUp(el, { pointerId: 1, pointerType, clientX: to, clientY: 105 });
  };

  it('shows arrows only for neighbours and calls them', () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    const { rerender } = render(<ImageViewer src="blob:x" m={m} onClose={() => {}} onNext={onNext} position="1 / 3" />);
    expect(screen.queryByRole('button', { name: m.viewerPrev })).toBeNull();
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: m.viewerNext }));
    expect(onNext).toHaveBeenCalledTimes(1);
    rerender(<ImageViewer src="blob:x" m={m} onClose={() => {}} onPrev={onPrev} onNext={onNext} />);
    fireEvent.click(screen.getByRole('button', { name: m.viewerPrev }));
    expect(onPrev).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' });
    expect(onNext).toHaveBeenCalledTimes(2);
  });

  it('swipes left for next and right for previous, but not for mouse drags or short moves', () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    render(<ImageViewer src="blob:x" m={m} onClose={() => {}} onPrev={onPrev} onNext={onNext} />);
    const stage = screen.getByRole('dialog');
    swipe(stage, 300, 100);
    expect(onNext).toHaveBeenCalledTimes(1);
    swipe(stage, 100, 300);
    expect(onPrev).toHaveBeenCalledTimes(1);
    swipe(stage, 100, 130);
    swipe(stage, 300, 100, 'mouse');
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it('offers no navigation for a single image', () => {
    render(<ImageViewer src="blob:x" m={m} onClose={() => {}} />);
    expect(screen.queryByRole('button', { name: m.viewerNext })).toBeNull();
    expect(screen.queryByRole('button', { name: m.viewerPrev })).toBeNull();
  });
});

describe('links in text', () => {
  it('shows safe, clickable links for URLs in the plaintext box of the Password encrypt tab', () => {
    renderEn();
    const box = screen.getAllByRole('textbox', { name: 'Plaintext' }).find((el) => !el.closest('[hidden]'))!;
    fireEvent.change(box, { target: { value: 'go to https://example.com/x, then javascript:alert(1)' } });
    const link = screen.getByRole('link', { name: 'https://example.com/x' });
    expect(link).toHaveAttribute('href', 'https://example.com/x');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('rel')).toContain('noreferrer');
    expect(screen.queryAllByRole('link')).toHaveLength(1);
  });

  it('renders nothing when there are no links', () => {
    const { container } = render(<Links text="no urls here" m={m} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ImageViewer', () => {
  it('closes on Escape and zooms with the wheel', () => {
    const onClose = vi.fn();
    render(<ImageViewer src="blob:x" m={m} onClose={onClose} />);
    const dialog = screen.getByRole('dialog');
    const img = dialog.querySelector('img') as HTMLImageElement;
    expect(img.style.transform).toContain('scale(1)');
    fireEvent.wheel(dialog, { deltaY: -400, clientX: 10, clientY: 10 });
    expect(img.style.transform).not.toContain('scale(1)');
    fireEvent.keyDown(dialog, { key: '0' });
    expect(img.style.transform).toContain('scale(1)');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
