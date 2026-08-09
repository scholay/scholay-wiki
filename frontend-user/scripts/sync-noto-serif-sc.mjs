/**
 * 同步 Noto Serif SC 自托管资产。
 *
 * 为什么镜像 Google Fonts 的分片而不是自己合并成大文件:
 *   Noto Serif SC 全量约 5.7MB。Google Fonts 的 unicode-range 分片让浏览器
 *   只下载页面实际出现的字符，一个中文页面通常只命中 5–15 片。
 *
 * 它是可变字体 (wght 300–900)，所有字重共用每个 WOFF2 分片。
 *
 * 用法: node scripts/sync-noto-serif-sc.mjs
 * 产物:
 *   public/fonts/noto-serif-sc/*.woff2       (unicode-range 分片，需提交)
 *   public/fonts/noto-serif-sc/manifest.json (来源 URL、大小和 SHA-256)
 *   public/fonts/noto-serif-sc/OFL.txt       (Google Fonts 官方许可证)
 *   src/styles/fonts/noto-serif-sc.css       (自动生成，请勿手改)
 *
 * 该脚本仅用于手动更新并提交字体资产，不在 prebuild 中访问网络。
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONT_DIR = join(ROOT, 'public', 'fonts', 'noto-serif-sc');
const CSS_OUT = join(ROOT, 'src', 'styles', 'fonts', 'noto-serif-sc.css');
const MANIFEST_OUT = join(FONT_DIR, 'manifest.json');
const LICENSE_OUT = join(FONT_DIR, 'OFL.txt');

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const CSS_URL =
  'https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@300..900&display=swap';
const LICENSE_URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifsc/OFL.txt';

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

async function fetchText(url, label) {
  const response = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!response.ok) throw new Error(`${label} ${response.status}`);
  return response.text();
}

async function fetchWoff2(url) {
  const response = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!response.ok) throw new Error(`Google Fonts WOFF2 ${response.status}: ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  assertWoff2(buffer, url);
  return buffer;
}

function readPreviousManifest() {
  if (!existsSync(MANIFEST_OUT)) return new Map();
  try {
    const parsed = JSON.parse(readFileSync(MANIFEST_OUT, 'utf8'));
    return new Map((parsed.files ?? []).map((file) => [file.file, file]));
  } catch {
    return new Map();
  }
}

async function main() {
  mkdirSync(FONT_DIR, { recursive: true });
  mkdirSync(dirname(CSS_OUT), { recursive: true });

  const [css, license] = await Promise.all([
    fetchText(CSS_URL, 'Google Fonts CSS'),
    fetchText(LICENSE_URL, 'Google Fonts OFL'),
  ]);
  if (!license.includes('SIL OPEN FONT LICENSE Version 1.1')) {
    throw new Error('Noto Serif SC 许可证内容校验失败');
  }

  const blocks = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((match) => match[1]);
  const byUrl = new Map();
  for (const block of blocks) {
    const url = /url\((https:\/\/[^)]+\.woff2)\)/.exec(block)?.[1];
    const range = /unicode-range:\s*([^;]+);/.exec(block)?.[1]?.trim();
    const weight = /font-weight:\s*([^;]+);/.exec(block)?.[1]?.trim();
    if (!url || !range) continue;
    if (weight !== '300 900') {
      throw new Error(`Google Fonts 返回了非预期字重范围: ${weight ?? '缺失'}`);
    }
    const previousRange = byUrl.get(url);
    if (previousRange && previousRange !== range) {
      throw new Error(`同一 WOFF2 URL 对应了不同 unicode-range: ${url}`);
    }
    byUrl.set(url, range);
  }

  const entries = [...byUrl.entries()];
  if (entries.length < 90) {
    throw new Error(`Noto Serif SC 分片数量异常: ${entries.length}`);
  }
  console.log(`[noto-serif-sc] ${blocks.length} 个 @font-face 块 → ${entries.length} 个唯一分片`);

  const previousManifest = readPreviousManifest();
  const jobs = entries.map(([url, range], index) => ({ url, range, index }));
  const results = new Array(jobs.length);
  let downloaded = 0;
  let reused = 0;

  async function worker() {
    for (;;) {
      const job = jobs.shift();
      if (!job) return;

      const file = `noto-serif-sc-${String(job.index).padStart(3, '0')}.woff2`;
      const destination = join(FONT_DIR, file);
      const previous = previousManifest.get(file);
      let buffer;

      if (
        previous?.sourceUrl === job.url &&
        existsSync(destination) &&
        previous.sha256 === sha256((buffer = readFileSync(destination)))
      ) {
        assertWoff2(buffer, file);
        reused++;
      } else {
        buffer = await fetchWoff2(job.url);
        writeAtomicIfChanged(destination, buffer);
        downloaded++;
      }

      results[job.index] = {
        file,
        sourceUrl: job.url,
        unicodeRange: job.range,
        bytes: buffer.length,
        sha256: sha256(buffer),
      };
    }
  }

  await Promise.all(Array.from({ length: 8 }, worker));

  const expectedFiles = new Set(results.map((result) => result.file));
  for (const file of readdirSync(FONT_DIR)) {
    if (/^noto-serif-sc-\d{3}\.woff2$/.test(file) && !expectedFiles.has(file)) {
      unlinkSync(join(FONT_DIR, file));
    }
  }

  const rules = results.map(
    (result) =>
      `@font-face {\n` +
      `  font-family: 'Noto Serif SC';\n` +
      `  font-style: normal;\n` +
      `  font-weight: 300 900;\n` +
      `  font-display: swap;\n` +
      `  src: url('/fonts/noto-serif-sc/${result.file}') format('woff2');\n` +
      `  unicode-range: ${result.unicodeRange};\n` +
      `}`
  );

  const header = `/* =============================================================================
 * Noto Serif SC —— 自动生成【请勿手改】
 * -----------------------------------------------------------------------------
 * 由 scripts/sync-noto-serif-sc.mjs 从 Google Fonts 拉取并镜像到自托管路径。
 * 要更新字体版本：重跑该脚本并提交产物。
 *
 * 可变字体 (wght 300–900)，${results.length} 个 unicode-range 分片。
 * font-display: swap —— CJK 分片体积大，先用系统宋体再替换。
 * 分片 + unicode-range 使浏览器只下载页面实际用到的字符分片。
 * ============================================================================= */\n\n`;

  const manifest = {
    schemaVersion: 1,
    family: 'Noto Serif SC',
    style: 'normal',
    weightRange: '300 900',
    sourceCss: CSS_URL,
    license: {
      file: 'OFL.txt',
      sourceUrl: LICENSE_URL,
      sha256: sha256(Buffer.from(license)),
    },
    files: results,
  };

  writeAtomicIfChanged(CSS_OUT, header + rules.join('\n\n') + '\n');
  writeAtomicIfChanged(LICENSE_OUT, license);
  writeAtomicIfChanged(MANIFEST_OUT, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`[noto-serif-sc] 下载/校验 ${downloaded} · 安全复用 ${reused} · 写入 ${CSS_OUT}`);
}

main().catch((error) => {
  console.error('[noto-serif-sc] 失败:', error.message);
  process.exit(1);
});
