// 可编辑 pptx 生成 —— 把 deck 导出模型(见 bolt-slides-template/src/deck/exportModel.ts 采集器产出的
// SlideExport)翻译成 pptxgenjs 的**原生 OOXML 对象**(文本框/表格/图表),得到 PowerPoint 里可编辑的 pptx。
//
// 设计依据:docs/research/editable-pptx-2026-07/REPORT.md。要点:
//   - 单位:px→inch(slide 13.333×7.5in);字号 pt = px×0.75。
//   - 文本已在 chromium 里量好(box + fontPx)→ 固定字号 + 不 autofit(所见即所得,绕开跨引擎 autofit 分歧)。
//   - 每个 options 对象**必须 fresh**(pptxgenjs 就地 mutate,复用引用会静默污染)。
//   - image op(Globe/Dashboard/Math/CodeWindow/ErrorBar)在 P0 触发整页截图回退(见 deckpptx.ts)。

const SLIDE_W_IN = 13.333;
const SLIDE_H_IN = 7.5;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface TextRun {
  text: string;
  color?: string;
  bold?: boolean;
}
export interface TextModel {
  runs: TextRun[];
  fontPx: number;
  weight: number;
  color: string;
  align: 'left' | 'center' | 'right';
  family: string;
  lineHeightPx: number;
  bullet?: false | 'disc' | 'number';
}
export interface ExportOp {
  role: string;
  box: Box;
  model?: Record<string, unknown>;
  text?: TextModel;
}
export interface ThemeModel {
  bg: string;
  fg: string;
  fgMuted: string;
  fgFaint: string;
  primary: string;
  hair: string;
  surface: string;
  fontHead: string;
  fontBody: string;
  colorScheme: string;
}
export interface SlideExport {
  slide: number;
  w: number;
  h: number;
  theme: ThemeModel;
  ops: ExportOp[];
  notes?: string;
  hardFallback?: boolean;
}

// ── 单位 / 颜色换算 ─────────────────────────────────────────────────────────
export function toHex(css: string | undefined): string {
  const s = (css || '').trim();
  if (!s) return '000000';
  if (s.startsWith('#')) {
    let h = s.slice(1);
    if (h.length === 3)
      h = h
        .split('')
        .map((c) => c + c)
        .join('');
    return h.slice(0, 6).toUpperCase().padEnd(6, '0');
  }
  const m = s.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const p = m[1].split(',').map((x) => parseFloat(x));
    return [p[0], p[1], p[2]]
      .map((v) => Math.max(0, Math.min(255, Math.round(v || 0))).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
  }
  return '000000';
}

function firstFont(family: string | undefined): string {
  const f = (family || '').split(',')[0].trim().replace(/^["']|["']$/g, '');
  return f || 'Arial';
}

// ── 主入口:导出模型数组 → pptx Buffer ───────────────────────────────────────
// slideImages[i] 非空 → 该页整页图片回退(base64 png),忽略其 ops。
export async function buildEditablePptx(
  slides: SlideExport[],
  slideImages: (string | null)[],
): Promise<{ buffer: Buffer; nativeSlides: number; imageSlides: number }> {
  const PptxGenJS = (await import('pptxgenjs')).default;
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'DECK169', width: SLIDE_W_IN, height: SLIDE_H_IN });
  pptx.layout = 'DECK169';

  const theme = slides.find((s) => s?.theme?.bg)?.theme;
  const bgHex = toHex(theme?.bg) || 'FFFFFF';
  pptx.defineSlideMaster({
    title: 'DECK',
    background: { color: bgHex },
  });

  let nativeSlides = 0;
  let imageSlides = 0;

  for (let i = 0; i < slides.length; i++) {
    const se = slides[i];
    const slide = pptx.addSlide({ masterName: 'DECK' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (se.notes) (slide as any).addNotes(se.notes); // 演讲者备注(零成本白捡)
    const img = slideImages[i]; // 整页截图(有 image op 或 hardFallback 时才截),用于回退/裁剪
    if (img && se.hardFallback) {
      // 硬回退(采集失败/空页):整页截图铺满。
      slide.background = { color: bgHex };
      slide.addImage({ data: 'data:image/png;base64,' + img, x: 0, y: 0, w: SLIDE_W_IN, h: SLIDE_H_IN });
      imageSlides++;
      continue;
    }
    nativeSlides++;
    const sw = se.w || 1280;
    const sh = se.h || 720;
    const inX = (px: number) => Math.max(0, (px / sw) * SLIDE_W_IN);
    const inY = (px: number) => Math.max(0, (px / sh) * SLIDE_H_IN);
    const inW = (px: number) => Math.max(0.1, (px / sw) * SLIDE_W_IN);
    const inH = (px: number) => Math.max(0.1, (px / sh) * SLIDE_H_IN);
    const conv = { inX, inY, inW, inH };

    // 去重:旧版 deck(HTML 里烧的是旧采集器)会把「<h1>卫星星历<span class=accent>研究进展</span>」的
    // span 单独再采一遍 → 与 h1 文本框重叠成一团。这里在**生成端**兜底:丢掉「文字被另一更大文本框包含、
    // 且中心落在其框内」的嵌套子框(强调词已在父框里作为 run 保留)。对新版 deck 无副作用(本就无重复)。
    for (const op of dedupeTextOps(se.ops || [])) {
      try {
        if (op.role === 'text' && op.text) emitText(slide, op, se, conv);
        else if (op.role === 'table' && op.model) emitTable(slide, op, se, conv);
        else if (op.role === 'comparison' && op.model) emitComparison(slide, op, se, conv);
        else if (op.role === 'chart' && op.model) emitChart(slide, op, se, conv);
        else if (op.role === 'image' && img) emitCroppedImage(slide, op, conv, img); // 块级 image → 该区域裁剪图
      } catch {
        /* 单个 op 失败不拖垮整页 */
      }
    }
  }

  const b64 = (await pptx.write({ outputType: 'base64' })) as string;
  const buffer = await fixupPptx(Buffer.from(b64, 'base64'));
  return { buffer, nativeSlides, imageSlides };
}

// fixupPptx —— 导出前后处理闸(防 PowerPoint「需要修复」)。当前修 pptxgenjs #1449:
// N 页 deck 会往 [Content_Types].xml 写 N 条 slideMaster Override,但只有 1 个 slideMaster 文件 →
// 指向不存在 part 的幻影 Override 让 PowerPoint 打开时报「需要修复」。这里删掉所有指向不存在 part 的
// Override。用 jszip(pptxgenjs 内部同款,/app/node_modules 直接可用)对产物二次打包。
async function fixupPptx(buffer: Buffer): Promise<Buffer> {
  try {
    // @ts-ignore jszip 经 pptxgenjs 传递依赖解析(/app/node_modules 直接可用);用 ts-ignore 而非
    // ts-expect-error —— jszip 自带类型声明时该 import 不报错,expect-error 会反被判「未使用指令」。
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(buffer);
    const names = new Set<string>(Object.keys(zip.files));
    const ctFile = zip.file('[Content_Types].xml');
    if (ctFile) {
      const ct: string = await ctFile.async('string');
      const fixed = ct.replace(/<Override\s+PartName="([^"]+)"[^>]*\/>/g, (m: string, part: string) =>
        names.has(String(part).replace(/^\//, '')) ? m : '',
      );
      if (fixed !== ct) zip.file('[Content_Types].xml', fixed);
    }
    return Buffer.from(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  } catch {
    return buffer; // 修复失败退回原 buffer(有产物好过无)
  }
}

type Conv = {
  inX: (px: number) => number;
  inY: (px: number) => number;
  inW: (px: number) => number;
  inH: (px: number) => number;
};

function opText(o: ExportOp): string {
  return o.text ? o.text.runs.map((r) => r.text).join('') : '';
}
function boxArea(b: Box): number {
  return Math.max(0, b.w) * Math.max(0, b.h);
}
// 两框交集 / 较小框面积(0~1)。用来判「显著重叠」。
function overlapRatio(a: Box, b: Box): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const minA = Math.min(boxArea(a), boxArea(b)) || 1;
  return inter / minA;
}
// 去重:旧版 deck(HTML 烧的是旧采集器)会把强调词 span、甚至**整个标题**重复采成第二个文本框,与主框
// 重叠。这里在生成端兜底:两文本框**显著重叠(交集/小框 > 0.5)** 且「B 的文字包含 A(含相等)」时,
// A 冗余 → 丢 A,保留文字更全/字号更大/面积更大的 B(相等则保 index 小)。对新版 deck 无副作用(本无重复)。
function dedupeTextOps(ops: ExportOp[]): ExportOp[] {
  const drop = new Set<number>();
  for (let i = 0; i < ops.length; i++) {
    const a = ops[i];
    if (a.role !== 'text' || !a.text || drop.has(i)) continue;
    const at = opText(a).trim();
    if (!at) continue;
    for (let j = 0; j < ops.length; j++) {
      if (i === j || drop.has(j)) continue;
      const b = ops[j];
      if (b.role !== 'text' || !b.text) continue;
      const bt = opText(b).trim();
      if (!bt.includes(at) || overlapRatio(a.box, b.box) <= 0.5) continue;
      if (bt.length > at.length) {
        drop.add(i); // A 是 B 文字的真子串 → 丢 A
        break;
      }
      if (bt === at) {
        // 文字相等:保留字号更大 / 面积更大 / index 更小的 B。
        const af = a.text.fontPx || 0;
        const bf = b.text.fontPx || 0;
        const aArea = boxArea(a.box);
        const bArea = boxArea(b.box);
        if (bf > af || (bf === af && bArea > aArea) || (bf === af && bArea === aArea && j < i)) {
          drop.add(i);
          break;
        }
      }
    }
  }
  return ops.filter((_, i) => !drop.has(i));
}

// 块级 image op(MathBlock/Globe/Dashboard/CodeWindow)→ 从整页截图**裁剪**出该区域,原位摆放。
// 这样含这类元素的页保持「文本/表格/图表可编辑 + 该块为定位图片」,而非整页拍平。
function emitCroppedImage(slide: unknown, op: ExportOp, c: Conv): void;
function emitCroppedImage(slide: unknown, op: ExportOp, c: Conv, pngB64: string): void;
function emitCroppedImage(slide: unknown, op: ExportOp, c: Conv, pngB64?: string): void {
  if (!pngB64) return;
  const x = c.inX(op.box.x);
  const y = c.inY(op.box.y);
  const w = c.inW(op.box.w);
  const h = c.inH(op.box.h);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (slide as any).addImage({
    data: 'data:image/png;base64,' + pngB64,
    x,
    y,
    w,
    h,
    // 源图 = 整页(SLIDE_W_IN×SLIDE_H_IN);裁剪出 op 区域(inch 与摆放一致 → 1:1 不缩放)。
    sizing: { type: 'crop', x, y, w, h },
  });
}

function emitText(slide: unknown, op: ExportOp, se: SlideExport, c: Conv): void {
  const t = op.text!;
  const runs = (t.runs && t.runs.length ? t.runs : [{ text: '' }]).map((r) => ({
    text: r.text,
    options: { color: toHex(r.color || t.color), bold: r.bold || t.weight >= 600 },
  }));
  const fontPt = Math.max(6, Math.round(t.fontPx * 0.75));
  // 行距用**相对倍数**而非绝对 pt:绝对 lineSpacing 一旦小于字号(CSS 常见紧凑 line-height),
  // 换行的两行会**竖向重叠**(用户报的「文字重合」根因,大标题 CJK 换行时尤甚)。倍数下限 0.9 保不叠。
  const lhMult = Math.min(1.5, Math.max(0.9, (t.lineHeightPx || t.fontPx * 1.2) / (t.fontPx || 1)));
  // CJK 宽度余量:浏览器与 PowerPoint 字体度量不同,同样文字在 PowerPoint 里可能更宽 → 意外换行 → 竖向溢出
  // 压到邻居。横向留 ~8% 余量(居中不偏移),再叠 fit:'shrink'(PowerPoint 打开时把仍溢出的文字缩进框内)。
  const padX = c.inW(op.box.w) * 0.04;
  const opts: Record<string, unknown> = {
    x: Math.max(0, c.inX(op.box.x) - padX),
    y: c.inY(op.box.y),
    w: c.inW(op.box.w) + padX * 2,
    h: c.inH(op.box.h),
    fontSize: fontPt,
    fontFace: firstFont(t.family || se.theme.fontBody),
    color: toHex(t.color),
    align: t.align,
    valign: 'top',
    wrap: true,
    fit: 'shrink', // 溢出时 PowerPoint 缩字号适应文本框(治溢出压邻居 / 换行两行重叠)
    lineSpacingMultiple: Number(lhMult.toFixed(2)),
    margin: 0,
  };
  if (t.bullet) opts.bullet = t.bullet === 'number' ? { type: 'number' } : true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (slide as any).addText(runs, opts);
}

function emitTable(slide: unknown, op: ExportOp, se: SlideExport, c: Conv): void {
  const m = op.model as {
    headers?: string[];
    rows?: string[][];
    aligns?: string[];
    highlightCol?: number | null;
    highlightRow?: number | null;
  };
  const headers = m.headers || [];
  const dataRows = m.rows || [];
  if (headers.length === 0 && dataRows.length === 0) return;
  const primary = toHex(se.theme.primary);
  const fg = toHex(se.theme.fg);
  const hair = 'D8D8D8';
  const aligns = (m.aligns || []).map((a) => (a === 'right' || a === 'center' ? a : 'left'));
  const alignOf = (i: number) => aligns[i] || 'left';

  const rows: unknown[] = [];
  // 表头
  rows.push(
    headers.map((hdr, ci) => ({
      text: hdr,
      options: {
        bold: true,
        color: 'FFFFFF',
        fill: { color: primary },
        align: alignOf(ci),
        valign: 'middle',
      },
    })),
  );
  // 数据行
  dataRows.forEach((r, ri) => {
    rows.push(
      r.map((cell, ci) => ({
        text: String(cell ?? ''),
        options: {
          color: fg,
          align: alignOf(ci),
          valign: 'middle',
          fill:
            m.highlightRow === ri || m.highlightCol === ci
              ? { color: primary, transparency: 85 } // 高亮:主色淡底(6位hex + 透明度,别拼 8 位)
              : undefined,
        },
      })),
    );
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (slide as any).addTable(rows, {
    x: c.inX(op.box.x),
    y: c.inY(op.box.y),
    w: c.inW(op.box.w),
    h: c.inH(op.box.h),
    border: { type: 'solid', pt: 0.5, color: hair },
    autoPage: false, // 单页表:关 autoPage 绕开整类 repair bug
    fontSize: 12,
    valign: 'middle',
  });
}

// Comparison(us-vs-them 特性矩阵)→ 原生表格。布尔 → ✓/✗,highlight 列淡主色底。
function emitComparison(slide: unknown, op: ExportOp, se: SlideExport, c: Conv): void {
  const m = op.model as {
    cols?: string[];
    rows?: { label: string; values: (boolean | string)[] }[];
    highlight?: number;
  };
  const cols = m.cols || [];
  const dataRows = m.rows || [];
  if (cols.length === 0 && dataRows.length === 0) return;
  const primary = toHex(se.theme.primary);
  const fg = toHex(se.theme.fg);
  const hl = m.highlight ?? 0; // 高亮的 value 列(0-based,不含 label 列)
  const rows: unknown[] = [];
  rows.push(
    cols.map((cc) => ({
      text: String(cc ?? ''),
      options: { bold: true, color: 'FFFFFF', fill: { color: primary }, align: 'center', valign: 'middle' },
    })),
  );
  dataRows.forEach((r) => {
    const cells: unknown[] = [
      { text: String(r.label ?? ''), options: { color: fg, bold: true, align: 'left', valign: 'middle' } },
    ];
    (r.values || []).forEach((v, vi) => {
      const isBool = typeof v === 'boolean';
      cells.push({
        text: isBool ? (v ? '✓' : '✗') : String(v),
        options: {
          color: isBool ? (v ? '2A7A2A' : 'C0392B') : fg,
          bold: isBool,
          align: 'center',
          valign: 'middle',
          fill: vi === hl ? { color: primary, transparency: 88 } : undefined,
        },
      });
    });
    rows.push(cells);
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (slide as any).addTable(rows, {
    x: c.inX(op.box.x),
    y: c.inY(op.box.y),
    w: c.inW(op.box.w),
    h: c.inH(op.box.h),
    border: { type: 'solid', pt: 0.5, color: 'D8D8D8' },
    autoPage: false,
    fontSize: 12,
    valign: 'middle',
  });
}

function emitChart(slide: unknown, op: ExportOp, se: SlideExport, c: Conv): void {
  const m = op.model as Record<string, unknown>;
  const chartType = String(m.chartType || 'bar');
  const primary = toHex(se.theme.primary);
  // 色盲友好序列色(Okabe-Ito,与 SciCharts 对齐);单序列只给一个色(避 pptxgenjs #285 误渲)。
  const PALETTE = [primary, 'E69F00', '56B4E9', '009E73', 'CC79A7', 'D55E00', '0072B2'];
  const pos = { x: c.inX(op.box.x), y: c.inY(op.box.y), w: c.inW(op.box.w), h: c.inH(op.box.h) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = slide as any;

  if (chartType === 'bar') {
    const data = (m.data as { label: string; value: number }[]) || [];
    s.addChart('bar', [{ name: 'Series 1', labels: data.map((d) => String(d.label)), values: data.map((d) => d.value) }], {
      ...pos,
      chartColors: [primary],
      showLegend: false,
      showValue: false,
      catAxisLabelColor: toHex(se.theme.fgMuted),
      valAxisLabelColor: toHex(se.theme.fgMuted),
    });
  } else if (chartType === 'line') {
    const points = (m.points as number[]) || [];
    s.addChart('line', [{ name: 'Series 1', labels: points.map((_, i) => String(i + 1)), values: points }], {
      ...pos,
      chartColors: [primary],
      showLegend: false,
      lineSize: 3,
      catAxisLabelColor: toHex(se.theme.fgMuted),
      valAxisLabelColor: toHex(se.theme.fgMuted),
    });
  } else if (chartType === 'donut') {
    const value = Number(m.value) || 0;
    const label = (m.label as string) || '';
    s.addChart('doughnut', [{ name: label || 'Value', labels: [label || 'Value', ''], values: [value, Math.max(0, 100 - value)] }], {
      ...pos,
      chartColors: [primary, 'E8E8E8'],
      showLegend: false,
      showValue: false,
      holeSize: 70,
    });
  } else if (chartType === 'scatter' || chartType === 'scatterLine') {
    const series = (m.series as { name: string; points: { x: number; y: number }[] }[]) || [];
    if (series.length === 0) return;
    const xs = series[0].points.map((p) => p.x);
    const chartData = [
      { name: 'X-Axis', values: xs },
      ...series.map((sr) => ({ name: sr.name, values: sr.points.map((p) => p.y) })),
    ];
    s.addChart('scatter', chartData, {
      ...pos,
      chartColors: series.map((_, i) => PALETTE[(i + 1) % PALETTE.length]),
      showLegend: series.length > 1,
      legendPos: 'b',
      lineSize: chartType === 'scatterLine' ? 2 : 0,
      lineDataSymbolSize: 6,
      catAxisLabelColor: toHex(se.theme.fgMuted),
      valAxisLabelColor: toHex(se.theme.fgMuted),
    });
  }
}
