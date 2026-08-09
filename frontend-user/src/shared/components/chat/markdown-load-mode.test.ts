import { describe, expect, it } from 'vitest';
import { markdownLoadMode } from './markdown-load-mode';

describe('markdownLoadMode', () => {
  it('keeps prose, GFM and inline code on the basic pipeline', () => {
    expect(markdownLoadMode('## 标题\n\n- **粗体**\n- `inline()`')).toBe('basic');
    expect(markdownLoadMode('price is \\$5 and there is no formula')).toBe('basic');
  });

  it('loads only the math enhancement for inline and display formulas', () => {
    expect(markdownLoadMode('质能方程 $E = mc^2$')).toBe('math');
    expect(markdownLoadMode('$$\n\\int_0^1 x^2 dx\n$$')).toBe('math');
  });

  it('loads only the code enhancement for fenced/indented blocks', () => {
    expect(markdownLoadMode('```ts\nconst n = 1;\n```')).toBe('code');
    expect(markdownLoadMode('~~~mermaid\ngraph TD\n~~~')).toBe('code');
    expect(markdownLoadMode('paragraph\n\n    print("hello")')).toBe('code');
    expect(markdownLoadMode('paragraph\n\n      print("six spaces")')).toBe('code');
    expect(markdownLoadMode('paragraph\n\n\t  print("tab plus spaces")')).toBe('code');
  });

  it('recognizes fenced code nested in CommonMark quote/list containers', () => {
    expect(markdownLoadMode('> ```js\n> const price = "$5";\n> ```')).toBe('code');
    expect(markdownLoadMode('- ```js\n  const price = "$5";\n  ```')).toBe('code');
    expect(markdownLoadMode('> - ~~~ts\n>   const n = 1;\n>   ~~~')).toBe('code');
    expect(markdownLoadMode('$x$\n\n1. ```py\n   print(x)\n   ```')).toBe('math-code');
  });

  it('recognizes indented code after nested CommonMark quote containers', () => {
    expect(markdownLoadMode('>     print("$x$")')).toBe('code');
    expect(markdownLoadMode('> >     print("nested")')).toBe('code');
    expect(markdownLoadMode('> \tprint("tab")')).toBe('code');
    expect(markdownLoadMode('$outside$\n\n>     print("$inside$")')).toBe('math-code');
  });

  it('does not treat container-like prose with an inline fence mention as code', () => {
    expect(markdownLoadMode('ordinary prose > ```js is just a mention')).toBe('basic');
    expect(markdownLoadMode('- ordinary prose mentions ```js later')).toBe('basic');
    expect(markdownLoadMode('> ordinary prose mentions ```js later')).toBe('basic');
  });

  it('does not mistake dollar signs inside code for formulas', () => {
    expect(markdownLoadMode('```ts\nconst a = "$5"; const b = "$6";\n```')).toBe('code');
    expect(markdownLoadMode('use `$x$` as a literal')).toBe('basic');
  });

  it('selects both enhancements only when both AST features are present', () => {
    expect(markdownLoadMode('$x^2$\n\n```python\nprint(x)\n```')).toBe('math-code');
  });
});
