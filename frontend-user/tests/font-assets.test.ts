/**
 * 字体资产离线契约。
 *
 * 这里只校验仓库内的 CSS 和 woff2 映射，不依赖网络或 document.fonts。
 * 目的是在构建前拦住三类静默退化：忘记 import、字重范围改窄、CSS 引用了未提交的分片。
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { ROOT_TOKENS, stripCssComments } from './lib/design-tokens';

const ROOT = join(__dirname, '..');
const PUBLIC = join(ROOT, 'public');
const GLOBALS = readFileSync(
  join(ROOT, 'src', 'styles', 'globals.css'),
  'utf8',
);
const GOOGLE_CSS = readFileSync(
  join(ROOT, 'src', 'styles', 'fonts', 'google-sans.css'),
  'utf8',
);
const NOTO_CSS = readFileSync(
  join(ROOT, 'src', 'styles', 'fonts', 'noto-serif-sc.css'),
  'utf8',
);

function fontFaces(css: string, family: string): string[] {
  return [...css.matchAll(/@font-face\s*\{([\s\S]*?)\}/g)]
    .map((match) => match[1])
    .filter((block) =>
      new RegExp(String.raw`font-family:\s*['"]${family}['"]\s*;`).test(block),
    );
}

function woff2Urls(css: string): string[] {
  return [
    ...new Set(
      [...css.matchAll(/url\(\s*['"]?([^'"\s)]+\.woff2)['"]?\s*\)/g)].map(
        (match) => match[1],
      ),
    ),
  ];
}

function publicPath(url: string): string {
  expect(url, `字体 URL 必须是 public 根路径: ${url}`).toMatch(/^\/fonts\//);
  return join(PUBLIC, url.slice(1));
}

describe('字体 CSS 入口', () => {
  it('globals.css 导入 Google Sans 与 Noto Serif SC 生成物', () => {
    const css = stripCssComments(GLOBALS);
    expect(css).toMatch(/@import\s+['"]\.\/fonts\/google-sans\.css['"]\s*;/);
    expect(css).toMatch(/@import\s+['"]\.\/fonts\/noto-serif-sc\.css['"]\s*;/);
    expect(css).not.toMatch(/Plus Jakarta Sans|plus-jakarta-sans/i);
  });
});

describe('Google Sans 资产', () => {
  it('normal / italic 的 latin / latin-ext 版本化分片都存在', () => {
    const faces = fontFaces(GOOGLE_CSS, 'Google Sans');
    expect(faces).toHaveLength(4);
    for (const face of faces) {
      expect(face).toMatch(/font-weight:\s*400\s+700\s*;/);
      expect(face).toMatch(/font-display:\s*swap\s*;/);
      expect(face).toMatch(/unicode-range:\s*U\+/);
    }
    expect(faces.filter((face) => /font-style:\s*normal\s*;/.test(face))).toHaveLength(2);
    expect(faces.filter((face) => /font-style:\s*italic\s*;/.test(face))).toHaveLength(2);

    const urls = woff2Urls(GOOGLE_CSS).sort();
    expect(urls).toEqual(
      [
        '/fonts/google-sans/v70/google-sans-italic-latin-ext.woff2',
        '/fonts/google-sans/v70/google-sans-italic-latin.woff2',
        '/fonts/google-sans/v70/google-sans-normal-latin-ext.woff2',
        '/fonts/google-sans/v70/google-sans-normal-latin.woff2',
      ].sort(),
    );
    for (const url of urls)
      expect(existsSync(publicPath(url)), `缺少字体资产: ${url}`).toBe(true);

    const files = readdirSync(join(PUBLIC, 'fonts', 'google-sans', 'v70'))
      .filter((name) => name.endsWith('.woff2'))
      .sort();
    expect(files).toEqual(urls.map((url) => basename(url)).sort());
  });

  it('manifest 与许可证锁定官方来源和版本', () => {
    const dir = join(PUBLIC, 'fonts', 'google-sans', 'v70');
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
    const license = readFileSync(join(dir, 'OFL.txt'), 'utf8');

    expect(manifest.family).toBe('Google Sans');
    expect(manifest.version).toBe('v70');
    expect(manifest.files).toHaveLength(4);
    expect(manifest.metadataVerification).toEqual({
      family: 'Google Sans',
      license: 'ofl',
      isOpenSource: true,
    });
    expect(manifest.officialSources.specimen).toBe(
      'https://fonts.google.com/specimen/Google+Sans',
    );
    expect(license).toContain('The Google Sans Project Authors');
    expect(license).toContain('SIL OPEN FONT LICENSE Version 1.1');
  });
});

describe('Noto Serif SC 资产', () => {
  it('101 个唯一分片都存在，且每个 @font-face 都覆盖 300–900', () => {
    const faces = fontFaces(NOTO_CSS, 'Noto Serif SC');
    expect(faces).toHaveLength(101);
    for (const face of faces)
      expect(face).toMatch(/font-weight:\s*300\s+900\s*;/);

    const urls = woff2Urls(NOTO_CSS);
    expect(urls).toHaveLength(101);
    for (const url of urls)
      expect(existsSync(publicPath(url)), `缺少字体分片: ${url}`).toBe(true);

    const files = readdirSync(join(PUBLIC, 'fonts', 'noto-serif-sc'))
      .filter((name) => name.endsWith('.woff2'))
      .sort();
    expect(files).toEqual(urls.map((url) => basename(url)).sort());
  });
});

describe('Playfair Display 资产', () => {
  it('仅作为冻结品牌字样，latin / latin-ext 仍可离线加载', () => {
    const faces = fontFaces(GLOBALS, 'Playfair Display');
    expect(faces).toHaveLength(2);
    for (const face of faces) {
      expect(face).toMatch(/font-weight:\s*400\s+700\s*;/);
      expect(face).toMatch(/font-display:\s*swap\s*;/);
    }

    const urls = woff2Urls(faces.join('\n'));
    expect(urls).toHaveLength(2);
    for (const url of urls)
      expect(existsSync(publicPath(url)), `缺少字体资产: ${url}`).toBe(true);
  });
});

describe('UI 字体回退链', () => {
  it('所有非品牌 UI 角色都以 Google Sans → Noto Serif SC 逐字形分流', () => {
    for (const token of ['--font-sans', '--font-serif', '--font-display']) {
      const raw = ROOT_TOKENS.get(token);
      expect(raw, `globals.css 主 :root 缺少 ${token}`).toBeDefined();
      const families = raw!
        .split(',')
        .map((name) => name.trim().replace(/^['"]|['"]$/g, ''));

      expect(families.slice(0, 2), `${token} 的中英文主字体顺序错了`).toEqual([
        'Google Sans',
        'Noto Serif SC',
      ]);
      expect(families).not.toContain('Google Sans Text');
      expect(families).not.toContain('Plus Jakarta Sans');
      expect(families).not.toContain('Arial');
    }
  });

  it('Playfair 只留在 font-brand，BrandName 不再借用通用 display 角色', () => {
    const brand = ROOT_TOKENS.get('--font-brand');
    expect(brand).toBeDefined();
    expect(brand!.split(',')[0].trim().replace(/^['"]|['"]$/g, '')).toBe(
      'Playfair Display',
    );

    const source = readFileSync(
      join(ROOT, 'src', 'shared', 'components', 'BrandName.tsx'),
      'utf8',
    );
    expect(source).toContain('font-brand');
    expect(source).not.toContain("'font-display");
  });
});
