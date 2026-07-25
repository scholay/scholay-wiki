/* 导出采集器 —— 在 headless chromium 里(?export=1#n)对当前 slide 的渲染后 DOM,产出一份
   **结构化导出模型**(每个可映射节点的 role + 语义 model + 量好的几何 box),写进 <script id="__deck_export">
   JSON blob;Node 端(deckpptx.ts)dump-dom 取出 blob → pptxgenjs 摆原生 shape。

   两类节点:
     ① 白名单组件(带 data-export-role/data-export-model)→ 直接用其语义 model(免像素反推);
     ② 未注解的文本原子(.headline/.lead/li…)→ 就地量 box + 计算字体,产一个原生文本框 op。
   image 组件(role=image)记 box,Node 端截图回退。theme 从 :root CSS 变量读,派生 pptx 母版。 */

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
  /** 白名单组件的语义模型(JSON.parse(data-export-model))。 */
  model?: unknown;
  /** role='text' 的文本框模型。 */
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
  /** 演讲者备注(<Slide notes="…">)→ pptx speaker notes。 */
  notes?: string;
  /** 采集失败/空 → Node 端整页截图兜底。 */
  hardFallback?: boolean;
}

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'SVG', 'CANVAS', 'IMG', 'BR', 'HR', 'BUTTON', 'INPUT', 'TEXTAREA']);

// isTextLeaf:E 是「文本叶」= 有可见文本,且没有**块级、且自身带文本**的子元素(那种子元素会各自被取)。
// 行内子(span/a/em/.accent-text)不算块级 → 其文本随 E 一起取(extractText 会拆 run)。
// 这样从任意组件(StatGrid/BigNumber/Cover…)可靠地把每块文字抽成一个文本框,不依赖 class 白名单。
function isTextLeaf(el: HTMLElement): boolean {
  const own = (el.innerText || '').trim();
  if (!own) return false;
  for (let i = 0; i < el.children.length; i++) {
    const child = el.children[i] as HTMLElement;
    if (!(child.innerText || '').trim()) continue;
    const d = getComputedStyle(child).display;
    if (d !== 'inline' && d !== 'inline-block' && d !== 'contents') return false; // 有块级带文本子 → 下钻,非叶
  }
  return true;
}

function readVar(cs: CSSStyleDeclaration, name: string, fallback: string): string {
  const v = cs.getPropertyValue(name).trim();
  return v || fallback;
}

function rectToBox(el: Element): Box {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

/** 元素是否在某个已声明 role 的子树内(避免容器 + 子节点重复采集;container 除外,继续下钻)。 */
function insideClaimed(el: Element, stage: Element): boolean {
  let p = el.parentElement;
  while (p && p !== stage) {
    const role = p.getAttribute('data-export-role');
    if (role && role !== 'container') return true;
    p = p.parentElement;
  }
  return false;
}

// 祖先里是否已有「文本叶」——有则本元素的文字已被那个祖先(经 extractText 拆 run)覆盖,别重复采。
// 治「<h1>卫星星历<span class=accent>研究进展</span></h1>」里 span 被单独再采一遍 → 与 h1 重叠。
function hasTextLeafAncestor(el: HTMLElement, stage: Element): boolean {
  let p = el.parentElement;
  while (p && p !== stage) {
    if (!p.hasAttribute('data-export-role') && isTextLeaf(p as HTMLElement)) return true;
    p = p.parentElement;
  }
  return false;
}

function parseAlign(v: string): 'left' | 'center' | 'right' {
  if (v === 'center' || v === 'right') return v;
  return 'left';
}

/** 把一个文本元素拆成 runs(识别 .accent-text 上色片段),并读字体几何。 */
function extractText(el: HTMLElement): TextModel | null {
  const txt = (el.innerText || '').replace(/\s+/g, ' ').trim();
  if (!txt) return null;
  const cs = getComputedStyle(el);
  const fontPx = parseFloat(cs.fontSize) || 16;
  const weight = parseInt(cs.fontWeight, 10) || 400;
  const lineHeightPx = cs.lineHeight.endsWith('px') ? parseFloat(cs.lineHeight) : fontPx * 1.3;
  const tag = el.tagName.toLowerCase();
  const isLi = tag === 'li';
  // runs:遍历子节点,.accent-text 用 primary/自身色,其余用继承色。简单两级即可覆盖绝大多数。
  const runs: TextRun[] = [];
  const baseColor = cs.color;
  el.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) {
      const t = (n.textContent || '').replace(/\s+/g, ' ');
      if (t.trim()) runs.push({ text: t, color: baseColor });
    } else if (n.nodeType === Node.ELEMENT_NODE) {
      const ce = n as HTMLElement;
      const t = (ce.innerText || '').replace(/\s+/g, ' ');
      if (!t.trim()) return;
      const ccs = getComputedStyle(ce);
      const accent = ce.classList.contains('accent-text');
      runs.push({ text: t, color: ccs.color || baseColor, bold: parseInt(ccs.fontWeight, 10) >= 600 || undefined });
      void accent;
    }
  });
  if (runs.length === 0) runs.push({ text: txt, color: baseColor });
  return {
    runs,
    fontPx,
    weight,
    color: baseColor,
    align: parseAlign(cs.textAlign),
    family: cs.fontFamily,
    lineHeightPx,
    bullet: isLi ? (el.closest('ol') ? 'number' : 'disc') : false,
  };
}

export function collectSlideExport(stage: HTMLElement, slideIndex: number, notes?: string): SlideExport {
  const rootCs = getComputedStyle(document.documentElement);
  const theme: ThemeModel = {
    bg: readVar(rootCs, '--bg', '#ffffff'),
    fg: readVar(rootCs, '--fg', '#111111'),
    fgMuted: readVar(rootCs, '--fg-muted', '#666666'),
    fgFaint: readVar(rootCs, '--fg-faint', '#999999'),
    primary: readVar(rootCs, '--primary', '#2f5fb0'),
    hair: readVar(rootCs, '--hair', 'rgba(0,0,0,0.1)'),
    surface: readVar(rootCs, '--surface', 'rgba(0,0,0,0.04)'),
    fontHead: readVar(rootCs, '--font-head', 'Inter, sans-serif'),
    fontBody: readVar(rootCs, '--font-body', 'Inter, sans-serif'),
    colorScheme: rootCs.getPropertyValue('color-scheme').trim() || 'light',
  };

  const ops: ExportOp[] = [];

  // ① 白名单组件(含 image / container)。container 只是标记透传,不产 op(继续让文本/子组件被采)。
  stage.querySelectorAll<HTMLElement>('[data-export-role]').forEach((el) => {
    const role = el.getAttribute('data-export-role') || '';
    if (role === 'container') return;
    if (insideClaimed(el, stage)) return; // 嵌套注解取最外层
    const box = rectToBox(el);
    if (box.w < 2 || box.h < 2) return;
    if (role === 'image') {
      ops.push({ role: 'image', box });
      return;
    }
    let model: Record<string, unknown> = {};
    const raw = el.getAttribute('data-export-model');
    if (raw) {
      try {
        model = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        /* 解析失败 → 该组件退化为文本采集(下面文本原子会捞) */
      }
    }
    // table:单元格文本从 <table> DOM 读(兼容 ReactNode 单元格),合并进 model。
    if (role === 'table') {
      const tableEl = el.querySelector('table');
      const headers: string[] = [];
      const rows: string[][] = [];
      if (tableEl) {
        tableEl.querySelectorAll('thead th').forEach((th) =>
          headers.push(((th as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim()),
        );
        tableEl.querySelectorAll('tbody tr').forEach((tr) => {
          const r: string[] = [];
          tr.querySelectorAll('td').forEach((td) =>
            r.push(((td as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim()),
          );
          if (r.length) rows.push(r);
        });
      }
      model = { ...model, headers, rows };
    }
    ops.push({ role, box, model });
  });

  // ② 文本(任意「文本叶」,不靠 class 白名单 → 覆盖 StatGrid/BigNumber 等所有组件的文字,防漏采)。
  stage.querySelectorAll<HTMLElement>('*').forEach((el) => {
    if (SKIP_TAGS.has(el.tagName.toUpperCase())) return;
    if (el.closest('svg')) return; // svg 内文字(图表轴标签等)不当可编辑文本
    if (el.hasAttribute('data-export-role')) return; // 组件根(image/chart/table/comparison)另行处理
    if (insideClaimed(el, stage)) return;
    if (!isTextLeaf(el)) return;
    if (hasTextLeafAncestor(el, stage)) return; // 只取**最外层**文本叶,内层文字随 run 一起走,防重复采
    const box = rectToBox(el);
    if (box.w < 2 || box.h < 4) return;
    const text = extractText(el);
    if (!text) return;
    ops.push({ role: 'text', box, text });
  });

  // 稳定排序:上→下、左→右(pptx 叠放顺序 & 阅读序)。
  ops.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);

  return {
    slide: slideIndex,
    w: window.innerWidth,
    h: window.innerHeight,
    theme,
    ops,
    notes: notes || undefined,
    hardFallback: ops.length === 0,
  };
}

/** 把当前 slide 的导出模型写进 <script id="__deck_export">(Node 端 dump-dom 取)。
 *  采集抛错也**确定性写一个 hardFallback blob**(→整页截图),绝不留 null(null 会让 Node 端不确定地回退)。 */
export function writeExportBlob(stage: HTMLElement, slideIndex: number, notes?: string): void {
  let data: SlideExport;
  try {
    data = collectSlideExport(stage, slideIndex, notes);
  } catch {
    data = {
      slide: slideIndex,
      w: window.innerWidth,
      h: window.innerHeight,
      theme: {
        bg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#ffffff',
      } as ThemeModel,
      ops: [],
      hardFallback: true,
    };
  }
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  let el = document.getElementById('__deck_export');
  if (!el) {
    el = document.createElement('script');
    el.id = '__deck_export';
    (el as HTMLScriptElement).type = 'application/json';
    document.body.appendChild(el);
  }
  el.textContent = json;
  document.documentElement.setAttribute('data-export-ready', '1');
}
