// 规整功能广场冷数据 logo,消灭两类"图裂/白底重叠":
//   1) 白色/透明 favicon(如 ChemSketch 全 #fff)→ 合成到白底后近乎纯白 → 换成彩色首字母方块
//   2) .ico / 扩展名与内容不符 / 解码失败 → 一律转成白底 PNG(浏览器 <img> 稳定渲染)
// 规则:每个 logo 合成到白底测可见度(灰度标准差);可见→存 <slug>.png;不可见/解码失败→存 <slug>.svg 首字母。
// 已是"我们生成的首字母 SVG"则原样保留。import 按"文件名去扩展名 = slug"映射,所以一个 stem 只留一个文件。
//
// 用法:node scripts/normalize-tool-logos.mjs   (需要 ImageMagick `magick`)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve('feature-tools-coldstart');
const IMG = path.join(ROOT, 'images');
const JSON_PATH = path.join(ROOT, 'feature-tools.json');
const TMP = '/tmp/logo-norm';
const STD_MIN = 0.035; // 合成白底后灰度标准差低于此 = 在白卡上不可见 → 用首字母兜底
fs.mkdirSync(TMP, { recursive: true });

// ── 首字母方块(分类配色 + 1~2 字渐变方块) ──────────────────────────────────
const CAT_HUE = {
  'stats-econometrics': 212, 'math-numerical': 250, 'chem-materials': 168,
  'bio-life': 134, 'viz-plotting': 286, 'engineering-cad': 24,
  'lit-manage-pdf': 200, 'writing-latex': 338, 'journal-metrics': 45,
  'general-utility': 220, 'medical-reference': 2, 'other': 215,
};
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (x) => Math.round(255 * x).toString(16).padStart(2, '0');
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
function initials(t) {
  const s = (t.name || t.name_en || '?').trim();
  if (!s) return '?';
  if (/[一-鿿]/.test(s[0])) return s[0];
  const letters = s.replace(/[^A-Za-z0-9]/g, '');
  if (!letters) return s[0].toUpperCase();
  return (letters[0].toUpperCase() + (letters[1] || '')).slice(0, 2);
}
function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function svgFor(t) {
  const baseHue = CAT_HUE[t.category] ?? 215;
  const jitter = (hashStr(t.slug || t.name || '?') % 24) - 12;
  const hue = (baseHue + jitter + 360) % 360;
  const c1 = hslToHex(hue, 62, 56);
  const c2 = hslToHex(hue, 66, 42);
  const text = esc(initials(t));
  const isCJK = /[一-鿿]/.test(text);
  const fontSize = isCJK ? 46 : text.length >= 2 ? 38 : 48;
  const id = 'g' + (hashStr(t.slug || t.name || '?') % 100000);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96" role="img" aria-label="${text}">
<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
<rect width="96" height="96" rx="22" fill="url(#${id})"/>
<text x="48" y="49" font-family="-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif" font-size="${fontSize}" font-weight="700" fill="#ffffff" text-anchor="middle" dominant-baseline="central" letter-spacing="-1">${text}</text>
</svg>`;
}

// ── ImageMagick helpers ──────────────────────────────────────────────────────
function whiteStd(src) {
  const out = path.join(TMP, 'probe.png');
  execFileSync('magick', [`${src}[0]`, '-background', 'white', '-alpha', 'remove', '-alpha', 'off', '-resize', '256x256', out], { stdio: ['ignore', 'ignore', 'ignore'] });
  const sd = execFileSync('magick', [out, '-colorspace', 'Gray', '-format', '%[fx:standard_deviation]', 'info:']).toString().trim();
  return parseFloat(sd);
}
function rasterOnWhite(src, dest) {
  execFileSync('magick', [`${src}[0]`, '-background', 'white', '-alpha', 'remove', '-alpha', 'off', '-resize', '256x256', dest], { stdio: ['ignore', 'ignore', 'ignore'] });
}
function isOurMonogram(svg) {
  return /role="img"/.test(svg) && /<rect[^>]*fill="url\(#g/.test(svg) && /<text/.test(svg);
}

// ── 主流程 ───────────────────────────────────────────────────────────────────
const tools = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
const bySlug = new Map(tools.filter((t) => t.slug).map((t) => [t.slug, t]));

const byStem = new Map();
for (const f of fs.readdirSync(IMG)) {
  const ext = path.extname(f).toLowerCase();
  const stem = f.slice(0, f.length - ext.length);
  (byStem.get(stem) ?? byStem.set(stem, []).get(stem)).push(f);
}

let keptMono = 0, normalized = 0, blanked = 0, failed = 0;
const blankList = [], failList = [];

for (const [stem, group] of byStem) {
  const tool = bySlug.get(stem) ?? { name: stem, slug: stem };
  const src = path.join(IMG, group[0]);
  const ext = path.extname(group[0]).toLowerCase();

  const toMonogram = () => {
    for (const f of group) fs.rmSync(path.join(IMG, f));
    fs.writeFileSync(path.join(IMG, `${stem}.svg`), svgFor(tool));
  };
  const toPng = () => {
    const tmp = path.join(TMP, `${stem}.png`);
    rasterOnWhite(src, tmp);
    for (const f of group) fs.rmSync(path.join(IMG, f));
    fs.renameSync(tmp, path.join(IMG, `${stem}.png`));
  };

  // 已是我们生成的首字母 SVG → 原样保留
  if (ext === '.svg' && isOurMonogram(fs.readFileSync(src, 'utf8'))) { keptMono++; continue; }

  let sd;
  try { sd = whiteStd(src); } catch { toMonogram(); blanked++; failed++; failList.push(stem); continue; }
  if (!(sd >= STD_MIN)) { toMonogram(); blanked++; blankList.push(stem); continue; }
  try { toPng(); normalized++; } catch { toMonogram(); blanked++; failed++; failList.push(stem); }
}

console.log('— logo 规整完成 —');
console.log(`  保留已有首字母 SVG : ${keptMono}`);
console.log(`  真 logo 归一为 PNG : ${normalized}`);
console.log(`  白/空/解码失败→首字母: ${blanked}  (其中解码失败 ${failed})`);
console.log(`  → 白底不可见被替换的: ${blankList.join(', ') || '(无)'}`);
if (failList.length) console.log(`  → 解码失败被替换的  : ${failList.join(', ')}`);
