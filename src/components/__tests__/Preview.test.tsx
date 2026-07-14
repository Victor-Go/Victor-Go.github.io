import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Preview } from '../Preview';
import { defaultStyles } from '../../utils/storage';
import { marked } from 'marked';

describe('Preview Component', () => {
  const defaultProps = {
    markdown: '# John Doe\n\n## Summary\nSome summary text.\n\n### Experience\nSoftware Engineer',
    styles: defaultStyles,
    lang: 'en' as const,
    template: 'modernist' as const,
    avoidPageBreak: false,
    avoidPageBreakLevels: ['h2', 'h3'],
  };

  it('renders successfully with pane headers', () => {
    render(<Preview {...defaultProps} />);
    // Verify preview header is rendered
    expect(screen.getByRole('heading', { level: 2, name: /Preview/i })).toBeInTheDocument();
  });

  it('correctly structures markdown into resume components', () => {
    const { container } = render(<Preview {...defaultProps} />);
    
    // Check that structured elements are rendered
    const resumeWrapper = container.querySelector('.resume-wrapper');
    expect(resumeWrapper).toBeInTheDocument();

    const header = container.querySelector('.resume-header');
    expect(header).toBeInTheDocument();
    expect(header?.querySelector('h1')).toHaveTextContent('John Doe');

    const section = container.querySelector('.resume-section');
    expect(section).toBeInTheDocument();
    expect(section?.classList.contains('section-summary')).toBe(true);

    const item = container.querySelector('.resume-item');
    expect(item).toBeInTheDocument();
    expect(item?.querySelector('h3')).toHaveTextContent('Experience');
  });

  it('applies styles and custom classes correctly', () => {
    const customStyles = {
      ...defaultStyles,
      bodySize: 16,
      h1Size: 30,
      h1: {
        color: '#ff00aa',
        fontFamily: 'outfit',
        bold: true as const,
        italic: false as const,
      }
    };

    const { container } = render(
      <Preview 
        {...defaultProps} 
        styles={customStyles} 
        template="classic" 
        avoidPageBreak={true} 
        avoidPageBreakLevels={['h2']}
      />
    );

    const previewContainer = container.querySelector('#preview-container') as HTMLElement;
    expect(previewContainer).toHaveClass('template-classic');
    expect(previewContainer).toHaveClass('avoid-h2');
    expect(previewContainer.getAttribute('data-avoid-break')).toBe('true');

    // Check custom CSS variable injection in style attribute
    const styleAttr = previewContainer.getAttribute('style') || '';
    expect(styleAttr).toContain('--preview-body-size: 16px');
    expect(styleAttr).toContain('--preview-h1-size: 30px');
    expect(styleAttr).toContain('--preview-h1-color: #ff00aa');
    expect(styleAttr).toContain('--preview-h1-font: "Outfit", sans-serif');
    expect(styleAttr).toContain('--preview-h1-weight: bold');
    expect(styleAttr).toContain('--preview-h1-style: normal');
  });

  it('renders fallback error message when markdown parsing throws error', () => {
    const parseSpy = vi.spyOn(marked, 'parse').mockImplementation(() => {
      throw new Error('Parsing error');
    });
    
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { container } = render(<Preview {...defaultProps} />);
    expect(container.querySelector('.error-msg')).toHaveTextContent('Failed to render markdown content');
    expect(consoleSpy).toHaveBeenCalled();

    parseSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});
