import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { App } from '../App';
import { generateMnemonic24 } from '../crypto/wallet';

describe('wallet restore result', () => {
  it('removes verified addresses as soon as the mnemonic changes', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: '恢复 / 校验' }));
    const input = screen.getByRole('textbox', { name: '输入你的 24 词助记词' });
    fireEvent.change(input, { target: { value: generateMnemonic24() } });
    fireEvent.click(screen.getByRole('button', { name: '校验并显示地址' }));
    expect(screen.getAllByRole('textbox', { name: '收款地址(可公开)' })).toHaveLength(5);

    fireEvent.change(input, { target: { value: generateMnemonic24() } });
    expect(screen.queryByRole('textbox', { name: '收款地址(可公开)' })).toBeNull();
    expect(screen.queryByText('助记词有效。请对照下面的地址与你记录的是否一致。')).toBeNull();
  });
});

describe('wallet passphrase', () => {
  const PASS = /^密码短语/;
  const addr = () => (screen.getAllByRole('textbox', { name: '收款地址(可公开)' })[0] as HTMLTextAreaElement).value;

  it('refuses to generate when the two entries differ', () => {
    render(<App />);
    fireEvent.change(screen.getByRole('textbox', { name: PASS }), { target: { value: 'one' } });
    fireEvent.change(screen.getByRole('textbox', { name: '再输入一次密码短语' }), { target: { value: 'two' } });
    fireEvent.click(screen.getByRole('button', { name: '生成 24 词钱包' }));
    expect(screen.getByRole('alert').textContent).toContain('不一致');
    expect(screen.queryByRole('textbox', { name: '收款地址(可公开)' })).toBeNull();
  });

  it('generates with a passphrase and restores the same addresses only with that passphrase', () => {
    render(<App />);
    fireEvent.change(screen.getByRole('textbox', { name: PASS }), { target: { value: ' p@ss 密码 ' } });
    fireEvent.change(screen.getByRole('textbox', { name: '再输入一次密码短语' }), { target: { value: ' p@ss 密码 ' } });
    fireEvent.click(screen.getByRole('button', { name: '生成 24 词钱包' }));
    const mnemonic = (screen.getByRole('textbox', { name: '助记词(24 词,务必保密)' }) as HTMLTextAreaElement).value;
    const generated = addr();
    expect(screen.getByText(/使用了密码短语/)).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: '恢复 / 校验' }));
    fireEvent.change(screen.getByRole('textbox', { name: '输入你的 24 词助记词' }), { target: { value: mnemonic } });
    fireEvent.change(screen.getByRole('textbox', { name: PASS }), { target: { value: ' p@ss 密码 ' } });
    fireEvent.click(screen.getByRole('button', { name: '校验并显示地址' }));
    expect(addr()).toBe(generated);

    fireEvent.change(screen.getByRole('textbox', { name: PASS }), { target: { value: 'p@ss 密码' } });
    expect(screen.queryByRole('textbox', { name: '收款地址(可公开)' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '校验并显示地址' }));
    expect(addr()).not.toBe(generated);
  });

  it('clears generated addresses when the passphrase is edited afterwards', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '生成 24 词钱包' }));
    expect(screen.getAllByRole('textbox', { name: '收款地址(可公开)' })).toHaveLength(5);
    fireEvent.change(screen.getByRole('textbox', { name: PASS }), { target: { value: 'x' } });
    expect(screen.queryByRole('textbox', { name: '收款地址(可公开)' })).toBeNull();
  });
});
