/**
 * 同步 Google Sans 可变字体 normal / italic 的 latin / latin-ext 自托管资产。
 *
 * 用法: node scripts/sync-google-sans.mjs
 * 产物:
 *   public/fonts/google-sans/vXX/*.woff2
 *   public/fonts/google-sans/vXX/manifest.json
 *   public/fonts/google-sans/vXX/OFL.txt
 *   src/styles/fonts/google-sans.css
 *
 * 版本目录从 fonts.gstatic.com 返回的 /vXX/ URL 自动提取。
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
const FONT_ROOT = join(ROOT, 'public', 'fonts', 'google-sans');
const CSS_OUT = join(ROOT, 'src', 'styles', 'fonts', 'google-sans.css');

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const CSS_URL =
  'https://fonts.googleapis.com/css2?family=Google+Sans:ital,opsz,wght@0,17..18,400..700;1,17..18,400..700&display=swap';
const SPECIMEN_URL = 'https://fonts.google.com/specimen/Google+Sans';
const METADATA_URL = 'https://fonts.google.com/metadata/fonts/Google%20Sans';
const LICENSE_URL = 'https://openfontlicense.org/documents/OFL.txt';
const COPYRIGHT =
  'Copyright 2025 The Google Sans Project Authors (github.com/googlefonts/googlesans)';
const SUBSETS = ['latin-ext', 'latin'];
const STYLES = ['normal', 'italic'];

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

function parseTargetFaces(css) {
  const faces = new Map();
  const facePattern = /\/\*\s*([^*]+?)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g;

  for (const match of css.matchAll(facePattern)) {
    const subset = match[1].trim();
    if (!SUBSETS.includes(subset)) continue;

    const block = match[2];
    const family = /font-family:\s*'([^']+)'\s*;/.exec(block)?.[1];
    const style = /font-style:\s*([^;]+);/.exec(block)?.[1]?.trim();
    const weight = /font-weight:\s*([^;]+);/.exec(block)?.[1]?.trim();
    const display = /font-display:\s*([^;]+);/.exec(block)?.[1]?.trim();
    const sourceUrl = /url\((https:\/\/[^)]+\.woff2)\)\s*format\('woff2'\)/.exec(block)?.[1];
    const unicodeRange = /unicode-range:\s*([^;]+);/.exec(block)?.[1]?.trim();

    if (!style || !STYLES.includes(style)) {
      throw new Error(`${subset} 子集的 font-style 非预期: ${style ?? '缺失'}`);
    }
    const key = `${style}:${subset}`;
    if (faces.has(key)) throw new Error(`Google Fonts CSS 中 ${style} ${subset} 子集重复`);
    if (family !== 'Google Sans') {
      throw new Error(`${subset} 子集的 font-family 非预期: ${family ?? '缺失'}`);
    }
    if (weight !== '400 700' || display !== 'swap') {
      throw new Error(
        `${style} ${subset} 子集的字重/显示策略非预期: ${weight ?? '缺失'}/${display ?? '缺失'}`
      );
    }
    if (!sourceUrl || !unicodeRange) {
      throw new Error(`${subset} 子集缺少有效的 WOFF2 URL 或 unicode-range`);
    }

    const url = new URL(sourceUrl);
    const version = /^\/s\/googlesans\/(v\d+)\/[^/]+\.woff2$/.exec(url.pathname)?.[1];
    if (url.protocol !== 'https:' || url.hostname !== 'fonts.gstatic.com' || !version) {
      throw new Error(`${subset} 子集的 WOFF2 URL 非预期: ${sourceUrl}`);
    }

    faces.set(key, { style, subset, sourceUrl, unicodeRange, version });
  }

  const expectedFaceCount = STYLES.length * SUBSETS.length;
  if (faces.size !== expectedFaceCount) {
    throw new Error(
      `期望 normal/italic 各有 ${SUBSETS.join(', ')} 子集，实际找到 ${[...faces.keys()].join(', ') || '无'}`
    );
  }

  const versions = new Set([...faces.values()].map((face) => face.version));
  if (versions.size !== 1) {
    throw new Error(`Google Sans 子集版本不一致: ${[...versions].join(', ')}`);
  }

  return { faces, version: [...versions][0] };
}

function parseMetadata(text) {
  const json = text.replace(/^\)\]\}'\s*/, '');
  let metadata;
  try {
    metadata = JSON.parse(json);
  } catch {
    throw new Error('Google Fonts metadata 不是有效 JSON');
  }

  if (metadata.family !== 'Google Sans') {
    throw new Error(`Google Fonts metadata family 非预期: ${metadata.family ?? '缺失'}`);
  }
  if (metadata.license !== 'ofl' || metadata.isOpenSource !== true) {
    throw new Error(
      `Google Sans 开放许可 metadata 校验失败: license=${metadata.license ?? '缺失'}, isOpenSource=${String(metadata.isOpenSource)}`
    );
  }

  return metadata;
}

function readPreviousManifest(file) {
  if (!existsSync(file)) return new Map();
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return new Map((parsed.files ?? []).map((entry) => [entry.file, entry]));
  } catch {
    return new Map();
  }
}

async function main() {
  mkdirSync(FONT_ROOT, { recursive: true });
  mkdirSync(dirname(CSS_OUT), { recursive: true });

  const [css, licenseTemplate, metadataText] = await Promise.all([
    fetchText(CSS_URL, 'Google Fonts CSS'),
    fetchText(LICENSE_URL, 'SIL OFL'),
    fetchText(METADATA_URL, 'Google Fonts metadata'),
  ]);
  if (!licenseTemplate.includes('SIL OPEN FONT LICENSE Version 1.1')) {
    throw new Error('Google Sans 许可证模板内容校验失败');
  }
  const metadata = parseMetadata(metadataText);

  const { faces, version } = parseTargetFaces(css);
  const fontDir = join(FONT_ROOT, version);
  const manifestOut = join(fontDir, 'manifest.json');
  const licenseOut = join(fontDir, 'OFL.txt');
  mkdirSync(fontDir, { recursive: true });

  const previousManifest = readPreviousManifest(manifestOut);
  const results = [];
  let downloaded = 0;
  let reused = 0;

  for (const style of STYLES) {
    for (const subset of SUBSETS) {
      const face = faces.get(`${style}:${subset}`);
      const file = `google-sans-${style}-${subset}.woff2`;
      const destination = join(fontDir, file);
      const previous = previousManifest.get(file);
      let buffer;

      if (
        previous?.style === style &&
        previous?.subset === subset &&
        previous?.sourceUrl === face.sourceUrl &&
        previous?.unicodeRange === face.unicodeRange &&
        existsSync(destination) &&
        previous.sha256 === sha256((buffer = readFileSync(destination)))
      ) {
        assertWoff2(buffer, file);
        reused++;
      } else {
        buffer = await fetchWoff2(face.sourceUrl);
        writeAtomicIfChanged(destination, buffer);
        downloaded++;
      }

      const digest = sha256(buffer);
      if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error(`${file} SHA-256 校验失败`);
      results.push({
        style,
        subset,
        file,
        sourceUrl: face.sourceUrl,
        unicodeRange: face.unicodeRange,
        bytes: buffer.length,
        sha256: digest,
      });
    }
  }

  const expectedFiles = new Set(results.map((result) => result.file));
  for (const file of readdirSync(fontDir)) {
    if (/^google-sans-(?:normal-|italic-)?(?:latin|latin-ext)\.woff2$/.test(file) && !expectedFiles.has(file)) {
      unlinkSync(join(fontDir, file));
    }
  }

  const rules = results.map(
    (result) =>
      `/* ${result.style} / ${result.subset} */\n` +
      `@font-face {\n` +
      `  font-family: 'Google Sans';\n` +
      `  font-style: ${result.style};\n` +
      `  font-weight: 400 700;\n` +
      `  font-display: swap;\n` +
      `  src: url('/fonts/google-sans/${version}/${result.file}') format('woff2');\n` +
      `  unicode-range: ${result.unicodeRange};\n` +
      `}`
  );

  const header = `/* =============================================================================
 * Google Sans —— 自动生成【请勿手改】
 * -----------------------------------------------------------------------------
 * 由 scripts/sync-google-sans.mjs 从 Google Fonts 拉取 normal / italic 的 latin / latin-ext
 * 可变字体分片并镜像到版本化自托管路径。要更新版本：重跑脚本并提交产物。
 * 可变字体 (opsz 17–18, wght 400–700)，font-display: swap。
 * ============================================================================= */\n\n`;

  const licenseBodyStart = licenseTemplate.indexOf(
    'This Font Software is licensed under the SIL Open Font License, Version 1.1.'
  );
  if (licenseBodyStart < 0) throw new Error('SIL OFL 正文起点校验失败');
  const licenseBody = licenseTemplate.slice(licenseBodyStart).trimStart();
  const license = `${COPYRIGHT}\n\n${licenseBody}`;
  const manifest = {
    schemaVersion: 1,
    family: 'Google Sans',
    version,
    styles: STYLES,
    axes: {
      opticalSize: '17 18',
      weight: '400 700',
    },
    sourceCss: CSS_URL,
    officialSources: {
      specimen: SPECIMEN_URL,
      metadata: METADATA_URL,
      sourceCss: CSS_URL,
      license: LICENSE_URL,
    },
    metadataVerification: {
      family: metadata.family,
      license: metadata.license,
      isOpenSource: metadata.isOpenSource,
    },
    copyright: COPYRIGHT,
    license: {
      file: 'OFL.txt',
      sourceUrl: LICENSE_URL,
      sha256: sha256(Buffer.from(license)),
    },
    files: results,
  };

  writeAtomicIfChanged(CSS_OUT, header + rules.join('\n\n') + '\n');
  writeAtomicIfChanged(licenseOut, license);
  writeAtomicIfChanged(manifestOut, `${JSON.stringify(manifest, null, 2)}\n`);

  for (const result of results) {
    console.log(
      `[google-sans] ${result.style}/${result.subset}: ${result.bytes} bytes · ${result.sha256}`
    );
  }
  console.log(
    `[google-sans] ${version} 下载/校验 ${downloaded} · 安全复用 ${reused} · 写入 ${CSS_OUT}`
  );
}

main().catch((error) => {
  console.error('[google-sans] 失败:', error.message);
  process.exit(1);
});
