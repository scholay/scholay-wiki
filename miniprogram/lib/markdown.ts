// 轻量 Markdown -> HTML 字符串,喂给小程序内置 <rich-text nodes>。
// 覆盖常见:标题 / 粗体 / 斜体 / 行内代码 / 代码块 / 有序无序列表 / 引用 / 链接(文本)/ 段落。
// 不引第三方(native 无 build-npm);链接在 rich-text 里不可点,渲染成蓝色文本。
import { getMath } from './math-cache'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
// 反转义:esc 只产出 &amp; &lt; &gt;,逆序还原(&amp; 放最后)得原始 TeX,
// 喂 getMath(与块级/extractInlineMath 的原始 tex 逐字节一致 —— 内容寻址缓存必须一致才命中)。
function unesc(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}
// 货币/散文误配启发式:以数字开头 + 含空格 + 无任何数学符号 → 判为非公式(如 "5 for the item")。
// 窄化到"含空格"避免误伤 $2n$/$5x$ 这类合法的数字打头简单公式。
function looksLikeMath(tex: string): boolean {
  const t = tex.trim()
  if (!t) return false
  if (/^\d/.test(t) && /\s/.test(t) && !/[\\^_{}=+*/<>|-]/.test(t)) return false
  return true
}

// 排版对齐移动端 Web(shared/components/chat/styles.tsx):正文 24rpx/1.7、
// 行内代码 surface-2 底、代码块 surface-1 + 描边、链接品牌松青下划线、表头 surface-1。
//
// ⚠️ 下面这些样式串进的是 <rich-text> 的 nodes —— 微信 rich-text 里 **CSS 变量不生效**,
//    app.wxss 的 token 完全够不着,只能写死十六进制。所以这里是 app.wxss(其真源是
//    frontend-user/src/styles/globals.css)的**第二层手工镜像**:
//      #1F1F23 foreground · #686873 muted · #E8E5DC surface-2 · #EFEDE5 surface-1
//      #E4E4E5 border(玄墨 12% 叠白)· #EDEDEE border-soft · #D6D6D8 border-strong
//      #2F4D29 品牌松青(链接)· #2E5AA8 = globals --cat-blue(公式/示意图专用分类色,
//      不是品牌色 —— 体系里没有蓝系)
//    改 globals → 改 app.wxss → 也要改这里。三处必须一起动。
const MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace'
const CODE_STYLE =
  'background:#E8E5DC;padding:2rpx 10rpx;border-radius:8rpx;font-family:' + MONO + ';font-size:28rpx;color:#1F1F23'
const PRE_STYLE =
  'background:#EFEDE5;border:1rpx solid #E4E4E5;padding:24rpx;border-radius:12rpx;font-family:' +
  MONO +
  ';font-size:26rpx;line-height:1.65;white-space:pre;overflow-x:auto;margin:0 0 24rpx'
const QUOTE_STYLE = 'border-left:4rpx solid #D6D6D8;padding-left:24rpx;color:#686873;margin:0 0 24rpx'
const LINK_STYLE = 'color:#2F4D29;text-decoration:underline'
const EM_STYLE = 'font-style:normal;color:#686873' // Web 的 em 刻意做成灰色元数据、不斜体
const HR_STYLE = 'height:1rpx;background:#EDEDEE;margin:28rpx 0'
// GFM 表格:不再在 rich-text 里画 table —— 微信 rich-text 字符串解析对 table 内容模型
// 处理很粗糙(td 里嵌 div、width:max-content 会整表渲染成空),表格改出**结构化单元格**
// 交给页面原生组件渲染(scroll-view 横滚 + display:table 网格),见 tableCells / claw.wxml。
// 列表同理踩过坑:rich-text 会丢 span 的 inline-block/text-indent 等样式(圆点/序号 chip
// 粘连成「•从单模态」「1Foundation」),回退到 rich-text 原生 ul/ol/li,由组件自己画 marker。
// 块级公式:优先服务端渲染的 PNG(见 math-cache);未渲染/失败时降级成原样 LaTeX 文本(可读、可复制)。
const MATH_STYLE =
  'background:#EEF2F8;border:1rpx solid #CBD6E9;border-radius:10rpx;padding:16rpx;font-family:monospace;font-size:24rpx;color:#1F1F23;white-space:pre-wrap;overflow-x:auto;margin:10rpx 0'
const MATH_IMG_WRAP = 'text-align:center;margin:14rpx 0'
// 行内公式:未命中/失败/超上限时的文本兜底样式;检测上限 + 正则(工厂返回新实例,避免共享 lastIndex)。
const INLINE_MATH_STYLE = 'font-family:monospace;color:#2E5AA8'
const INLINE_TEX_MAX = 160 // 行内公式内容上限;超出判为误匹配(货币/跨句)走文本兜底
const MAX_INLINE_IMG_PER_LINE = 10 // 每行行内图上限,直接封 base64 内联体积(高频重复符号防膨胀)
const MATH_LINE_MAX = 6000 // 单行超此长度跳过数学正则(纵深防 ReDoS:blockMathInlineRe 惰性量词最坏 O(n²))
// 行内 $…$:开定界符后非空白、闭定界符前非空白且其后不接数字(挡货币 $5 和 $8)、
//   开定界符前非 \ 非 $(挡转义 \$ 与残留块级 $)。前缀捕获(^|[^\\$])而非 lookbehind —— 兼容老 iOS JSCore。
function inlineMathRe(): RegExp {
  return /(^|[^\\$])\$([^\s$](?:[^$\n]*[^\s$])?)\$(?!\d)/g
}
// 段落内(非行首)块级 $$…$$;行首块级由 mdToHtml 块级分支处理,不到 inline()。
function blockMathInlineRe(): RegExp {
  return /(^|[^\\$])\$\$(?=\S)([\s\S]*?\S)\$\$(?!\d)/g
}

// 图表(mermaid 等)卡片:小程序无 DOM 跑不了 mermaid,渲染成一张干净的图表卡片而非一坨源码。
const DIAG_CARD_STYLE = 'border:1rpx solid #CBD6E9;border-radius:12rpx;background:#EEF2F8;margin:12rpx 0;padding:20rpx'
const DIAG_HEAD_STYLE = 'font-size:26rpx;color:#2E5AA8;font-weight:600'
const DIAG_NOTE_STYLE = 'font-size:22rpx;color:#686873;margin-top:8rpx'
const DIAG_LANGS = ['mermaid', 'flow', 'flowchart', 'sequence', 'sequencediagram', 'gantt', 'classdiagram', 'statediagram', 'erdiagram', 'mindmap', 'pie', 'timeline', 'journey', 'quadrantchart']
const DIAG_LABELS: Record<string, string> = {
  mermaid: '图表',
  graph: '流程图', // mermaid 首行 graph TD/LR —— LLM 最高频写法
  flow: '流程图',
  flowchart: '流程图',
  sequence: '时序图',
  sequencediagram: '时序图',
  gantt: '甘特图',
  classdiagram: '类图',
  statediagram: '状态图',
  erdiagram: '关系图',
  mindmap: '思维导图',
  pie: '饼图',
  timeline: '时间线',
  journey: '旅程图',
  quadrantchart: '象限图',
}
// mermaid 首行声明比围栏 lang 更具体(```mermaid\nmindmap → 思维导图)。
function diagLabel(lang: string, code: string): string {
  const first = (code.split('\n').find((l) => l.trim()) || '').trim().toLowerCase()
  const decl = first.split(/[\s({]/)[0].replace(/-.*$/, '') // "flowchart TB"→flowchart, "statediagram-v2"→statediagram
  return DIAG_LABELS[decl] || DIAG_LABELS[lang] || '图表'
}
function renderDiagramCard(label: string): string {
  return (
    '<div style="' + DIAG_CARD_STYLE + '">' +
    '<p style="' + DIAG_HEAD_STYLE + '">📊 ' + label + '</p>' +
    '<p style="' + DIAG_NOTE_STYLE + '">小程序暂不支持图表渲染,可在网页端查看完整图表</p>' +
    '</div>'
  )
}

// 单元格拆分:先把「不是列分隔」的竖线藏起来再 split —— GFM 转义 \|、行内代码 `a|b`、
// 行内公式 $P(A|B)$ 里的 | 都不是分隔符,盲拆会让整表多出幽灵列 + 残留字面转义。
const S3 = String.fromCharCode(3) // 藏起来的 |(拆分后还原)
const S3_RE = new RegExp(S3, 'g')
function splitRow(line: string): string[] {
  let s = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  s = s.replace(/\\\|/g, S3)
  s = s.replace(/`[^`]*`/g, (m) => m.replace(/\|/g, S3))
  s = s.replace(/\$[^$\n]*\$/g, (m) => m.replace(/\|/g, S3))
  return s.split('|').map((c) => c.trim().replace(S3_RE, '|'))
}
// GFM 对齐行 → 每列 text-align(:-- 左 / --: 右 / :-: 居中)。
function parseAligns(sep: string): string[] {
  return splitRow(sep).map((c) => {
    const l = c.charAt(0) === ':'
    const r = c.charAt(c.length - 1) === ':'
    return l && r ? 'center' : r ? 'right' : 'left'
  })
}
// 结构化单元格:纯文本走 t(页面 <text> 直出),含粗体/代码/公式等走 h(逐格小 rich-text)。
// a = 对齐:'' 左 / 'c' 中 / 'r' 右(GFM 对齐行)。i 供 WXML wx:key。
export interface MdCell {
  i: number
  a: '' | 'c' | 'r'
  t?: string
  h?: string
}
export interface MdRow {
  i: number
  c: MdCell[]
}
function tableCells(header: string[], aligns: string[], rows: string[][]): { head: MdCell[]; rows: MdRow[] } {
  // 列数取各行最大,短行补空单元格(真实数据里末行常缺列/缺尾竖线)。
  let cols = header.length
  for (const r of rows) if (r.length > cols) cols = r.length
  const mk = (raw: string | undefined, ci: number): MdCell => {
    const s = raw || ''
    const a: MdCell['a'] = aligns[ci] === 'center' ? 'c' : aligns[ci] === 'right' ? 'r' : ''
    if (!s) return { i: ci, a, t: '' }
    const html = inline(s)
    // inline() 没产生任何标记(纯文本)→ t 直出;否则 h 走逐格 rich-text 保住粗体/代码/公式。
    return html === esc(s) ? { i: ci, a, t: s } : { i: ci, a, h: html }
  }
  const head: MdCell[] = []
  for (let ci = 0; ci < cols; ci++) head.push(mk(header[ci], ci))
  const rws: MdRow[] = rows.map((r, ri) => {
    const c: MdCell[] = []
    for (let ci = 0; ci < cols; ci++) c.push(mk(r[ci], ci))
    return { i: ri, c }
  })
  return { head, rows: rws }
}

// 行内代码占位哨兵:控制字符包裹序号,正文不会出现,避免误伤正文中的数字片段。
const S1 = String.fromCharCode(1)
const S2 = String.fromCharCode(2)
const RESTORE_RE = new RegExp(S1 + '(\\d+)' + S2, 'g')

// 行内格式:先转义,再抽行内代码占位保护,再粗/斜/链接,最后还原代码。
function inline(raw: string): string {
  let s = esc(raw)
  const codes: string[] = []
  // 图片 ![alt](url) → <img>(外链直接吃;占位保护避免 url/alt 被后续格式化)。
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m: string, _alt: string, url: string) => {
    codes.push('<img src="' + url + '" style="max-width:100%;height:auto;border-radius:12rpx;margin:16rpx 0" />')
    return S1 + (codes.length - 1) + S2
  })
  s = s.replace(/`([^`]+)`/g, (_m: string, c: string) => {
    codes.push('<code style="' + CODE_STYLE + '">' + c + '</code>')
    return S1 + (codes.length - 1) + S2
  })
  // GFM 允许的裸 <br>(模型在表格单元格里高频使用):还原成真换行标签。
  // 必须在行内代码抽取之后 —— `<br/>`(想展示字面标签)已被藏进哨兵,不会被误还原。
  s = s.replace(/&lt;br\s*\/?&gt;/gi, '<br>')
  // ── 数学公式(必须在行内代码抽取之后:代码里的 $ 已成哨兵不误吃;在粗/斜/链接之前:保护 TeX 里的 * [ ]( ))──
  //    命中 math-cache 出图,否则原样 LaTeX 文本兜底。tex 从 esc 后串抽出,unesc 还原后查缓存
  //    (与块级 / extractInlineMath 的原始 tex 逐字节一致 —— 内容寻址缓存)。
  let inlineImgs = 0
  const pushMath = (escInner: string, display: boolean): string => {
    const tex = unesc(escInner).trim()
    const img = getMath(tex, display)
    const canImg = !!(img && img.png && (display || inlineImgs < MAX_INLINE_IMG_PER_LINE))
    let html: string
    if (canImg && img) {
      if (!display) inlineImgs++
      const wh = 'width:' + img.width + 'px;height:' + img.height + 'px'
      if (display) {
        html =
          '<div style="' + MATH_IMG_WRAP + '"><img src="data:image/png;base64,' + img.png +
          '" style="' + wh + ';max-width:100%" /></div>'
      } else {
        // depth=0(无 descent,如 $x$/$E=mc^2$)省略 vertical-align → 默认 baseline(比 middle 精确)。
        const va = img.depth ? ';vertical-align:-' + img.depth + 'px' : ''
        html =
          '<img src="data:image/png;base64,' + img.png +
          '" style="' + wh + ';display:inline-block' + va + '" />'
      }
    } else {
      // 未渲染(渲染中)/ 失败 / 超行内上限 → 原样 LaTeX 文本(escInner 已是转义安全文本)。
      html = '<span style="' + INLINE_MATH_STYLE + '">' + escInner.trim() + '</span>'
    }
    codes.push(html)
    return S1 + (codes.length - 1) + S2
  }
  // 数学抽取(超长行跳过,纵深防 ReDoS)。先块级内联 $$…$$(防被行内 $ 拆碎),再行内 $…$。
  if (s.length <= MATH_LINE_MAX) {
    s = s.replace(blockMathInlineRe(), (_m: string, pre: string, tex: string) => pre + pushMath(tex, true))
    s = s.replace(inlineMathRe(), (m: string, pre: string, tex: string) => {
      const t = unesc(tex).trim()
      if (t.length > INLINE_TEX_MAX || !looksLikeMath(t)) return m // 太长/像货币 → 原样保留
      return pre + pushMath(tex, false)
    })
  }
  s = s.replace(/\\\$/g, '$') // 剩余转义 \$ → 字面 $(真公式已抽走)
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>')
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em style="' + EM_STYLE + '">$2</em>')
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<span style="' + LINK_STYLE + '">$1</span>')
  s = s.replace(RESTORE_RE, (_m: string, i: string) => codes[Number(i)] || '')
  s = s.replace(/[\u0001\u0002]/g, '') // 安全网:清掉任何未还原的哨兵控制字符(极端相邻 $a$$b$$c$ 边界)
  return s
}

// 对标 Web:标题只比正文(24rpx)大半档,靠 600 字重区分 —— 轻噪声排版的关键。
const HEADING_SIZE: Record<number, string> = {
  1: '38rpx',
  2: '34rpx',
  3: '32rpx',
  4: '32rpx',
  5: '32rpx',
  6: '32rpx',
}
const HEADING_MARGIN: Record<number, string> = {
  1: '36rpx 0 16rpx',
  2: '32rpx 0 14rpx',
  3: '28rpx 0 12rpx',
  4: '24rpx 0 10rpx',
  5: '24rpx 0 10rpx',
  6: '24rpx 0 10rpx',
}

// 代码高亮:单遍 alternation(注释/字符串整体优先匹配,内部关键字/数字不再单独染),
// 无需占位;喂已转义的代码,rich-text 支持 <span style="color">。浅底配色(VS Code light)。
const CODE_KEYWORDS = new Set([
  'function', 'const', 'let', 'var', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case',
  'break', 'continue', 'import', 'export', 'from', 'default', 'class', 'extends', 'new', 'this', 'super',
  'async', 'await', 'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof', 'yield', 'delete',
  'def', 'lambda', 'pass', 'elif', 'with', 'as', 'in', 'is', 'not', 'and', 'or', 'raise', 'global',
  'public', 'private', 'protected', 'static', 'void', 'int', 'string', 'bool', 'float', 'double', 'char',
  'func', 'package', 'type', 'struct', 'interface', 'map', 'range', 'defer', 'go', 'chan', 'select',
  'true', 'false', 'null', 'undefined', 'nil', 'None', 'True', 'False',
])
const HL_RE = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|('[^'\n]*'|"[^"\n]*"|`[^`]*`)|(\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_]\w*\b)/g

function highlightCode(escaped: string): string {
  return escaped.replace(HL_RE, (m, comment, str, num, word) => {
    if (comment) return '<span style="color:#008000">' + comment + '</span>'
    if (str) return '<span style="color:#a31515">' + str + '</span>'
    if (num) return '<span style="color:#098658">' + num + '</span>'
    if (word) return CODE_KEYWORDS.has(word) ? '<span style="color:#0000ff">' + word + '</span>' : word
    return m
  })
}

// 分段渲染真源:正文段('h')喂 rich-text;表格段('t')由页面放进原生 scroll-view 横滚;
// 图表段('d')由页面渲染成可展开源码的折叠卡(mermaid 真渲染需 Chrome,owner 否决加基建)。
export interface MdSegment {
  k: 'h' | 't' | 'd'
  html?: string // k='h'
  head?: MdCell[] // k='t':表头单元格(原生渲染)
  rows?: MdRow[] // k='t':数据行
  lang?: string // k='d'
  label?: string // k='d':思维导图/流程图/…
  code?: string // k='d':原始源码(native 展示,不进 rich-text)
  done?: boolean // k='d':围栏已闭合(流式中未闭合的源码先别进 VM,防每帧整轮重发)
}

export function mdToSegments(md: string): MdSegment[] {
  if (!md) return []
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const segs: MdSegment[] = []
  const out: string[] = [] // 当前 html 段缓冲
  let i = 0
  let para: string[] = []

  const flushPara = () => {
    if (para.length) {
      out.push('<p style="margin:0 0 24rpx;line-height:1.65">' + para.map(inline).join('<br>') + '</p>')
      para = []
    }
  }
  const flushHtml = () => {
    if (out.length) {
      segs.push({ k: 'h', html: out.join('') })
      out.length = 0
    }
  }

  while (i < lines.length) {
    const line = lines[i]

    const fence = line.match(/^```\s*([A-Za-z0-9_+-]+)?/)
    if (fence) {
      flushPara()
      const lang = (fence[1] || '').toLowerCase()
      const buf: string[] = []
      i++
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i])
        i++
      }
      const closed = i < lines.length // false = 未闭合(流式中/截断)
      i++
      // 图表语言(mermaid 等)→ 独立段(页面渲染折叠卡,源码可看);其余 → 高亮代码块。
      if (DIAG_LANGS.indexOf(lang) >= 0) {
        flushHtml()
        const code = buf.join('\n')
        segs.push({ k: 'd', lang, label: diagLabel(lang, code), code, done: closed })
      } else {
        out.push('<pre style="' + PRE_STYLE + '"><code>' + highlightCode(esc(buf.join('\n'))) + '</code></pre>')
      }
      continue
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      flushPara()
      const level = h[1].length
      out.push(
        '<p style="font-weight:600;color:#1F1F23;font-size:' + HEADING_SIZE[level] + ';margin:' + HEADING_MARGIN[level] + '">' +
          inline(h[2]) +
          '</p>',
      )
      i++
      continue
    }

    // 水平分隔线 ---(≥3 个 - / * / _ 独占一行;列表正则要求符号后有空格,不冲突)
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushPara()
      out.push('<div style="' + HR_STYLE + '"></div>')
      i++
      continue
    }

    if (/^>\s?/.test(line)) {
      flushPara()
      const buf: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      out.push('<blockquote style="' + QUOTE_STYLE + '">' + buf.map(inline).join('<br>') + '</blockquote>')
      continue
    }

    // 列表:用 rich-text 原生 ul/ol/li(marker 由组件自己画)。自渲染圆点/序号 chip
    // 已验证不可行 —— rich-text 字符串解析会丢 span 的 inline-block/text-indent 样式。
    if (/^\s*[-*+]\s+/.test(line)) {
      flushPara()
      const items: string[] = []
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push('<li style="margin:12rpx 0;line-height:1.65">' + inline(lines[i].replace(/^\s*[-*+]\s+/, '')) + '</li>')
        i++
      }
      out.push('<ul style="margin:0 0 24rpx;padding-left:44rpx">' + items.join('') + '</ul>')
      continue
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      flushPara()
      const items: string[] = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push('<li style="margin:12rpx 0;line-height:1.65">' + inline(lines[i].replace(/^\s*\d+\.\s+/, '')) + '</li>')
        i++
      }
      out.push('<ol style="margin:0 0 24rpx;padding-left:48rpx">' + items.join('') + '</ol>')
      continue
    }

    // 块级公式 $$...$$(降级:小程序无法渲染 KaTeX,原样展示 LaTeX,可读可复制)
    if (/^\s*\$\$/.test(line)) {
      flushPara()
      const single = line.trim().match(/^\$\$([\s\S]*)\$\$$/)
      const buf: string[] = []
      if (single && single[1].length > 0) {
        buf.push(single[1])
        i++
      } else {
        buf.push(line.replace(/^\s*\$\$/, ''))
        i++
        while (i < lines.length && !/\$\$\s*$/.test(lines[i])) {
          buf.push(lines[i])
          i++
        }
        if (i < lines.length) {
          buf.push(lines[i].replace(/\$\$\s*$/, ''))
          i++
        }
      }
      const tex = buf.join('\n').trim()
      const img = tex ? getMath(tex, true) : null
      if (img && img.png) {
        // 服务端渲染好的 PNG,内联居中(宽度已按容器裁过)。
        out.push(
          '<div style="' + MATH_IMG_WRAP + '"><img src="data:image/png;base64,' + img.png +
            '" style="width:' + img.width + 'px;height:' + img.height + 'px;max-width:100%" /></div>',
        )
      } else {
        // 未渲染(渲染中)/ 渲染失败 → 原样展示 LaTeX 文本。
        out.push('<pre style="' + MATH_STYLE + '">' + esc(tex) + '</pre>')
      }
      continue
    }

    // GFM 表格:| a | b | 后跟 |---|---| 分隔行。数据行放宽到「以 | 开头」——
    // 真实数据里末行常缺尾竖线(GFM 里尾竖线本就可选),严格要求会整行丢失。
    if (
      /^\s*\|.*\|\s*$/.test(line) &&
      i + 1 < lines.length &&
      /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) &&
      lines[i + 1].indexOf('-') >= 0
    ) {
      flushPara()
      const header = splitRow(line)
      const aligns = parseAligns(lines[i + 1])
      i += 2
      const rows: string[][] = []
      while (i < lines.length && /^\s*\|/.test(lines[i]) && lines[i].indexOf('|', lines[i].indexOf('|') + 1) > 0) {
        rows.push(splitRow(lines[i]))
        i++
      }
      flushHtml()
      const cells = tableCells(header, aligns, rows)
      segs.push({ k: 't', head: cells.head, rows: cells.rows })
      continue
    }

    if (line.trim() === '') {
      flushPara()
      i++
      continue
    }

    para.push(line)
    i++
  }
  flushPara()
  flushHtml()
  return segs
}

// 拼回单串 HTML(产物文本预览等仍走 rich-text 一把梭的场景)。
// 表格用最保守的写法(width:100% + 单元格直嵌内容,不用 div/max-content —— rich-text 吃不下)。
const FB_TH = 'border:1rpx solid #E4E4E5;padding:12rpx 16rpx;text-align:left;font-weight:600;background:#EFEDE5;word-break:break-word'
const FB_TD = 'border:1rpx solid #E4E4E5;padding:12rpx 16rpx;text-align:left;vertical-align:top;word-break:break-word'
function fbCell(c: MdCell, tag: 'th' | 'td'): string {
  // td 里嵌 div 会让 rich-text 整表渲染成空(真机实锤)—— 格内块级公式的
  // <div> 包裹(MATH_IMG_WRAP)降级成 <span>,图片直嵌单元格。
  const inner = c.h !== undefined ? c.h.replace(/<div /g, '<span ').replace(/<\/div>/g, '</span>') : esc(c.t || '')
  return '<' + tag + ' style="' + (tag === 'th' ? FB_TH : FB_TD) + '">' + inner + '</' + tag + '>'
}
export function mdToHtml(md: string): string {
  return mdToSegments(md)
    .map((s) => {
      if (s.k === 't') {
        const th = (s.head || []).map((c) => fbCell(c, 'th')).join('')
        const body = (s.rows || []).map((r) => '<tr>' + r.c.map((c) => fbCell(c, 'td')).join('') + '</tr>').join('')
        return (
          '<table style="width:100%;border-collapse:collapse;font-size:22rpx;margin:0 0 20rpx"><thead><tr>' +
          th + '</tr></thead><tbody>' + body + '</tbody></table>'
        )
      }
      if (s.k === 'd') return renderDiagramCard(s.label || '图表')
      return s.html || ''
    })
    .join('')
}

// 抽出所有**已闭合**的图表围栏源码(mermaid 等,与 mdToSegments 的围栏检测同构)。
// 页面层据此异步渲染(agent Chromium → PNG)→ 回填 diagram-cache → 重绘时内嵌 <image>。
// 未闭合(流式中)不抽:代码还在变,渲了也是废图。
export function extractDiagrams(md: string): string[] {
  if (!md) return []
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const fence = lines[i].match(/^```\s*([A-Za-z0-9_+-]+)?/)
    if (!fence) {
      i++
      continue
    }
    const lang = (fence[1] || '').toLowerCase()
    const buf: string[] = []
    i++
    while (i < lines.length && !/^```/.test(lines[i])) {
      buf.push(lines[i])
      i++
    }
    const closed = i < lines.length
    i++
    if (closed && DIAG_LANGS.indexOf(lang) >= 0) {
      const code = buf.join('\n').trim()
      if (code && out.indexOf(code) < 0) out.push(code)
    }
  }
  return out
}

// 抽出所有块级公式 $$…$$ 的 TeX(与 mdToHtml 的块级检测同构:跳过代码围栏,只认行首 $$)。
// 页面层据此异步渲染 → 回填 math-cache → 重绘时 mdToHtml 换成图。
export function extractBlockMath(md: string): string[] {
  if (!md) return []
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let i = 0
  let inFence = false
  while (i < lines.length) {
    const line = lines[i]
    if (/^```/.test(line)) {
      inFence = !inFence
      i++
      continue
    }
    if (inFence) {
      i++
      continue
    }
    if (/^\s*\$\$/.test(line)) {
      const single = line.trim().match(/^\$\$([\s\S]*)\$\$$/)
      const buf: string[] = []
      if (single && single[1].length > 0) {
        buf.push(single[1])
        i++
      } else {
        buf.push(line.replace(/^\s*\$\$/, ''))
        i++
        while (i < lines.length && !/\$\$\s*$/.test(lines[i])) {
          buf.push(lines[i])
          i++
        }
        if (i < lines.length) {
          buf.push(lines[i].replace(/\$\$\s*$/, ''))
          i++
        }
      }
      const tex = buf.join('\n').trim()
      if (tex) out.push(tex)
      continue
    }
    i++
  }
  return out
}

// 抽出所有行内公式 $…$ 的 TeX(与 inline() 用同一检测规则:跳代码围栏、跳行首块级 $$ 行)。
// 读原始 md(未 esc),故 tex 直接是原始态,与 inline() 里 unesc 后的 tex 逐字节一致(内容寻址缓存)。
// 页面层据此异步渲染(display=false)→ 回填 math-cache → 重绘时 inline() 换成图。
export function extractInlineMath(md: string): string[] {
  if (!md) return []
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let inFence = false
  for (const line of lines) {
    if (/^```/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence || /^\s*\$\$/.test(line) || line.length > MATH_LINE_MAX) continue // 代码块 & 行首块级 & 超长行不抽
    // 与 inline() 一致:先剥图片(![alt](url))再剥行内代码,别把其中的 $ 当公式。
    const clean = line.replace(/!\[[^\]]*\]\([^)\s]+\)/g, ' ').replace(/`[^`]+`/g, ' ')
    const re = inlineMathRe()
    let m: RegExpExecArray | null
    while ((m = re.exec(clean)) !== null) {
      const tex = (m[2] || '').trim()
      if (tex && tex.length <= INLINE_TEX_MAX && looksLikeMath(tex) && out.indexOf(tex) < 0) out.push(tex)
    }
  }
  return out
}

// 抽出段落内(非行首)块级 $$…$$ 的 TeX(与 inline() 的 blockMathInlineRe 同规则)。
// 行首独占的块级由 extractBlockMath 负责;这条补上"句中 $$…$$"的派发,使 inline() 的出图分支可达。
export function extractInlineBlockMath(md: string): string[] {
  if (!md) return []
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let inFence = false
  for (const line of lines) {
    if (/^```/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence || /^\s*\$\$/.test(line) || line.length > MATH_LINE_MAX) continue
    // 与 extractInlineMath / inline() 一致:先剥图片(![alt](url))再剥行内代码,别把其中的 $$ 当公式。
    const clean = line.replace(/!\[[^\]]*\]\([^)\s]+\)/g, ' ').replace(/`[^`]+`/g, ' ')
    const re = blockMathInlineRe()
    let m: RegExpExecArray | null
    while ((m = re.exec(clean)) !== null) {
      const tex = (m[2] || '').trim()
      if (tex && tex.length <= INLINE_TEX_MAX && out.indexOf(tex) < 0) out.push(tex)
    }
  }
  return out
}
