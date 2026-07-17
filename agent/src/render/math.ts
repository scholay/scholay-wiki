// 数学公式服务端渲染:MathJax(TeX → SVG,完整 LaTeX 覆盖:矩阵/aligned/cases/求和…)
//   → resvg-wasm(SVG → PNG,纯 WASM,无 Chrome / 无 native addon,Bun 安全)。
// 小程序 rich-text 跑不了 KaTeX,这里出 PNG,前端 <img> 内联即可;字形是 path,栅格化不依赖系统字体。

import { mathjax } from 'mathjax-full/js/mathjax.js'
import { TeX } from 'mathjax-full/js/input/tex.js'
import { SVG } from 'mathjax-full/js/output/svg.js'
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js'
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js'
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js'
import { initWasm, Resvg } from '@resvg/resvg-wasm'

const adaptor = liteAdaptor()
RegisterHTMLHandler(adaptor)
const texInput = new TeX({ packages: AllPackages })
const svgOutput = new SVG({ fontCache: 'none' }) // 内联 <path>,不用 <use>/<defs>,resvg 兼容性最好
const mjDoc = mathjax.document('', { InputJax: texInput, OutputJax: svgOutput })

// 1ex → 显示 px(宽高同比,只决定绝对大小不影响形状)。块级 ≈20px 字号观感;
// 行内用更小的 ex,让公式 x-height 贴近正文 28rpx≈14px(x-height≈7px)。
const EX_PX_BLOCK = 10
const EX_PX_INLINE = 7.5
const PNG_ZOOM = 2.5 // 高 DPI 位图,前端按 w/h 缩放显示 → 清晰
const MAX_TEX_LEN = 4000
const GLYPH_COLOR = '#1f2937' // 近黑,配浅底气泡文字色

export interface MathPng {
  png: string // base64(无 data: 前缀)
  width: number // 显示 px(1x)
  height: number
  depth: number // 基线下沉量 px(行内公式用 vertical-align:-depth 贴文字基线;块级居中忽略)
}

// resvg-wasm 需先加载 wasm;懒加载 + 只加载一次。
let wasmReady: Promise<void> | null = null
function ensureWasm(): Promise<void> {
  if (!wasmReady) {
    wasmReady = (async () => {
      const bytes = await Bun.file(resolveWasmPath()).arrayBuffer()
      await initWasm(await WebAssembly.compile(bytes))
    })()
  }
  return wasmReady
}
function resolveWasmPath(): string {
  try {
    return Bun.resolveSync('@resvg/resvg-wasm/index_bg.wasm', import.meta.dir)
  } catch {
    const main = Bun.resolveSync('@resvg/resvg-wasm', import.meta.dir)
    return main.replace(/[^/]+$/, 'index_bg.wasm')
  }
}

// 渲染串行化(评审 2026-07 性能审计):mjDoc.convert + resvg.render 是同步 CPU 段,在 Bun 单线程里
// 并发多个 /render/math 请求会背靠背霸占事件循环,卡住所有用户的流式输出。照 mermaid.ts 同款队列跑,
// 让每次渲染之间有微任务让位,后端 30 天 Redis 缓存摊薄冷启动成本。
let queue: Promise<unknown> = Promise.resolve()
export function renderMath(tex: string, display: boolean): Promise<MathPng> {
  const run = queue.then(() => doRenderMath(tex, display))
  queue = run.catch(() => {}) // 失败不断链
  return run
}

async function doRenderMath(tex: string, display: boolean): Promise<MathPng> {
  const src = (tex || '').trim()
  if (!src || src.length > MAX_TEX_LEN) throw new Error('invalid tex length')
  await ensureWasm()

  const node = mjDoc.convert(src, { display })
  let svg = adaptor.innerHTML(node) as string // <svg …>…</svg>
  if (!svg || svg.indexOf('<svg') < 0) throw new Error('mathjax produced no svg')
  if (svg.indexOf('data-mjx-error') >= 0 || svg.indexOf('merror') >= 0) throw new Error('tex parse error')

  // MathJax 的 width/height 单位是 ex → 换成 px,resvg 才能定输出尺寸。行内用更小的 ex。
  const exPx = display ? EX_PX_BLOCK : EX_PX_INLINE
  const wEx = matchNum(svg, /\bwidth="([\d.]+)ex"/)
  const hEx = matchNum(svg, /\bheight="([\d.]+)ex"/)
  // vertical-align:-X.XXXex = 公式基线以下的 descent;行内 <img> 用它贴文字基线。
  const vaEx = matchNum(svg, /vertical-align:\s*(-?[\d.]+)ex/)
  const width = Math.max(1, Math.round(wEx * exPx))
  const height = Math.max(1, Math.round(hEx * exPx))
  const depth = Math.max(0, Math.round(Math.abs(vaEx) * exPx))
  svg = svg
    .replace(/\bwidth="[\d.]+ex"/, 'width="' + width + '"')
    .replace(/\bheight="[\d.]+ex"/, 'height="' + height + '"')
    .replace(/currentColor/g, GLYPH_COLOR) // resvg 不解析 currentColor,固定成近黑

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'zoom', value: PNG_ZOOM },
    background: 'rgba(255,255,255,0)', // 透明底,融进气泡
  })
  const png = resvg.render().asPng()
  return { png: Buffer.from(png).toString('base64'), width, height, depth }
}

function matchNum(s: string, re: RegExp): number {
  const m = s.match(re)
  return m ? Number(m[1]) : 0
}
