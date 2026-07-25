/**
 * 生成 bioicons CC0 图标大包 —— 读策展清单 bioicons-manifest.json,从 bioicons 仓库下载**真实 CC0 SVG**,
 * 清洗 + SVGO 优化 + 归一后写入 src/features/claw/components/figure-canvas/icon-pack.bioicons.ts。
 *
 * 素材来源:bioicons(https://bioicons.com · https://github.com/duerrsimon/bioicons)的 **CC0** 图标集
 *          (公共领域等价:可自由商用/再分发/无需署名)。仅收录路径首段为 cc-0 的资产。
 * 处理:  - 排除含内嵌位图(<image>/data:image)的伪矢量(不适合内联,失去矢量意义)
 *        - SVGO 优化:压精度、去冗余、去 width/height(CSS 控尺寸)、**prefixIds 按 key 加前缀**
 *          (多个图标内联到同一画布时,避免各自 <defs> 的 gradient/clip id 撞车)
 *        - 超过 MAX_BYTES 的仍跳过(控 chunk 体积)
 * 运行:  cd frontend-user && node scripts/gen-bioicons.mjs   (需联网)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

let svgoOptimize = null;
try {
  ({ optimize: svgoOptimize } = await import('svgo'));
} catch {
  console.warn('⚠️  svgo 不可用,回落到基础压缩(体积会偏大)。建议 npm i -D svgo');
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAW_BASE = 'https://raw.githubusercontent.com/duerrsimon/bioicons/main/';
const OUT = join(__dirname, '../src/features/claw/components/figure-canvas/icon-pack.bioicons.ts');
const MAX_BYTES = 14 * 1024; // 优化后单图上限
const CONCURRENCY = 8;

const manifest = JSON.parse(readFileSync(join(__dirname, 'bioicons-manifest.json'), 'utf8'));

function basicClean(raw) {
  let s = raw;
  s = s.replace(/<\?xml[\s\S]*?\?>/gi, '');
  s = s.replace(/<!DOCTYPE[\s\S]*?>/gi, '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<metadata[\s\S]*?<\/metadata>/gi, '');
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
  s = s.replace(/\son\w+\s*=\s*"[^"]*"/gi, '');
  s = s.replace(/\son\w+\s*=\s*'[^']*'/gi, '');
  const m = s.match(/<svg[\s\S]*<\/svg>/i);
  return m ? m[0] : null;
}

function ensureViewBox(s) {
  if (!/xmlns\s*=/.test(s)) s = s.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  if (!/viewBox\s*=/i.test(s)) {
    const w = s.match(/<svg[^>]*\bwidth\s*=\s*"?([\d.]+)/i)?.[1];
    const h = s.match(/<svg[^>]*\bheight\s*=\s*"?([\d.]+)/i)?.[1];
    if (w && h) s = s.replace(/<svg/i, `<svg viewBox="0 0 ${w} ${h}"`);
  }
  return s;
}

/** 清洗 + 优化一段 SVG。返回 {svg} 或 {err}。 */
function processSvg(key, raw) {
  if (/<image[\s>]/i.test(raw) || /data:image\/(png|jpe?g|gif|webp)/i.test(raw)) {
    return { err: 'embedded raster(内嵌位图)' };
  }
  let s = basicClean(raw);
  if (!s) return { err: 'no <svg>' };
  s = ensureViewBox(s);
  if (svgoOptimize) {
    try {
      // svgo v4:preset-default 默认已保留 viewBox。removeDimensions 去掉 width/height 交给 CSS;
      // prefixIds 按 key 给 id/class 加前缀,避免多图标内联同画布时 <defs> id 撞车。
      const res = svgoOptimize(s, {
        multipass: true,
        floatPrecision: 2,
        plugins: ['preset-default', 'removeDimensions', { name: 'prefixIds', params: { prefix: key, delim: '_' } }],
      });
      if (res.data) s = ensureViewBox(res.data); // 优化后再保险补一次 viewBox
    } catch (e) {
      console.warn(`   svgo fail ${key}: ${e && e.message}`);
    }
  }
  s = s.replace(/>\s+</g, '><').replace(/\s{2,}/g, ' ').trim();
  if (s.length > MAX_BYTES) return { err: `too big ${(s.length / 1024).toFixed(1)}KB` };
  return { svg: s };
}

async function fetchOne(entry) {
  try {
    const res = await fetch(RAW_BASE + entry.path);
    if (!res.ok) return { entry, err: `HTTP ${res.status}` };
    const out = processSvg(entry.key, await res.text());
    return { entry, ...out };
  } catch (e) {
    return { entry, err: String(e && e.message ? e.message : e) };
  }
}

async function pool(items, n, fn) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

const results = await pool(manifest, CONCURRENCY, fetchOne);
const ok = results.filter((r) => r.svg);
const failed = results.filter((r) => r.err);

const entries = ok
  .map(({ entry, svg }) => {
    const tags = JSON.stringify(entry.tags || []);
    return `  ${JSON.stringify(entry.key)}: { label: ${JSON.stringify(entry.label)}, license: 'cc0', source: 'bioicons', tags: ${tags}, svg: ${JSON.stringify(svg)} },`;
  })
  .join('\n');

const totalBytes = ok.reduce((s, r) => s + r.svg.length, 0);
const header = `/**
 * bioicons CC0 图标大包(按需动态加载,见 icon-registry.ts)。
 *
 * ⚠️ 本文件由 scripts/gen-bioicons.mjs **自动生成**,请勿手改。
 *    素材来源:bioicons(https://bioicons.com · https://github.com/duerrsimon/bioicons)的 **CC0** 图标集
 *    (公共领域等价:可自由商用/再分发/无需署名)。共 ${ok.length} 个,优化后 SVG 合计 ~${Math.round(totalBytes / 1024)}KB。
 *    策展清单见 scripts/bioicons-manifest.json;刷新请重跑生成器(需联网)。
 */
import type { IconAsset } from './icon-pack';

export const BIOICONS_PACK: Record<string, IconAsset> = {
${entries}
};
`;

writeFileSync(OUT, header);
console.log(`✅ 写入 ${OUT}`);
console.log(`   收录 ${ok.length}/${manifest.length},优化后合计 ~${Math.round(totalBytes / 1024)}KB(gzip 约 1/3)`);
if (failed.length) {
  console.log(`⚠️  跳过 ${failed.length}:`);
  const byReason = {};
  for (const f of failed) {
    const kind = f.err.replace(/[\d.]+KB/, 'NKB');
    (byReason[kind] = byReason[kind] || []).push(f.entry.key);
  }
  for (const [reason, keys] of Object.entries(byReason)) console.log(`   [${reason}] ${keys.join(', ')}`);
}
