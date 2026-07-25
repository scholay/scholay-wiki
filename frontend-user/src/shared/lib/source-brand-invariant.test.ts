/**
 * 数据源品牌不变量 —— 回归护栏。
 *
 * 商务硬约束:对终端用户**绝不能出现上游真实数据源名**(Semantic Scholar / OpenAlex / PubMed),
 * 展示层一律输出品牌名 Graph / Discovery / Medicine / Journal。
 *
 * 为什么要有这个测试:2026-07 的「W6 真名化」曾把 maskToolSource(遮蔽层)与 normalizeSourceBrand
 * (品牌映射)双双反转成输出真名 —— 遮罩变曝光器,且无任何测试拦住。这里把方向钉死。
 */
import { describe, test, expect } from 'vitest';
import { maskToolSource } from './mask-tool-source';
import { normalizeSourceBrand, displaySourceLabel } from './data-source-brand';
import { SOURCE_OPTIONS } from './search-filters';
import { SOURCE_META, sourceFullLabel, sourceLetter, sourceDescription } from './source';

/** 任何展示层输出里都不允许出现的上游真名(大小写/分隔符变体一并拦)。 */
const FORBIDDEN = /semantic\s*scholar|open\s*alex|pub\s*med/i;

/** 允许的对外品牌名。 */
const ALLOWED = new Set(['Graph', 'Discovery', 'Medicine', 'Journal']);

const INTERNAL_TOKENS = [
  'semantic', 'semanticscholar', 'semantic_scholar', 'stc',
  'openalex', 'open_alex', 'olx',
  'pubmed', 'pub_med', 'pmd',
  'minicod', 'jnl',
];

describe('数据源品牌不变量', () => {
  test('normalizeSourceBrand 对所有内部 token 只输出品牌名,绝不输出真名', () => {
    for (const tok of INTERNAL_TOKENS) {
      const brand = normalizeSourceBrand(tok);
      expect(brand, `token=${tok}`).toBeDefined();
      expect(ALLOWED.has(brand!), `token=${tok} → ${brand}`).toBe(true);
      expect(FORBIDDEN.test(brand!), `token=${tok} → ${brand}`).toBe(false);
    }
  });

  test('normalizeSourceBrand 接受真名作输入(旧 transcript 兼容),但输出仍是品牌名', () => {
    expect(normalizeSourceBrand('Semantic Scholar')).toBe('Graph');
    expect(normalizeSourceBrand('OpenAlex')).toBe('Discovery');
    expect(normalizeSourceBrand('PubMed')).toBe('Medicine');
  });

  test('displaySourceLabel 不把内部码或真名漏给 UI', () => {
    for (const tok of [...INTERNAL_TOKENS, 'Semantic Scholar', 'OpenAlex', 'PubMed']) {
      expect(FORBIDDEN.test(displaySourceLabel(tok) ?? ''), `token=${tok}`).toBe(false);
    }
    // 真实 venue 原样保留(不误伤)
    expect(displaySourceLabel('Nature Medicine')).toBe('Nature Medicine');
    expect(displaySourceLabel('arXiv')).toBe('arXiv');
  });

  test('SOURCE_OPTIONS 的用户可见 label 不含真名', () => {
    for (const opt of SOURCE_OPTIONS) {
      expect(FORBIDDEN.test(opt.label), `label=${opt.label}`).toBe(false);
    }
  });

  test('maskToolSource 遮蔽对象里的 source 字段(方向:内部 enum → 品牌名)', () => {
    const masked = maskToolSource({ source: 'openalex', query: 'graphene', nested: [{ source: 'pmd' }] });
    expect(JSON.stringify(masked)).not.toMatch(FORBIDDEN);
    expect((masked as { source: string }).source).toBe('Discovery');
    expect(JSON.stringify(masked)).toContain('Medicine');
  });

  test('maskToolSource 遮蔽字符串化 JSON 与自由文本里裸露的内部 token', () => {
    const raw = '{"items":[{"source":"olx","title":"x"}]} fetch failed for openalex endpoint (pmd fallback)';
    const masked = maskToolSource(raw) as string;
    expect(masked).not.toMatch(FORBIDDEN);
    expect(masked).not.toMatch(/\bolx\b|\bopenalex\b|\bpmd\b/i);
    expect(masked).toContain('Discovery');
  });

  test('maskToolSource 不误伤正文里的普通英文词', () => {
    const s = 'semantic web research in medicine, published in a journal';
    expect(maskToolSource(s)).toBe(s);
  });

  // SOURCE_META 是 SourceBadge(6 处调用)+ 搜索侧栏 Tooltip 的唯一真相 —— W6 曾把它改成真名,
  // 导致 hover 任意论文来源角标就露出 PubMed/OpenAlex/Semantic Scholar。这里钉死。
  test('SOURCE_META 的 name/letter/description 不含真名,且 letter 是品牌首字母', () => {
    const expected = { stc: ['G', 'Graph'], olx: ['D', 'Discovery'], pmd: ['M', 'Medicine'] } as const;
    for (const [code, [letter, name]] of Object.entries(expected)) {
      const meta = SOURCE_META[code as keyof typeof SOURCE_META];
      expect(meta.name, code).toBe(name);
      expect(meta.letter, code).toBe(letter);
      expect(FORBIDDEN.test(meta.description), code).toBe(false);
    }
  });

  test('source.ts 的展示 helper 输出不含真名,也不露内部 code', () => {
    for (const code of ['stc', 'olx', 'pmd'] as const) {
      const full = sourceFullLabel(code);
      expect(FORBIDDEN.test(full), code).toBe(false);
      expect(/\b(stc|olx|pmd)\b/i.test(full), code).toBe(false);
      expect(FORBIDDEN.test(sourceDescription(code)), code).toBe(false);
      expect(['G', 'D', 'M']).toContain(sourceLetter(code));
    }
  });
});
