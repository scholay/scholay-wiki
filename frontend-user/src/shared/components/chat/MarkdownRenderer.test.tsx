// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MarkdownRenderer } from './MarkdownRenderer';

afterEach(cleanup);

describe('MarkdownRenderer lazy pipelines', () => {
  it('keeps existing GFM element rendering on the basic pipeline', async () => {
    const { container } = render(
      <MarkdownRenderer text={'## 标题\n\n- **粗体**\n- `inline()`'} />,
    );

    expect(await screen.findByRole('heading', { name: '标题' })).toHaveClass(
      'text-14',
    );
    expect(screen.getByText('粗体').tagName).toBe('STRONG');
    expect(screen.getByText('inline()')).toHaveClass('bg-surface-2');
    expect(container.querySelector('.katex')).not.toBeInTheDocument();
    expect(container.querySelector('.hljs')).not.toBeInTheDocument();
  });

  it('keeps KaTeX rendering for formulas', async () => {
    const { container } = render(<MarkdownRenderer text={'$E = mc^2$'} />);
    await waitFor(() => expect(container.querySelector('.katex')).toBeInTheDocument());
    expect(container.querySelector('.katex')?.textContent).toContain('E=mc');
  });

  it('keeps highlighted CodeBlock rendering and its copy affordance', async () => {
    const { container } = render(
      <MarkdownRenderer text={'```js\nconst answer = 42;\n```'} />,
    );

    expect(await screen.findByRole('button', { name: '复制代码' })).toBeInTheDocument();
    expect(container.querySelector('pre code.hljs')).toBeInTheDocument();
    expect(container.querySelector('pre')).toHaveClass('overflow-x-auto');
  });
});
