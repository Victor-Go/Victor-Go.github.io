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

  it('renders inline and display math within the printable resume structure', () => {
    const { container } = render(<Preview {...defaultProps} markdown={String.raw`# Math

中文公式$E=mc^2$正常显示。

## Equations

$$ \frac{a_1}{b^2} $$

$$
\begin{aligned}
x &= 1 \\
y &= \sqrt{2}
\end{aligned}
$$`} />);
    const preview = container.querySelector('#preview-container')!;
    expect(preview.querySelector('.resume-header .katex')).toBeInTheDocument();
    expect(preview.querySelectorAll('.resume-section .katex-display')).toHaveLength(2);
    expect(preview.querySelectorAll('math')).toHaveLength(3);
    expect(preview.querySelector('.katex-error')).not.toBeInTheDocument();
  });

  it('preserves code and escaped dollars and tolerates invalid formulas', () => {
    const markdown = '`$x$`\n\n```latex\n$$ x $$\n```\n\n\\$20\n\n$$ \\frac{ $$\n\nStill **readable**';
    const { container } = render(<Preview {...defaultProps} markdown={markdown} />);
    expect(container.querySelectorAll('code')).toHaveLength(2);
    expect(container.querySelector('code .katex')).not.toBeInTheDocument();
    expect(container.querySelector('.katex-error')).toBeInTheDocument();
    expect(container.querySelector('strong')).toHaveTextContent('readable');
    expect(container.querySelector('#preview-container')).toHaveTextContent('$20');
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

describe('Preview sanitization', () => {
  const props = {
    markdown: '',
    styles: defaultStyles,
    lang: 'en' as const,
    template: 'modernist' as const,
    avoidPageBreak: false,
    avoidPageBreakLevels: ['h2', 'h3'],
  };

  it('removes event-handler attributes, scripts and javascript: links', () => {
    const markdown = [
      '# Name',
      '',
      '<img src=x onerror="window.__xss=1">',
      '',
      '<script>window.__xss=2</script>',
      '',
      '[click](javascript:alert(1))',
      '',
      '<a href="javascript:alert(2)">raw</a>',
      '',
      '## Section',
      '',
      '<div onclick="alert(3)">hi</div>',
    ].join('\n');
    const { container } = render(<Preview {...props} markdown={markdown} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('[onerror]')).toBeNull();
    expect(container.querySelector('[onclick]')).toBeNull();
    container.querySelectorAll('a').forEach((a) => {
      expect(a.getAttribute('href') ?? '').not.toMatch(/^\s*javascript:/i);
    });
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
  });

  it('keeps normal resume content, links and KaTeX output', () => {
    const markdown = '# Jane\n\n[site](https://example.com)\n\n## Math\n\n$E=mc^2$\n\n$$ \frac{a}{b} $$';
    const { container } = render(<Preview {...props} markdown={markdown} />);
    expect(container.querySelector('a[href="https://example.com"]')).toBeInTheDocument();
    expect(container.querySelector('.katex')).toBeInTheDocument();
    expect(container.querySelector('.katex-display')).toBeInTheDocument();
    expect(container.querySelector('.katex-mathml')).toBeInTheDocument();
    expect(container.querySelector('.katex-html')).toBeInTheDocument();
    expect(container.querySelector('h1')).toHaveTextContent('Jane');
  });
});
