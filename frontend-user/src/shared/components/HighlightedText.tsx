import { useMemo } from 'react';
import Highlighter from 'react-highlight-words';

/**
 * 把 text 中匹配 query 关键词的片段套 <mark>。
 *
 * 匹配引擎复用 `react-highlight-words`(成熟稳定:正则转义 / 大小写选项 / 重叠合并都内置)。
 * 我们只做 tokenize:从 query 里切出有意义的 token 数组传给库。
 *
 * Tokenize 规则:
 *   - 按非字母数字 / 非 CJK 分割
 *   - 跳过英语停用词(of/the/and/...)
 *   - 长度 ≥ 2 保留;长度 = 1 仅数字保留(DOI 尾部 -9 / 版本号 v1 等)
 *   - 字母 / CJK 单字符跳过(否则每个 "a" / 中文常用字会被高亮成视觉噪声)
 */

const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'of',
  'in',
  'on',
  'at',
  'for',
  'to',
  'with',
  'by',
  'is',
  'are',
  'be',
  'as',
  'from',
]);

function tokenize(q: string): string[] {
  if (!q) return [];
  const tokens = q
    .toLowerCase()
    .split(/[^a-z0-9一-鿿]+/)
    .filter((t) => {
      if (t.length === 0) return false;
      if (STOP_WORDS.has(t)) return false;
      if (t.length >= 2) return true;
      // 单字符 token:仅数字 OK,字母/CJK 跳过 —— 详见上面注释
      return /^\d$/.test(t);
    });
  // 去重保持顺序(库内部也有 dedupe 但这里先省一次正则编译)
  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const t of tokens) {
    if (!seen.has(t)) {
      seen.add(t);
      uniq.push(t);
    }
  }
  return uniq;
}

interface HighlightedTextProps {
  text: string;
  /**
   * 搜索词:
   *   - string   → 自身作 phrase token + 拆词 token 一起喂给库
   *   - string[] → 每个元素都按上面规则处理(适合多字段:title + DOI + arxiv 分开传)
   *
   * 把 phrase 也加进去的原因:react-highlight-words 默认按每个 searchWord
   * 独立查子串,词之间的空格不会被高亮 → 看起来"漏色"。把整段 phrase 自身作为
   * 一条 searchWord,库匹到时会**连续覆盖整段含空格**,视觉上整行黄底。
   * 库内部 chunk 合并算法会处理 phrase 和 word 重叠,不会重复包 <mark>。
   */
  query: string | string[];
  /** 自定义 mark 样式;默认 brand-amber 软底,与 .pen 设计稿一致 */
  markClassName?: string;
}

/**
 * 把传入 query 展开成 react-highlight-words 的 searchWords 数组:
 *   每个 phrase 自身 + phrase 拆出的 word tokens,全部去重保序
 */
function buildSearchWords(query: string | string[]): string[] {
  const phrases = Array.isArray(query) ? query : [query];
  const result: string[] = [];
  const seen = new Set<string>();
  const add = (s: string) => {
    if (!s) return;
    const key = s.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(s);
  };
  for (const phrase of phrases) {
    if (!phrase) continue;
    const trimmed = phrase.trim();
    if (!trimmed) continue;
    add(trimmed); // ← phrase 整段 token,让连续高亮成为可能
    for (const t of tokenize(trimmed)) add(t);
  }
  return result;
}

export function HighlightedText({
  text,
  query,
  markClassName = 'bg-warning-soft text-foreground rounded-[2px]',
}: HighlightedTextProps) {
  const searchWords = useMemo(() => buildSearchWords(query), [query]);

  // 库要求 textToHighlight 必须是 string。null/undefined 兜底成 ""。
  // 空查询 → 库不渲染任何 mark,等价于直接显示原文,这是想要的行为。
  return (
    <Highlighter
      searchWords={searchWords}
      textToHighlight={text ?? ''}
      highlightTag="mark"
      highlightClassName={markClassName}
      // autoEscape: 正则元字符(. * + ? 等)被转义,防止 token 里带 "/" 或 "." 报错
      autoEscape
      // 默认就是 case-insensitive,显式注释一下
      caseSensitive={false}
    />
  );
}
