// Postbuild: 删掉 KaTeX 的 woff/ttf 旧格式字体。
//
// katex.min.css 给每个 @font-face 列了 woff2 + woff + ttf 三种 src,Vite 把三种都 emit 成构建
// 产物(实测 ~798KB 的 woff/ttf)。但 woff2 被所有现代浏览器支持、且在 src 列表里排第一 → 永远
// 第一个命中,woff/ttf 永不会被请求,纯属塞进镜像 / nginx 静态缓存的死重(性能审计 image-assets)。
//
// 本脚本:(1) 改写构建出的 CSS,去掉每个 @font-face 里 woff/ttf 的回退 src 段(只留 woff2);
//        (2) 删掉随之孤立的 woff/ttf 文件。build/assets 下 woff/ttf 仅来自 KaTeX(本站其它字体
//            playfair 是 woff2),故可安全全删。
//
// 故意保守:只动 woff/ttf,绝不碰 woff2 url(正则用 `\.(woff|ttf)\)`,`.woff2)` 因结尾是 `2)`
// 不会被误匹配)。改完后构建里若仍有 .woff/.ttf 引用即说明出错,可在 build 输出里 grep 自查。

import { readdir, readFile, writeFile, unlink, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const assetsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'build', 'assets');

// 匹配回退段:  ,url(/assets/KaTeX_X-hash.woff) format("woff")
//             ,url(/assets/KaTeX_X-hash.ttf) format("truetype")
// 不匹配 woff2(`.woff2)` 的 `2)` 不满足 `\.woff\)`)。
const FALLBACK_RE = /,\s*url\([^)]*\.(?:woff|ttf)\)\s*format\(\s*["']?(?:woff|truetype)["']?\s*\)/g;

let cssRewritten = 0;
let filesDeleted = 0;
let bytesFreed = 0;

let entries;
try {
  entries = await readdir(assetsDir);
} catch {
  console.log('[strip-katex-legacy-fonts] build/assets not found, skip');
  process.exit(0);
}

// 1) 改写 CSS:去掉 woff/ttf 回退 src 段
for (const f of entries) {
  if (!f.endsWith('.css')) continue;
  const p = join(assetsDir, f);
  const orig = await readFile(p, 'utf8');
  if (!/\.(?:woff|ttf)\)/.test(orig)) continue;
  const next = orig.replace(FALLBACK_RE, '');
  if (next !== orig) {
    await writeFile(p, next);
    cssRewritten++;
  }
}

// 2) 删掉孤立的 woff/ttf 文件(build/assets 下 woff/ttf 仅 KaTeX)
for (const f of entries) {
  if (!/\.(?:woff|ttf)$/.test(f)) continue;
  const p = join(assetsDir, f);
  try {
    const s = await stat(p);
    await unlink(p);
    bytesFreed += s.size;
    filesDeleted++;
  } catch {
    /* ignore */
  }
}

console.log(
  `[strip-katex-legacy-fonts] CSS rewritten: ${cssRewritten}, fonts deleted: ${filesDeleted}, freed ${(bytesFreed / 1024).toFixed(0)}KB`,
);
