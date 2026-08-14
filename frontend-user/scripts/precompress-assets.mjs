// 构建产物预压缩(postbuild,跑在 strip-katex 之后)——为 nginx `gzip_static on` 生成 .gz。
//
// 【为什么】此前压缩链是:内层 nginx 不压缩 → 外层 nginx 每次请求动态 gzip level 6。
// 预压缩换来两件事:① 构建期一次 level 9,比动态 level 6 再小 ~2-4%;② 外层收到的
// 已是 Content-Encoding: gzip,不再逐请求烧 CPU(全站 JS gzip 计 ~3.7MB,claw 一次
// 进入 116 个请求,这笔 CPU 在高峰期不是零)。
//
// 【为什么不产 .br】brotli_static 需要 ngx_brotli 模块,nginx:alpine 官方镜像不带;
// 换第三方镜像是部署面变更,单独一批做(见 2026-08-12 审计报告 §九)。届时本脚本
// 加一行 brotliCompressSync 即可(node:zlib 原生支持,零新依赖)。
//
// 【安全性】gzip_static 的语义是「有 .gz 且客户端接受才用,否则原文件」——
// 漏压/删压都只是回退到动态压缩,不会 404,放心增量。
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const BUILD = join(dirname(fileURLToPath(import.meta.url)), '..', 'build');
// 只压文本类;woff2/png/webp/bcmap 等本身已压缩或压缩比无意义。
const EXTS = new Set(['.js', '.mjs', '.css', '.svg', '.json', '.html', '.xml', '.webmanifest', '.txt']);

// 🔴 不变式:候选扩展名**一律**产出 .gz,不设体积门槛、不比较压缩收益。
// 原因是发版脚本 40-sync-site.sh 用 `cp -a` 把产物合并进持久 web root:
// 非 hash 文件(index.html 等)靠「新构建的 X 与 X.gz 成对覆盖」保持一致 ——
// 若某文件在新构建里"因太小/压不小而没产 .gz",web root 里上一版的旧 X.gz 会残留,
// gzip_static 对 gzip 客户端优先吐它 = **静默服务陈旧内容**。
// 一律产出让「有 X(候选类型)必有同代 X.gz」恒成立,cp 覆盖永远成对。
// 代价只是极小文件的 .gz 略大于原文,可忽略;正确性优先。

let files = 0;
let saved = 0;

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(p);
      continue;
    }
    if (!EXTS.has(extname(entry.name))) continue;
    const raw = readFileSync(p);
    const gz = gzipSync(raw, { level: 9 });
    writeFileSync(`${p}.gz`, gz);
    files += 1;
    saved += raw.length - gz.length;
  }
}

walk(BUILD);
console.log(
  `[precompress-assets] ${files} 个 .gz 已生成,原文合计压去 ${(saved / 1024 / 1024).toFixed(1)}MB(level 9,gzip_static 按需服务)`
);
