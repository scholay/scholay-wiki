export type MarkdownLoadMode = 'basic' | 'math' | 'code' | 'math-code';

const FENCE_RE = /^[ \t]{0,3}(`{3,}|~{3,})/;
// CommonMark 容器标记位于块内容之前：blockquote 用 `>`，list 用
// `-` / `1.` 等。只剥离行首的完整容器标记，避免把正文中提到的 ``` 误判为代码块。
const CONTAINER_PREFIX_RE = /^[ \t]{0,3}(?:> ?|(?:[-+*]|\d{1,9}[.)])[ \t]+)/;
// CommonMark 缩进代码是“至少”四空格或一个 tab，后面还可继续缩进。
const INDENTED_CODE_LINE_RE = /^(?: {4}|\t)[ \t]*\S/;

function markdownContainerContent(line: string): string {
  let content = line;
  while (true) {
    const prefix = content.match(CONTAINER_PREFIX_RE)?.[0];
    if (!prefix) break;
    content = content.slice(prefix.length);
  }
  return content;
}

function fenceDelimiter(line: string): string {
  return markdownContainerContent(line).match(FENCE_RE)?.[1] ?? '';
}

function isIndentedCodeLine(line: string): boolean {
  return INDENTED_CODE_LINE_RE.test(markdownContainerContent(line));
}

function isEscaped(text: string, index: number): boolean {
  let slashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i -= 1) slashes += 1;
  return slashes % 2 === 1;
}

function stripInlineCode(line: string): string {
  let output = '';
  let cursor = 0;
  while (cursor < line.length) {
    if (line[cursor] !== '`') {
      output += line[cursor];
      cursor += 1;
      continue;
    }
    let runEnd = cursor + 1;
    while (line[runEnd] === '`') runEnd += 1;
    const delimiter = line.slice(cursor, runEnd);
    const closing = line.indexOf(delimiter, runEnd);
    // 未闭合反引号在 Markdown 中只是普通文本,不应把后半段错误屏蔽。
    if (closing < 0) return output + line.slice(cursor);
    output += ' '.repeat(closing + delimiter.length - cursor);
    cursor = closing + delimiter.length;
  }
  return output;
}

/**
 * 剥掉 fenced/indented/inline code 后再识别数学分隔符。这与 Markdown AST 的优先级一致:
 * `const price = "$5"` 会需要 highlight,但不应因代码里的美元符号额外下载 KaTeX。
 */
function markdownOutsideCode(text: string): string {
  let fenceChar = '';
  let fenceLength = 0;
  const output: string[] = [];

  for (const line of text.split('\n')) {
    const fence = fenceDelimiter(line);
    if (fenceChar) {
      if (fence && fence[0] === fenceChar && fence.length >= fenceLength) {
        fenceChar = '';
        fenceLength = 0;
      }
      output.push('');
      continue;
    }
    if (fence) {
      fenceChar = fence[0];
      fenceLength = fence.length;
      output.push('');
      continue;
    }
    if (isIndentedCodeLine(line)) {
      output.push('');
      continue;
    }
    output.push(stripInlineCode(line));
  }
  return output.join('\n');
}

function hasMathDelimiter(text: string): boolean {
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== '$' || isEscaped(text, start)) continue;
    const delimiterLength = text[start + 1] === '$' ? 2 : 1;
    // 单 $ 不能是 $$ 的后一半。
    if (delimiterLength === 1 && text[start - 1] === '$') continue;

    for (let end = start + delimiterLength; end < text.length; end += 1) {
      if (text[end] !== '$' || isEscaped(text, end)) continue;
      if (delimiterLength === 2) {
        if (text[end + 1] !== '$') continue;
      } else if (text[end - 1] === '$' || text[end + 1] === '$') {
        continue;
      }
      if (text.slice(start + delimiterLength, end).trim()) return true;
      start = end + delimiterLength - 1;
      break;
    }
  }
  return false;
}

/** 纯函数,便于锁定内容分流边界与流式输入的退化行为。 */
export function markdownLoadMode(text: string): MarkdownLoadMode {
  const hasCode = text
    .split('\n')
    .some((line) => !!fenceDelimiter(line) || isIndentedCodeLine(line));
  const hasMath = hasMathDelimiter(markdownOutsideCode(text));
  if (hasCode && hasMath) return 'math-code';
  if (hasCode) return 'code';
  if (hasMath) return 'math';
  return 'basic';
}
