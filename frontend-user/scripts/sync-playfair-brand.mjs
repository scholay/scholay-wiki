/**
 * 同步 Playfair Display 品牌子集。
 *
 * Playfair 在产品中只允许由 BrandName 渲染“Scholay”；下载整个 Latin
 * 可变字体没有意义。Google Fonts `text=` 会从同一官方字体生成字形级
 * WOFF2，该脚本将其镜像到本地，生产不依赖 Google CDN。
 *
 * 用法: node scripts/sync-playfair-brand.mjs
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONT_ROOT = join(ROOT, 'public', 'fonts', 'playfair-display');
const CSS_OUT = join(ROOT, 'src', 'styles', 'fonts', 'playfair-display.css');
const MANIFEST_OUT = join(FONT_ROOT, 'manifest.json');
const LICENSE_OUT = join(FONT_ROOT, 'OFL.txt');
const BRAND_TEXT = 'Scholay';
const CSS_URL =
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400..700&display=swap&text=Scholay';
const LICENSE_URL =
  'https://raw.githubusercontent.com/google/fonts/main/ofl/playfairdisplay/OFL.txt';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function assertWoff2(buffer, label) {
  if (buffer.length < 4 || buffer.subarray(0, 4).toString('ascii') !== 'wOF2') {
    throw new Error(`${label} 不是有效的 WOFF2 文件`);
  }
}

function writeAtomicIfChanged(file, content) {
  const next = Buffer.isBuffer(content) ? content : Buffer.from(content);
  if (existsSync(file) && readFileSync(file).equals(next)) return false;
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, next);
  renameSync(temporary, file);
  return true;
}

async function fetchBuffer(url, label) {
  const response = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!response.ok) throw new Error(`${label} ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  mkdirSync(FONT_ROOT, { recursive: true });
  mkdirSync(dirname(CSS_OUT), { recursive: true });

  const [cssBuffer, license] = await Promise.all([
    fetchBuffer(CSS_URL, 'Google Fonts CSS'),
    fetchBuffer(LICENSE_URL, 'Google Fonts OFL'),
  ]);
  const css = cssBuffer.toString('utf8');
  if (!license.toString('utf8').includes('SIL OPEN FONT LICENSE Version 1.1')) {
    throw new Error('Playfair Display 许可证内容校验失败');
  }

  const sourceUrl = /url\((https:\/\/[^)]+)\)/.exec(css)?.[1];
  const unicodeRange = /unicode-range:\s*([^;]+);/.exec(css)?.[1]?.trim();
  const version = /[?&]v=(v\d+)/.exec(sourceUrl ?? '')?.[1];
  if (!sourceUrl || !unicodeRange || !version) {
    throw new Error('Google Fonts Playfair 子集 CSS 结构异常');
  }

  const versionDir = join(FONT_ROOT, version);
  const file = 'playfair-display-brand.woff2';
  const destination = join(versionDir, file);
  mkdirSync(versionDir, { recursive: true });

  let previous = {};
  if (existsSync(MANIFEST_OUT)) {
    try {
      previous = JSON.parse(readFileSync(MANIFEST_OUT, 'utf8'));
    } catch {
      // 旧 manifest 损坏时重新下载，不会复用未校验资产。
    }
  }

  let font;
  let reused = false;
  if (
    previous.sourceUrl === sourceUrl &&
    previous.sha256 &&
    existsSync(destination) &&
    previous.sha256 === sha256((font = readFileSync(destination)))
  ) {
    assertWoff2(font, file);
    reused = true;
  } else {
    font = await fetchBuffer(sourceUrl, 'Google Fonts Playfair WOFF2');
    assertWoff2(font, file);
    writeAtomicIfChanged(destination, font);
  }

  const localUrl = `/fonts/playfair-display/${version}/${file}`;
  const generatedCss = `/* =============================================================================
 * Playfair Display —— 自动生成【请勿手改】
 * 只包含品牌字样 “${BRAND_TEXT}” 的字形；由 scripts/sync-playfair-brand.mjs 镜像。
 * ============================================================================= */

@font-face {
  font-family: 'Playfair Display';
  font-style: normal;
  font-weight: 400 700;
  font-display: swap;
  src: url('${localUrl}') format('woff2');
  unicode-range: ${unicodeRange};
}
`;

  const manifest = {
    schemaVersion: 1,
    family: 'Playfair Display',
    version,
    text: BRAND_TEXT,
    weightRange: '400 700',
    sourceCss: CSS_URL,
    sourceUrl,
    unicodeRange,
    file: `${version}/${file}`,
    bytes: font.length,
    sha256: sha256(font),
    license: {
      file: 'OFL.txt',
      sourceUrl: LICENSE_URL,
      sha256: sha256(license),
    },
  };

  writeAtomicIfChanged(CSS_OUT, generatedCss);
  writeAtomicIfChanged(LICENSE_OUT, license);
  writeAtomicIfChanged(MANIFEST_OUT, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `[playfair-brand] ${reused ? '安全复用' : '下载'} ${font.length} bytes · ${localUrl}`
  );
}

main().catch((error) => {
  console.error('[playfair-brand] 失败:', error.message);
  process.exit(1);
});
