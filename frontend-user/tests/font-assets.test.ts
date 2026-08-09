/**
 * 字体资产离线契约。
 *
 * 这里只校验仓库内的 CSS 和 woff2 映射，不依赖网络或 document.fonts。
 * 目的是在构建前拦住三类静默退化：忘记 import、字重范围改窄、CSS 引用了未提交的分片。
 */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { ROOT_TOKENS, stripCssComments } from './lib/design-tokens';

const ROOT = join(__dirname, '..');
const REPO_ROOT = join(ROOT, '..');
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
const PLAYFAIR_CSS = readFileSync(
  join(ROOT, 'src', 'styles', 'fonts', 'playfair-display.css'),
  'utf8',
);
const INDEX_HTML = readFileSync(join(ROOT, 'index.html'), 'utf8');
const FRONTEND_NGINX = readFileSync(join(ROOT, 'nginx.conf'), 'utf8');
const EDGE_NGINX_PATH = join(REPO_ROOT, 'nginx', 'conf.d', 'user.conf');
// frontend-user 镜像的 build context 只有本目录，外层 Nginx 不在物理上下文中；
// 完整仓库 CI 仍校验两层，镜像内则只校验可见的内层契约。
const EDGE_NGINX = existsSync(EDGE_NGINX_PATH)
  ? readFileSync(EDGE_NGINX_PATH, 'utf8')
  : null;

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

function rangeContains(raw: string, point: number): boolean {
  return raw.split(/,\s*/).some((token) => {
    const match = /^U\+([\da-f]+)(?:-([\da-f]+))?$/i.exec(token);
    if (!match) return false;
    const start = Number.parseInt(match[1], 16);
    const end = Number.parseInt(match[2] ?? match[1], 16);
    return point >= start && point <= end;
  });
}

function faceRange(face: string): string {
  return /unicode-range:\s*([^;]+);/i.exec(face)?.[1] ?? '';
}

describe('字体 CSS 入口', () => {
  it('globals.css 导入三组自托管字体生成物', () => {
    const css = stripCssComments(GLOBALS);
    expect(css).toMatch(/@import\s+['"]\.\/fonts\/google-sans\.css['"]\s*;/);
    expect(css).toMatch(/@import\s+['"]\.\/fonts\/playfair-display\.css['"]\s*;/);
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
  it('首屏常用字子集 + 101 个完整兜底分片均存在', () => {
    const faces = fontFaces(NOTO_CSS, 'Noto Serif SC');
    expect(faces).toHaveLength(102);
    for (const face of faces)
      expect(face).toMatch(/font-weight:\s*300\s+900\s*;/);

    const urls = woff2Urls(NOTO_CSS);
    expect(urls).toHaveLength(102);
    for (const url of urls)
      expect(existsSync(publicPath(url)), `缺少字体分片: ${url}`).toBe(true);

    const manifest = JSON.parse(
      readFileSync(join(PUBLIC, 'fonts', 'noto-serif-sc', 'manifest.json'), 'utf8'),
    );
    expect(manifest.sourceVersion).toBe('v35');
    expect(manifest.fallbackDirectory).toBe(manifest.sourceVersion);

    const fallbackUrls = urls.filter((url) => !url.includes('/noto-serif-sc-ui-'));
    expect(fallbackUrls).toHaveLength(101);
    for (const url of fallbackUrls) {
      expect(url).toMatch(
        new RegExp(`^/fonts/noto-serif-sc/${manifest.sourceVersion}/noto-serif-sc-\\d{3}\\.woff2$`),
      );
    }

    const files = readdirSync(
      join(PUBLIC, 'fonts', 'noto-serif-sc', manifest.fallbackDirectory),
    )
      .filter((name) => name.endsWith('.woff2'))
      .sort();
    expect(files).toEqual(fallbackUrls.map((url) => basename(url)).sort());

    const rootFiles = readdirSync(join(PUBLIC, 'fonts', 'noto-serif-sc'))
      .filter((name) => name.endsWith('.woff2'))
      .sort();
    expect(rootFiles).toContain(manifest.critical.file);
    for (const file of rootFiles) {
      expect(file).toMatch(/^noto-serif-sc-ui-[a-f\d]{12}\.woff2$/);
      const bytes = readFileSync(join(PUBLIC, 'fonts', 'noto-serif-sc', file));
      expect(file).toBe(`noto-serif-sc-ui-${createHash('sha256').update(bytes).digest('hex').slice(0, 12)}.woff2`);
    }
  });

  it('全局 UI 常用字收敛为一个可控的关键请求，与兜底范围无重叠', () => {
    const manifest = JSON.parse(
      readFileSync(join(PUBLIC, 'fonts', 'noto-serif-sc', 'manifest.json'), 'utf8'),
    );
    expect(manifest.schemaVersion).toBe(4);
    expect(manifest.sourceVersion).toMatch(/^v\d+$/);
    expect(manifest.fallbackDirectory).toBe(manifest.sourceVersion);
    expect(new URL(manifest.critical.sourceUrl).searchParams.get('v')).toBe(
      manifest.sourceVersion,
    );
    expect(manifest.critical.file).toMatch(/^noto-serif-sc-ui-[a-f\d]{12}\.woff2$/);
    expect(manifest.critical.file).toBe(
      `noto-serif-sc-ui-${manifest.critical.sha256.slice(0, 12)}.woff2`,
    );
    // 包含首页固定文案后仍小于 64KiB；这个预算防止未来把动态新闻
    // 或大字库误塞进关键子集。
    expect(manifest.critical.bytes).toBeLessThan(64 * 1024);
    const criticalBytes = readFileSync(
      join(PUBLIC, 'fonts', 'noto-serif-sc', manifest.critical.file),
    );
    expect(createHash('sha256').update(criticalBytes).digest('hex')).toBe(
      manifest.critical.sha256,
    );
    expect(manifest.files).toHaveLength(101);
    for (const file of manifest.files) {
      expect(file.file).toMatch(
        new RegExp(`^${manifest.sourceVersion}/noto-serif-sc-\\d{3}\\.woff2$`),
      );
      expect(file.sourceUrl).toContain(`/notoserifsc/${manifest.sourceVersion}/`);
      const bytes = readFileSync(join(PUBLIC, 'fonts', 'noto-serif-sc', file.file));
      expect(bytes.byteLength).toBe(file.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256);
    }

    const criticalFace = fontFaces(NOTO_CSS, 'Noto Serif SC').find((face) =>
      face.includes(`/${manifest.critical.file}`),
    );
    expect(criticalFace).toBeDefined();
    const criticalRange = faceRange(criticalFace!);
    const fallbackFaces = fontFaces(NOTO_CSS, 'Noto Serif SC').filter(
      (face) => !face.includes(`/${manifest.critical.file}`),
    );

    const points = [...manifest.critical.text].map((char: string) => char.codePointAt(0)!);
    for (const point of points) {
      expect(rangeContains(criticalRange, point), `常用字子集缺 U+${point.toString(16)}`).toBe(true);
      expect(
        fallbackFaces.some((face) => rangeContains(faceRange(face), point)),
        `常用字 U+${point.toString(16)} 仍与兜底分片重叠`,
      ).toBe(false);
    }

    const oldHitFiles = manifest.files.filter((file: { unicodeRange: string }) =>
      points.some((point: number) => rangeContains(file.unicodeRange, point)),
    );
    // 当前固定 UI 文案若不做子集会击中 11 个 Google 分片；
    // 这里用下限表达“必须实质减少请求”，允许后续 UI 文案正常扩展。
    expect(oldHitFiles.length).toBeGreaterThanOrEqual(8);
    expect(oldHitFiles.reduce((sum: number, file: { bytes: number }) => sum + file.bytes, 0))
      .toBeGreaterThan(manifest.critical.bytes * 10);
  });

  it('1y immutable 字体只使用版本目录或内容哈希 URL', () => {
    const urls = woff2Urls(NOTO_CSS);
    expect(urls).toHaveLength(102);
    for (const url of urls) {
      expect(
        /\/v\d+\/noto-serif-sc-\d{3}\.woff2$/.test(url) ||
          /\/noto-serif-sc-ui-[a-f\d]{12}\.woff2$/.test(url),
        `immutable URL 未版本化: ${url}`,
      ).toBe(true);
    }
    expect(FRONTEND_NGINX).toMatch(
      /location\s+~\*\s+\\\.\(woff\|woff2\|ttf\|eot\|otf\)\$[\s\S]*?max-age=31536000, immutable/,
    );
    if (EDGE_NGINX) {
      expect(EDGE_NGINX).toMatch(
        /location\s+~\*\s+\\\.\(jpg\|jpeg\|png\|gif\|ico\|svg\|webp\|woff\|woff2[\s\S]*?max-age=31536000, immutable/,
      );
    }
  });

  it('迁移前的根分片 URL 永久兼容到其原始 v35 bytes', () => {
    expect(FRONTEND_NGINX).toMatch(
      /\^\/fonts\/noto-serif-sc\/\(noto-serif-sc-\[0-9\]\{3\}\\\.woff2\)\$/,
    );
    expect(FRONTEND_NGINX).toContain('try_files /fonts/noto-serif-sc/v35/$1 =404;');
  });
});

describe('Playfair Display 资产', () => {
  it('仅保留 Scholay 品牌字形，不再下载完整 Latin 字库', () => {
    const faces = fontFaces(PLAYFAIR_CSS, 'Playfair Display');
    expect(faces).toHaveLength(1);
    for (const face of faces) {
      expect(face).toMatch(/font-weight:\s*400\s+700\s*;/);
      expect(face).toMatch(/font-display:\s*swap\s*;/);
    }

    const urls = woff2Urls(faces.join('\n'));
    expect(urls).toHaveLength(1);
    for (const url of urls)
      expect(existsSync(publicPath(url)), `缺少字体资产: ${url}`).toBe(true);

    const manifest = JSON.parse(
      readFileSync(join(PUBLIC, 'fonts', 'playfair-display', 'manifest.json'), 'utf8'),
    );
    expect(manifest.text).toBe('Scholay');
    expect(manifest.bytes).toBeLessThan(5 * 1024);
    for (const char of new Set('Scholay')) {
      expect(rangeContains(faceRange(faces[0]), char.codePointAt(0)!)).toBe(true);
    }
    expect(PLAYFAIR_CSS).not.toContain('latin-ext');
  });

  it('index 只 preload 首屏必需的 Google Sans normal、Noto UI 与 Playfair 品牌子集', () => {
    const notoManifest = JSON.parse(
      readFileSync(join(PUBLIC, 'fonts', 'noto-serif-sc', 'manifest.json'), 'utf8'),
    );
    expect(INDEX_HTML).toContain('/fonts/google-sans/v70/google-sans-normal-latin.woff2');
    expect(INDEX_HTML).toContain(`/fonts/noto-serif-sc/${notoManifest.critical.file}`);
    expect(INDEX_HTML).not.toContain('/fonts/noto-serif-sc/noto-serif-sc-ui.woff2');
    expect(INDEX_HTML).toContain('/fonts/playfair-display/v40/playfair-display-brand.woff2');
    expect(INDEX_HTML).not.toContain('/fonts/playfair-display-var-latin.woff2');
  });
});

describe('边缘 Nginx 静态路由契约', () => {
  it('/uploads 使用 ^~ 并位于扩展名正则之前，图片不得被误送前端', () => {
    if (!EDGE_NGINX) return;

    const uploadsLocation = 'location ^~ /uploads/ {';
    const staticAssetLocation =
      'location ~* \\.(jpg|jpeg|png|gif|ico|svg|webp|woff|woff2|ttf|eot|css|js|mjs|wasm)$ {';
    expect(EDGE_NGINX).toContain(uploadsLocation);
    expect(EDGE_NGINX).toContain(staticAssetLocation);
    expect(EDGE_NGINX.indexOf(uploadsLocation)).toBeLessThan(
      EDGE_NGINX.indexOf(staticAssetLocation),
    );
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
