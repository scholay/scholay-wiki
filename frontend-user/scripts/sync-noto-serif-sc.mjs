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
 *   public/fonts/noto-serif-sc/vNN/*.woff2   (unicode-range 分片，需提交)
 *   scripts/noto-serif-sc.manifest.json      (来源 URL、大小和 SHA-256;工具状态,不进发布产物)
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
// manifest 是 fonts:sync 的工具状态文件(来源 URL/sha256),浏览器永不请求 ——
// 放 public/ 会随构建产物进镜像与 nginx 缓存(122KB 纯死重),2026-08-12 移到 scripts/。
const MANIFEST_OUT = join(ROOT, 'scripts', 'noto-serif-sc.manifest.json');
const LICENSE_OUT = join(FONT_DIR, 'OFL.txt');
const INDEX_OUT = join(ROOT, 'index.html');

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const CSS_URL =
  'https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@300..900&display=swap';
const LICENSE_URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifsc/OFL.txt';

// 全局导航/移动底栏/登录态首屏会稳定出现的中文。Google Fonts 默认的 101 分片
// 会让这些字跨命中 8 个 40–100KB 文件。同源 `text=` 子集将它们收敛为一个小 WOFF2，
// 其他中文仍由下方完整分片补齐，不会退化为系统中文字体。
export const CRITICAL_TEXT =
  '首页浏览功能我的论文期刊情报文献搜索智能助手写作审稿文件夹科研能力广场全站资源限时领取会员邀请有礼反馈登录注册账户额度已用完导航菜单查看全部扫码添加客服免费权益展开检自然语言矩阵分析主学术对话编辑器草整理收藏路上小工具集合起驱动与究平台协讯关于们定价帮中心隐私政策务条款解决方案蜀备号';
const CRITICAL_CSS_URL = `${CSS_URL}&text=${encodeURIComponent(CRITICAL_TEXT)}`;
const CRITICAL_FILE_RE = /^noto-serif-sc-ui(?:-[a-f\d]{12})?\.woff2$/;
const LEGACY_CRITICAL_FILE_RE = /^noto-serif-sc-ui\.woff2$/;
const FALLBACK_FILE_RE = /^noto-serif-sc-\d{3}\.woff2$/;

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
  if (!existsSync(MANIFEST_OUT)) return {};
  try {
    return JSON.parse(readFileSync(MANIFEST_OUT, 'utf8'));
  } catch {
    return {};
  }
}

function codepoints(text) {
  return new Set([...text].map((char) => char.codePointAt(0)));
}

/** 从 Google Fonts 的 unicode-range 中剪掉首屏子集，保证两组 @font-face 无重叠。 */
function subtractCodepoints(rawRange, excluded) {
  const ranges = [];
  for (const token of rawRange.split(/,\s*/)) {
    const match = /^U\+([\da-f]+)(?:-([\da-f]+))?$/i.exec(token);
    if (!match) throw new Error(`无法解析 unicode-range: ${token}`);
    const start = Number.parseInt(match[1], 16);
    const end = Number.parseInt(match[2] ?? match[1], 16);
    let cursor = start;
    for (const point of [...excluded].filter((value) => value >= start && value <= end).sort((a, b) => a - b)) {
      if (cursor < point) ranges.push([cursor, point - 1]);
      cursor = point + 1;
    }
    if (cursor <= end) ranges.push([cursor, end]);
  }
  return ranges
    .map(([start, end]) =>
      start === end
        ? `U+${start.toString(16)}`
        : `U+${start.toString(16)}-${end.toString(16)}`
    )
    .join(', ');
}

async function main() {
  mkdirSync(FONT_DIR, { recursive: true });
  mkdirSync(dirname(CSS_OUT), { recursive: true });

  const [css, criticalCss, license] = await Promise.all([
    fetchText(CSS_URL, 'Google Fonts CSS'),
    fetchText(CRITICAL_CSS_URL, 'Google Fonts 首屏子集 CSS'),
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

  // Google Fonts 的分片 URL 自带不可变版本段（当前为 v35）。Nginx 对所有
  // 字体响应下发 1y immutable，因此本地 URL 也必须包含同一版本段；
  // 不能再把新版内容写回 noto-serif-sc-000.woff2 这类固定 URL。
  const sourceVersions = new Set(
    entries.map(([url]) => /\/s\/notoserifsc\/(v\d+)\//.exec(new URL(url).pathname)?.[1]),
  );
  if (sourceVersions.has(undefined) || sourceVersions.size !== 1) {
    throw new Error(`Google Fonts 分片版本异常: ${[...sourceVersions].join(', ')}`);
  }
  const sourceVersion = [...sourceVersions][0];
  const fallbackDir = join(FONT_DIR, sourceVersion);
  mkdirSync(fallbackDir, { recursive: true });

  const previousManifest = readPreviousManifest();
  const previousFiles = new Map((previousManifest.files ?? []).map((file) => [file.file, file]));
  const jobs = entries.map(([url, range], index) => ({ url, range, index }));
  const results = new Array(jobs.length);
  let downloaded = 0;
  let reused = 0;

  async function worker() {
    for (;;) {
      const job = jobs.shift();
      if (!job) return;

      const basename = `noto-serif-sc-${String(job.index).padStart(3, '0')}.woff2`;
      const file = `${sourceVersion}/${basename}`;
      const destination = join(FONT_DIR, file);
      const previous = previousFiles.get(file) ?? previousFiles.get(basename);
      let buffer;

      // schema v3 的仓库把分片放在根目录。首次迁移时可以在校验
      // sourceUrl + SHA-256 后安全复用，无需重新下载 5MB+ 字体。
      const candidates = [destination, join(FONT_DIR, previous?.file ?? ''), join(FONT_DIR, basename)];
      const reusable = candidates.find(
        (candidate) =>
          previous?.sourceUrl === job.url &&
          existsSync(candidate) &&
          previous.sha256 === sha256(readFileSync(candidate)),
      );
      if (reusable) {
        buffer = readFileSync(reusable);
        assertWoff2(buffer, basename);
        if (reusable !== destination) renameSync(reusable, destination);
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

  const criticalSourceUrl = /url\((https:\/\/[^)]+)\)/.exec(criticalCss)?.[1];
  const criticalRange = /unicode-range:\s*([^;]+);/.exec(criticalCss)?.[1]?.trim();
  if (!criticalSourceUrl || !criticalRange) {
    throw new Error('Google Fonts 首屏子集 CSS 结构异常');
  }
  const criticalVersion = new URL(criticalSourceUrl).searchParams.get('v');
  if (criticalVersion !== sourceVersion) {
    throw new Error(
      `Google Fonts 首屏子集版本 ${criticalVersion ?? '缺失'} 与兜底分片 ${sourceVersion} 不一致`,
    );
  }
  const criticalPoints = codepoints(CRITICAL_TEXT);
  const returnedPoints = new Set();
  for (const token of criticalRange.split(/,\s*/)) {
    const match = /^U\+([\da-f]+)(?:-([\da-f]+))?$/i.exec(token);
    if (!match) throw new Error(`无法解析首屏 unicode-range: ${token}`);
    const start = Number.parseInt(match[1], 16);
    const end = Number.parseInt(match[2] ?? match[1], 16);
    for (let point = start; point <= end; point++) returnedPoints.add(point);
  }
  for (const point of criticalPoints) {
    if (!returnedPoints.has(point)) {
      throw new Error(`Google Fonts 首屏子集缺少 U+${point.toString(16)}`);
    }
  }

  const previousCritical = previousManifest.critical;
  let criticalBuffer;
  const previousCriticalFile =
    typeof previousCritical?.file === 'string' && CRITICAL_FILE_RE.test(previousCritical.file)
      ? previousCritical.file
      : null;
  const previousCriticalDestination = previousCriticalFile
    ? join(FONT_DIR, previousCriticalFile)
    : null;
  if (
    previousCritical?.sourceUrl === criticalSourceUrl &&
    previousCriticalDestination &&
    existsSync(previousCriticalDestination) &&
    previousCritical.sha256 === sha256((criticalBuffer = readFileSync(previousCriticalDestination)))
  ) {
    assertWoff2(criticalBuffer, previousCriticalFile);
    reused++;
  } else {
    criticalBuffer = await fetchWoff2(criticalSourceUrl);
    downloaded++;
  }

  // Nginx 对字体下发 1y immutable；因此必须内容寻址，禁止固定 URL 更换内容。
  const criticalSha256 = sha256(criticalBuffer);
  const criticalFile = `noto-serif-sc-ui-${criticalSha256.slice(0, 12)}.woff2`;
  const criticalDestination = join(FONT_DIR, criticalFile);
  writeAtomicIfChanged(criticalDestination, criticalBuffer);

  // 内容哈希文件是 immutable URL 的历史契约。已打开的旧页面可能在下一次
  // 发版后才第一次请求旧 critical 字体；保留历史 hash，避免跨发版 404。
  // 只清理会被原地覆盖的 legacy 固定名和误留在根目录的 fallback。
  for (const file of readdirSync(FONT_DIR)) {
    if (
      FALLBACK_FILE_RE.test(file) || LEGACY_CRITICAL_FILE_RE.test(file)
    ) {
      unlinkSync(join(FONT_DIR, file));
    }
  }
  const expectedFallbackFiles = new Set(results.map((result) => result.file.split('/').at(-1)));
  for (const file of readdirSync(fallbackDir)) {
    if (FALLBACK_FILE_RE.test(file) && !expectedFallbackFiles.has(file)) {
      unlinkSync(join(fallbackDir, file));
    }
  }

  const fallbackRules = results.map(
    (result) =>
      `@font-face {\n` +
      `  font-family: 'Noto Serif SC';\n` +
      `  font-style: normal;\n` +
      `  font-weight: 300 900;\n` +
      `  font-display: swap;\n` +
      `  src: url('/fonts/noto-serif-sc/${result.file}') format('woff2');\n` +
      `  unicode-range: ${subtractCodepoints(result.unicodeRange, criticalPoints)};\n` +
      `}`
  );

  const criticalRule =
    `/* 全局 UI 首屏常用字：单请求命中；与下方完整分片无重叠。 */\n` +
    `@font-face {\n` +
    `  font-family: 'Noto Serif SC';\n` +
    `  font-style: normal;\n` +
    `  font-weight: 300 900;\n` +
    `  font-display: swap;\n` +
    `  src: url('/fonts/noto-serif-sc/${criticalFile}') format('woff2');\n` +
    `  unicode-range: ${criticalRange};\n` +
    `}`;

  const header = `/* =============================================================================
 * Noto Serif SC —— 自动生成【请勿手改】
 * -----------------------------------------------------------------------------
 * 由 scripts/sync-noto-serif-sc.mjs 从 Google Fonts 拉取并镜像到自托管路径。
 * 要更新字体版本：重跑该脚本并提交产物。
 *
 * 可变字体 (wght 300–900)，1 个首屏常用字子集 + ${results.length} 个完整兜底分片。
 * font-display: swap —— CJK 分片体积大，先用系统宋体再替换。
 * 常用字收敛首访请求；其他字符仍按 unicode-range 只下载实际命中的分片。
 * ============================================================================= */\n\n`;

  const manifest = {
    schemaVersion: 4,
    family: 'Noto Serif SC',
    style: 'normal',
    weightRange: '300 900',
    sourceVersion,
    fallbackDirectory: sourceVersion,
    sourceCss: CSS_URL,
    license: {
      file: 'OFL.txt',
      sourceUrl: LICENSE_URL,
      sha256: sha256(Buffer.from(license)),
    },
    critical: {
      file: criticalFile,
      sourceCss: CRITICAL_CSS_URL,
      sourceUrl: criticalSourceUrl,
      unicodeRange: criticalRange,
      text: CRITICAL_TEXT,
      bytes: criticalBuffer.length,
      sha256: criticalSha256,
    },
    files: results,
  };

  writeAtomicIfChanged(CSS_OUT, header + criticalRule + '\n\n' + fallbackRules.join('\n\n') + '\n');
  writeAtomicIfChanged(LICENSE_OUT, license);
  writeAtomicIfChanged(MANIFEST_OUT, `${JSON.stringify(manifest, null, 2)}\n`);
  const indexHtml = readFileSync(INDEX_OUT, 'utf8');
  const preloadHref = /href="\/fonts\/noto-serif-sc\/noto-serif-sc-ui(?:-[a-f\d]{12})?\.woff2"/g;
  if ((indexHtml.match(preloadHref) ?? []).length !== 1) {
    throw new Error('index.html 的 Noto Serif SC UI preload 结构异常');
  }
  writeAtomicIfChanged(
    INDEX_OUT,
    indexHtml.replace(preloadHref, `href="/fonts/noto-serif-sc/${criticalFile}"`),
  );
  console.log(`[noto-serif-sc] 下载/校验 ${downloaded} · 安全复用 ${reused} · 写入 ${CSS_OUT}`);
}

main().catch((error) => {
  console.error('[noto-serif-sc] 失败:', error.message);
  process.exit(1);
});
