import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LanguageSelector } from '../LanguageSelector';

describe('LanguageSelector Component', () => {
  it('renders successfully with current language active', () => {
    const setLangMock = vi.fn();
    render(<LanguageSelector lang="en" setLang={setLangMock} />);

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    expect(select.value).toBe('en');

    // Check that standard options exist
    expect(screen.getByRole('option', { name: /English/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /简体中文/i })).toBeInTheDocument();
  });

  it('triggers setLang when a different language is selected', () => {
    const setLangMock = vi.fn();
    render(<LanguageSelector lang="en" setLang={setLangMock} />);

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'zh' } });

    expect(setLangMock).toHaveBeenCalledWith('zh');
  });

  it('renders correct translation-based label/accessibility attributes', () => {
    const setLangMock = vi.fn();
    // Render with 'zh' language option
    render(<LanguageSelector lang="zh" setLang={setLangMock} />);

    const label = screen.getByText('语言');
    expect(label).toBeInTheDocument();
  });
});
