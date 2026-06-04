// 把 pdfjs-dist 的 CMap 文件拷到 public/pdfjs-cmaps/,供浏览器端 pdf.js 渲染 CJK(中/日/韩)字体。
// 缺这些 CMap → react-pdf 预览里中文字符会"字体丢失"显示为空白(英文/数学正常)。
// 由 package.json 的 predev / prebuild 自动执行;public/pdfjs-cmaps 已 gitignore(随依赖再生)。
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'node_modules/pdfjs-dist/cmaps');
const dest = resolve(root, 'public/pdfjs-cmaps');

if (!existsSync(src)) {
  console.warn('[copy-pdf-cmaps] 源目录不存在,跳过(pdfjs-dist 未安装?):', src);
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`[copy-pdf-cmaps] 已拷贝 ${readdirSync(dest).length} 个 CMap → public/pdfjs-cmaps/`);
