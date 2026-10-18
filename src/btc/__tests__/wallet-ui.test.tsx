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
