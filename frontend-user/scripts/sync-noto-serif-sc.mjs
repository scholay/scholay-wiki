/**
 * 同步 Noto Serif SC 自托管资产。
 *
 * 为什么要自托管:index.html 里写明了理由 —— 国内访问 fonts.googleapis.com 经常超时,
 * 且 CSS link 是 render-blocking 串行。Playfair 早已自托管,中文衬线不能例外。
 *
 * 为什么镜像 Google 的分片而不是自己 pyftsubset 成一个大文件:
 *   Noto Serif SC 全量 ~5.7MB。切成一个「常用 3500 字」的单文件约 800KB,
 *   任何用到 font-serif 的页面都要整包下载;而 Google 的 101 片 + unicode-range
 *   是【按页面实际出现的字符】按需拉取,一个中文页面通常只命中 5~15 片。
 *   对 CJK 来说分片是唯一正确的做法,自己切反而更差。
 *
 * 它是【可变字体】(wght 400–900),101 个唯一 woff2 覆盖全部字重 ——
 * 所以不需要为 400/500/700 各存一份。
 *
 * 用法: node scripts/sync-noto-serif-sc.mjs
 * 产物:
 *   public/fonts/noto-serif-sc/*.woff2      (101 片,gitignore 之外,需提交)
 *   src/styles/fonts/noto-serif-sc.css      (生成的 @font-face,勿手改)
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONT_DIR = join(ROOT, 'public', 'fonts', 'noto-serif-sc');
const CSS_OUT = join(ROOT, 'src', 'styles', 'fonts', 'noto-serif-sc.css');

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const CSS_URL =
  'https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400..900&display=swap';

async function main() {
  mkdirSync(FONT_DIR, { recursive: true });
  mkdirSync(dirname(CSS_OUT), { recursive: true });

  const css = await fetch(CSS_URL, { headers: { 'User-Agent': UA } }).then((r) => {
    if (!r.ok) throw new Error(`Google Fonts CSS ${r.status}`);
    return r.text();
  });

  // 每个 @font-face 块:抓 unicode-range 与 woff2 url。可变字体下多个块共用同一 url。
  const blocks = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]);
  const byUrl = new Map();
  for (const b of blocks) {
    const url = /url\((https:\/\/[^)]+\.woff2)\)/.exec(b)?.[1];
    const range = /unicode-range:\s*([^;]+);/.exec(b)?.[1]?.trim();
    if (!url || !range) continue;
    // 同一分片在不同字重块里重复出现,unicode-range 相同 —— 去重即可
    if (!byUrl.has(url)) byUrl.set(url, range);
  }

  const entries = [...byUrl.entries()];
  console.log(`[noto-serif-sc] ${blocks.length} 个 @font-face 块 → ${entries.length} 个唯一分片`);

  let downloaded = 0;
  let reused = 0;
  const rules = [];

  // 并发下载,但限 8 路,别把 gstatic 打出限流
  const queue = entries.map(([url, range], i) => ({ url, range, i }));
  const results = new Array(queue.length);
  async function worker() {
    for (;;) {
      const job = queue.shift();
      if (!job) return;
      const name = `noto-serif-sc-${String(job.i).padStart(3, '0')}.woff2`;
      const dest = join(FONT_DIR, name);
      if (existsSync(dest) && readFileSync(dest).length > 0) {
        reused++;
      } else {
        const buf = Buffer.from(await fetch(job.url, { headers: { 'User-Agent': UA } }).then((r) => r.arrayBuffer()));
        writeFileSync(dest, buf);
        downloaded++;
      }
      results[job.i] = { name, range: job.range };
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));

  for (const r of results) {
    if (!r) continue;
    rules.push(
      `@font-face {\n` +
        `  font-family: 'Noto Serif SC';\n` +
        `  font-style: normal;\n` +
        `  font-weight: 400 900;\n` +
        `  font-display: swap;\n` +
        `  src: url('/fonts/noto-serif-sc/${r.name}') format('woff2');\n` +
        `  unicode-range: ${r.range};\n` +
        `}`
    );
  }

  const header = `/* =============================================================================
 * Noto Serif SC —— 自动生成,【请勿手改】
 * -----------------------------------------------------------------------------
 * 由 scripts/sync-noto-serif-sc.mjs 从 Google Fonts 拉取并镜像到自托管路径。
 * 要更新字体版本:重跑该脚本。
 *
 * 可变字体(wght 400–900),${results.filter(Boolean).length} 个 unicode-range 分片。
 * font-display: swap —— CJK 分片体积大,阻塞渲染不可接受;先用系统宋体顶上再换。
 * 分片 + unicode-range 意味着浏览器【只下载页面实际用到的字符所在的片】,
 * 一个中文页面通常只命中 5~15 片而非全部 ${results.filter(Boolean).length} 片。
 * ============================================================================= */\n\n`;

  writeFileSync(CSS_OUT, header + rules.join('\n\n') + '\n', 'utf8');
  console.log(`[noto-serif-sc] 下载 ${downloaded} · 复用 ${reused} · 写入 ${CSS_OUT}`);
}

main().catch((e) => {
  console.error('[noto-serif-sc] 失败:', e.message);
  process.exit(1);
});
