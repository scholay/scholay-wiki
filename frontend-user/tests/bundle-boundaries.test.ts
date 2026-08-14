import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('heavy frontend dependency boundaries', () => {
  it('TurnFigures loads compose/ELK only after a valid fig.json reaches ComposedFigure', () => {
    const source = readSource('src/features/claw/components/chat/TurnFigures.tsx');
    expect(source).not.toMatch(/^import\s+\{\s*composeFigure\s*\}/m);
    expect(source).toContain("import('../figure/compose')");
    expect(source.indexOf('const spec = parseFigureSpec(text)')).toBeLessThan(
      source.indexOf("import('../figure/compose')"),
    );
  });

  it('AdminTurnFigures mirrors the same lazy compose/ELK boundary (admin session monitor)', () => {
    // 2026-08-12 审计:此文件曾静态 import composeFigure,把 1.44MB elk chunk 挂进
    // SessionMonitorPage 静态闭包(+1.5MB raw)。与用户端 TurnFigures 同款契约钉死。
    const source = readSource('src/features/admin/components/AdminTurnFigures.tsx');
    expect(source).not.toMatch(/^import\s+\{\s*composeFigure\s*\}/m);
    expect(source).toContain("import('@/features/claw/components/figure/compose')");
    expect(source.indexOf('const spec = parseFigureSpec(text)')).toBeLessThan(
      source.indexOf("import('@/features/claw/components/figure/compose')"),
    );
  });

  it('the route-visible MarkdownRenderer shell has no static heavy markdown imports', () => {
    const source = readSource('src/shared/components/chat/MarkdownRenderer.tsx');
    for (const packageName of [
      'react-markdown',
      'remark-math',
      'rehype-katex',
      'rehype-highlight',
      'katex/dist/katex.min.css',
      'highlight.js/styles/github.css',
    ]) {
      expect(source, packageName).not.toMatch(
        new RegExp(`^import\\s+(?!\\()(?:(?!from).)*from\\s+['\"]${packageName.replaceAll('.', '\\.')}`,'m'),
      );
    }
    expect(source).toContain("import('./MarkdownPipelineRenderer')");
  });

  it('ELK, Mammoth and the virtual CommonJS helper have stable separate chunks', () => {
    const source = readSource('vite.config.ts');
    expect(source).toContain("commonjs-dynamic-modules");
    expect(source).toContain("return 'commonjs-runtime'");
    expect(source).toContain("return 'elk'");
    expect(source).toContain("return 'mammoth'");
    expect(source.indexOf("commonjsHelpers.js")).toBeLessThan(
      source.indexOf("if (!normalizedId.includes('node_modules')) return"),
    );
  });
});
