#!/usr/bin/env node
// ============================================================================
// Scholay PDF 抽取 —— pdfjs-dist 子进程
// ----------------------------------------------------------------------------
// 从 stdin 读 PDF 二进制,输出 JSON 到 stdout:
//
//   {
//     "pages": [
//       {
//         "viewport_height": 842,
//         "items": [
//           { "str": "Title here", "font": "g_d0_f1", "size": 17.2,
//             "x": 100, "y": 100, "width": 200, "height": 17.2 }
//         ]
//       }
//     ],
//     "full_text": "concatenated string for regex (DOI/arxiv)"
//   }
//
// 由 backend Go 进程作为短期子进程调用 —— stdin → stdout 二进制管道,无需文件落盘。
// 性能:典型 1-50 页学术 PDF 100-400 ms;超 50 页截到前 25 页(标题/摘要必然在前)。
// 错误统一往 stderr,exit code != 0,Go 端按错误退化到只用 DOI regex。
// ============================================================================

// pdfjs 内部用 console.log 打 polyfill warning(DOMMatrix / ImageData / require ...),
// 这些会污染我们的 stdout JSON 输出 → Go 端 unmarshal 见到 "Warning:..." 直接挂掉。
// 在 import pdfjs **之前** 把 console.log 重定向到 stderr,保证 stdout 只有 JSON。
// ES module import 是 hoisted 的,所以要用动态 import 才能让这两行先生效。
console.log = (...args) => process.stderr.write(args.map(String).join(' ') + '\n');

const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

const MAX_PAGES = 25; // 首 25 页够找标题 / 摘要 / DOI

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function main() {
  const data = await readStdin();
  if (data.length === 0) {
    throw new Error('empty stdin');
  }

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(data),
    // 不下载 system 字体 / 远程字体 —— 我们只关心文字 + 字号,不渲染
    disableFontFace: true,
    useSystemFonts: false,
    // pdfjs 默认会试着启动 worker,Node 里直接禁用,主线程跑
    isEvalSupported: false,
    // 0=ERROR only;抑制 DOMMatrix/ImageData/Path2D 等渲染相关 polyfill 警告
    // (我们不渲染图像,只抽文字,无害)
    verbosity: 0,
  });
  const pdf = await loadingTask.promise;

  const pages = [];
  const fullTextParts = [];
  const numPages = Math.min(pdf.numPages, MAX_PAGES);

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });

    // 翻成 top-origin 坐标(y 从顶向下递增),更直观判断"页头"
    // pdfjs 原 transform 的 e=x, f=y_from_bottom
    const items = tc.items
      .filter((it) => typeof it.str === 'string' && it.str.length > 0)
      .map((it) => {
        const t = it.transform || [1, 0, 0, 1, 0, 0];
        // height 字段已是渲染高度(post-transform);对未提供 height 的 fallback 到 |t[3]|
        const size =
          typeof it.height === 'number' && it.height > 0
            ? it.height
            : Math.abs(t[3]) || Math.abs(t[0]) || 0;
        return {
          str: it.str,
          font: it.fontName || '',
          size: round2(size),
          x: round2(t[4]),
          y: round2(viewport.height - t[5]),
          width: round2(it.width || 0),
          height: round2(size),
          // hasEOL: pdfjs 标记的行尾;Go 端拼接成行用得上
          eol: !!it.hasEOL,
        };
      });

    pages.push({
      viewport_height: round2(viewport.height),
      viewport_width: round2(viewport.width),
      items,
    });

    // 平铺成纯文本 —— DOI/arxiv 正则用
    // hasEOL 后插换行,否则空格;尾部加一个换行分页
    for (const it of items) {
      fullTextParts.push(it.str);
      fullTextParts.push(it.eol ? '\n' : ' ');
    }
    fullTextParts.push('\n');
  }

  const out = {
    pages,
    full_text: fullTextParts.join(''),
    num_pages_total: pdf.numPages,
    num_pages_extracted: numPages,
  };
  process.stdout.write(JSON.stringify(out));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

main().catch((err) => {
  process.stderr.write(String((err && err.stack) || err));
  process.exit(1);
});
