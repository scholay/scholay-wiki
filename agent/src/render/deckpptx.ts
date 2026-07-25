// 演示稿导出 PPTX(制作PPT / boltslides):把已构建的单文件 HTML deck 用 headless chromium
// **逐张截图** → pptxgenjs 拼成 16:9 图片版 .pptx(每张幻灯片 = 一整页图)。可在 PowerPoint/WPS/
// Keynote 打开。图片版(非可编辑文本),但保真度 = deck 本身的视觉。
//
// 复用 render/mermaid.ts 的 chromium CLI 手法(不用 puppeteer:Bun 兼容坑);全程 --host-resolver-rules
// 封死外联(deck 是自包含单文件,远程字体缺失回退系统 CJK 字体,可接受)。
// 逐张:deck 加 ?export=1(隐藏控制条,见 Deck.tsx)+ #<n>(引擎按 hash 定位到第 n 张)。
// 页数:先 --dump-dom 读引擎写在 <html data-deck-total> 上的总页数。

import { mkdtemp, rm, readFile, mkdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { buildEditablePptx, type SlideExport } from './pptxNative.ts';

const CHROMIUM = process.env.CHROMIUM_PATH || '/usr/bin/chromium';
const DUMP_TIMEOUT_MS = 20_000;
const SHOT_TIMEOUT_MS = 25_000;
const PDF_PRINT_TIMEOUT_MS = 60_000;
const MAX_SLIDES = 80; // 护栏:异常大的 deck 不至于把导出拖到天荒地外

async function runChromium(args: string[], timeoutMs: number): Promise<{ out: string; exit: number; err: string }> {
  const proc = Bun.spawn(
    [
      CHROMIUM,
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-extensions',
      '--disable-background-networking',
      '--host-resolver-rules=MAP * ~NOTFOUND', // 封死外联(deck 自包含,只读本地文件)
      ...args,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const timer = setTimeout(() => proc.kill(), timeoutMs);
  try {
    const out = await new Response(proc.stdout).text();
    const exit = await proc.exited;
    const err = exit !== 0 ? await new Response(proc.stderr).text() : '';
    return { out, exit, err };
  } finally {
    clearTimeout(timer);
  }
}

// readDeckTotal:加载 deck(?export=1)读引擎写在 <html data-deck-total="N"> 上的总页数。pptx/pdf 共用。
async function readDeckTotal(fileUrl: string): Promise<number> {
  const dump = await runChromium(['--dump-dom', '--virtual-time-budget=10000', fileUrl + '?export=1'], DUMP_TIMEOUT_MS);
  const m = dump.out.match(/data-deck-total="(\d+)"/);
  const total = m ? parseInt(m[1], 10) : 0;
  if (!total || total < 1) {
    throw new Error('无法识别幻灯片页数(deck 未渲染或不是 bolt-slides 演示稿)');
  }
  return Math.min(total, MAX_SLIDES);
}

// captureSlidePngsB64:逐张 --screenshot(screen media)拿每张幻灯片 PNG 的 base64。
// **为什么 pptx 和 pdf 都走截图而非 print-to-pdf**:deck 是复杂 web app(framer-motion 动画 +
// backdrop-filter + 100vh 等),在 print media 下会白屏(实测 print-to-pdf 出空白页);而 screen media
// 截图渲染完全正确。故 pdf 也用「截图 → 堆成极简图片 HTML → 对该简单 HTML print-to-pdf」的路子。
// scale-factor=1(1280×720 原生,~0.5MB/张)控体积:26 张 demo ≈ 11MB,稳在执行器 20MB raw 上限内。
async function captureSlidePngsB64(fileUrl: string, total: number): Promise<string[]> {
  const dir = await mkdtemp(join(tmpdir(), 'deckshot-'));
  try {
    const out: string[] = [];
    for (let n = 1; n <= total; n++) {
      const shot = join(dir, `s${n}.png`);
      // 单张截图重试:chromium 偶发瞬时抖动(GPU/字体/内存)不该让整份数十页的导出前功尽弃。
      // 最多 3 次(每次独立进程),仍失败才报错。
      let lastErr = '';
      let ok = false;
      for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
        const r = await runChromium(
          [
            '--screenshot=' + shot,
            '--window-size=1280,720',
            '--force-device-scale-factor=1',
            '--hide-scrollbars',
            '--virtual-time-budget=8000',
            fileUrl + '?export=1#' + n,
          ],
          SHOT_TIMEOUT_MS,
        );
        const st = await stat(shot).catch(() => null);
        if (st && st.size > 0) {
          ok = true;
        } else {
          lastErr = `chromium exit ${r.exit}${r.err ? ': ' + r.err.slice(0, 160) : ''}`;
        }
      }
      if (!ok) {
        throw new Error(`第 ${n} 张截图失败(重试 3 次仍失败)${lastErr ? ': ' + lastErr : ''}`);
      }
      out.push(Buffer.from(await readFile(shot)).toString('base64'));
    }
    return out;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// ─── 可编辑 pptx(pptx-native)────────────────────────────────────────────────
// 与图片版不同:逐张 dump-dom 取页面导出模型(<script id="__deck_export">,采集器见
// bolt-slides-template/src/deck/exportModel.ts)→ pptxNative.ts 摆原生 shape;含 image op 的页(Globe/
// Dashboard/Math/CodeWindow/误差棒)P0 整页截图回退。产物在 PowerPoint 里文字可改、图表可 Edit Data。

// dumpSlideModel:dump-dom 第 n 张,取出 #__deck_export 的 JSON 导出模型。
async function dumpSlideModel(fileUrl: string, n: number): Promise<SlideExport | null> {
  const r = await runChromium(
    // --window-size 固定 1280×720:导出模型的 box/几何以此为参考系(px→inch 时 1280→13.333in),
    // 与截图版同一视口,保证 16:9 版式一致(不设则用 headless 默认小视口 → 响应式版式漂移)。
    ['--dump-dom', '--window-size=1280,720', '--virtual-time-budget=12000', fileUrl + '?export=1#' + n],
    DUMP_TIMEOUT_MS,
  );
  const m = r.out.match(/<script id="__deck_export"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]) as SlideExport;
  } catch {
    return null;
  }
}

// captureOneSlidePngB64:截单张(整页回退用)。带 3× 重试,同截图版。
async function captureOneSlidePngB64(fileUrl: string, n: number): Promise<string | null> {
  const dir = await mkdtemp(join(tmpdir(), 'deck1-'));
  try {
    const shot = join(dir, 's.png');
    for (let a = 1; a <= 3; a++) {
      await runChromium(
        [
          '--screenshot=' + shot,
          '--window-size=1280,720',
          '--force-device-scale-factor=1',
          '--hide-scrollbars',
          '--virtual-time-budget=8000',
          fileUrl + '?export=1#' + n,
        ],
        SHOT_TIMEOUT_MS,
      );
      const st = await stat(shot).catch(() => null);
      if (st && st.size > 0) return Buffer.from(await readFile(shot)).toString('base64');
    }
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * 导出 htmlAbsPath(单文件 deck)成 outPptxAbsPath(**可编辑** .pptx)。
 * 返回 { slides, nativeSlides, imageSlides }。两路径应由调用方经 confinePath 限定在会话 cwd 内。
 */
export async function exportDeckToEditablePptx(
  htmlAbsPath: string,
  outPptxAbsPath: string,
): Promise<{ slides: number; nativeSlides: number; imageSlides: number }> {
  const fileUrl = 'file://' + htmlAbsPath;
  const total = await readDeckTotal(fileUrl);
  const slides: SlideExport[] = [];
  const slideImages: (string | null)[] = [];
  for (let n = 1; n <= total; n++) {
    const model = await dumpSlideModel(fileUrl, n);
    if (!model) {
      // 采集失败 → 整页截图兜底(theme 缺省,master 用其它页的)。
      slides.push({ slide: n - 1, w: 1280, h: 720, theme: undefined as unknown as SlideExport['theme'], ops: [] });
      slideImages.push(await captureOneSlidePngB64(fileUrl, n));
      continue;
    }
    slides.push(model);
    const needsImage = !!model.hardFallback || (model.ops || []).some((o) => o.role === 'image');
    slideImages.push(needsImage ? await captureOneSlidePngB64(fileUrl, n) : null);
  }
  const { buffer, nativeSlides, imageSlides } = await buildEditablePptx(slides, slideImages);
  await mkdir(dirname(outPptxAbsPath), { recursive: true });
  await Bun.write(outPptxAbsPath, buffer);
  return { slides: total, nativeSlides, imageSlides };
}

/**
 * 把 htmlAbsPath(自包含单文件 deck)导出成 outPptxAbsPath(图片版 .pptx)。返回幻灯片张数。
 * 两者都应由调用方经 confinePath 限定在会话 cwd 内。
 */
export async function exportDeckToPptx(htmlAbsPath: string, outPptxAbsPath: string): Promise<{ slides: number }> {
  const fileUrl = 'file://' + htmlAbsPath;
  const total = await readDeckTotal(fileUrl);
  const pngB64 = await captureSlidePngsB64(fileUrl, total);

  // 拼 pptx(16:9 宽屏,每张图铺满整页)。
  const PptxGenJS = (await import('pptxgenjs')).default;
  const pres = new PptxGenJS();
  pres.defineLayout({ name: 'DECK16x9', width: 13.333, height: 7.5 });
  pres.layout = 'DECK16x9';
  for (const b64 of pngB64) {
    const s = pres.addSlide();
    s.background = { color: '05070A' };
    s.addImage({ data: 'data:image/png;base64,' + b64, x: 0, y: 0, w: 13.333, h: 7.5 });
  }
  const b64out = (await pres.write({ outputType: 'base64' })) as string;
  await mkdir(dirname(outPptxAbsPath), { recursive: true });
  await Bun.write(outPptxAbsPath, Buffer.from(b64out, 'base64'));
  return { slides: total };
}

/**
 * 把 htmlAbsPath 导出成 outPdfAbsPath(16:9 横屏 PDF,高保真图片版,与网页完全一致、builds 全展开)。
 * 返回幻灯片张数。做法:先逐张截图(screen media 能正确渲染 deck;print media 会白屏),再把截图堆成
 * 一个极简图片 HTML(每张一整页),对**这个简单 HTML** print-to-pdf —— 简单静态内容 print 可靠。
 * 产物是图片版(文字不可选)而非矢量,因为 deck 的复杂 CSS/framer-motion 在 print media 下渲不出来。
 */
export async function exportDeckToPdf(htmlAbsPath: string, outPdfAbsPath: string): Promise<{ slides: number }> {
  const fileUrl = 'file://' + htmlAbsPath;
  const total = await readDeckTotal(fileUrl);
  const pngB64 = await captureSlidePngsB64(fileUrl, total);

  const dir = await mkdtemp(join(tmpdir(), 'deckpdf-'));
  try {
    const imgs = pngB64.map((b) => `<img src="data:image/png;base64,${b}">`).join('');
    const html =
      '<!doctype html><html><head><meta charset="utf-8"><style>' +
      '@page{size:1280px 720px;margin:0}' +
      'html,body{margin:0;padding:0;background:#05070a}' +
      'img{display:block;width:1280px;height:720px;page-break-after:always}' +
      'img:last-child{page-break-after:auto}' +
      '</style></head><body>' +
      imgs +
      '</body></html>';
    const htmlPath = join(dir, 'imgs.html');
    await Bun.write(htmlPath, html);

    await mkdir(dirname(outPdfAbsPath), { recursive: true });
    const r = await runChromium(
      ['--print-to-pdf=' + outPdfAbsPath, '--no-pdf-header-footer', '--virtual-time-budget=6000', 'file://' + htmlPath],
      PDF_PRINT_TIMEOUT_MS,
    );
    const st = await stat(outPdfAbsPath).catch(() => null);
    if (!st || st.size === 0) {
      throw new Error(`生成 PDF 失败(chromium exit ${r.exit})${r.err ? ': ' + r.err.slice(0, 160) : ''}`);
    }
    return { slides: total };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
