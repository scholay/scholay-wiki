// mermaid 图表服务端渲染:headless Chromium(系统包)+ 本地 mermaid.min.js → PNG。
// 小程序无 DOM 跑不了 mermaid,这里出 2x PNG,前端 <image> 内嵌 + previewImage 缩放。
//
// 为什么不用 puppeteer:Bun 兼容性坑多、依赖重。这里直接调 chromium CLI 两遍:
//   pass1 --dump-dom 让 harness 页渲出 SVG 并把尺寸写进 <title>,解析出 W×H;
//   pass2 --window-size=W,H --screenshot 精确截图(--force-device-scale-factor=2 高清)。
// 渲染是纯函数,后端有 30 天 Redis 缓存,每张图一生只渲一次 —— 两次冷启动可接受。
//
// 安全:输入只是 mermaid 文本(securityLevel strict,内部 DOMPurify);页面仅加载本地文件;
// --host-resolver-rules 把所有 DNS 解析封死,页面无法外联。--no-sandbox 是容器内
// chromium 的常规必需(无 user namespace);风险面 = 本地静态 harness,可接受。

import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const MAX_CODE_LEN = 20_000
const RENDER_TIMEOUT_MS = 20_000
const VIEW_W_MAX = 1600 // pass2 窗口上限(逻辑 px;2x 后位图 3200 封顶)
const VIEW_H_MAX = 4000

export interface MermaidPng {
  png: string // base64(无 data: 前缀)
  width: number // 逻辑 px(1x)
  height: number
}

function chromiumBin(): string {
  return process.env.CHROMIUM_PATH || '/usr/bin/chromium'
}

// 渲染串行化:图大时 Chromium 吃内存,并发渲染在小容器里会 OOM;队列跑,靠缓存摊薄。
let queue: Promise<unknown> = Promise.resolve()
export function renderMermaid(code: string): Promise<MermaidPng> {
  const run = queue.then(() => doRender(code))
  queue = run.catch(() => {}) // 失败不断链
  return run
}

async function doRender(code: string): Promise<MermaidPng> {
  const src = (code || '').trim()
  if (!src || src.length > MAX_CODE_LEN) throw new Error('invalid mermaid code length')

  const dir = await mkdtemp(join(tmpdir(), 'mmd-'))
  try {
    const mermaidJs = Bun.resolveSync('mermaid/dist/mermaid.min.js', import.meta.dir)
    const harness = join(dir, 'h.html')
    await writeFile(harness, buildHarness(src, mermaidJs), 'utf-8')

    // pass1:渲出 SVG,尺寸写进 <title>(dump-dom 里解析)。
    const dom = await runChromium(['--dump-dom', '--virtual-time-budget=10000', 'file://' + harness])
    const m = dom.match(/<title>MMD:(OK|ERR):([^<]*)<\/title>/)
    if (!m) throw new Error('mermaid harness produced no result')
    if (m[1] === 'ERR') {
      const e = new Error('mermaid parse error: ' + m[2].slice(0, 200))
      ;(e as Error & { status?: number }).status = 422
      throw e
    }
    const [wRaw, hRaw] = m[2].split('x').map((n) => Math.ceil(parseFloat(n)))
    if (!wRaw || !hRaw || !isFinite(wRaw) || !isFinite(hRaw)) throw new Error('bad svg dims: ' + m[2])
    const width = Math.min(Math.max(wRaw, 40), VIEW_W_MAX)
    const height = Math.min(Math.max(hRaw, 40), VIEW_H_MAX)

    // pass2:按内容尺寸开窗截图(2x)。
    const shot = join(dir, 'out.png')
    await runChromium([
      '--screenshot=' + shot,
      '--window-size=' + width + ',' + height,
      '--force-device-scale-factor=2',
      '--default-background-color=FFFFFFFF',
      '--hide-scrollbars',
      '--virtual-time-budget=10000',
      'file://' + harness,
    ])
    const png = Buffer.from(await readFile(shot)).toString('base64')
    if (!png) throw new Error('empty screenshot')
    return { png, width, height }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

async function runChromium(args: string[]): Promise<string> {
  const proc = Bun.spawn(
    [
      chromiumBin(),
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-extensions',
      '--disable-background-networking',
      '--host-resolver-rules=MAP * ~NOTFOUND', // 封死一切外联(harness 只用本地文件)
      ...args,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  )
  const timer = setTimeout(() => proc.kill(), RENDER_TIMEOUT_MS)
  try {
    const out = await new Response(proc.stdout).text()
    const exit = await proc.exited
    if (exit !== 0 && !out) {
      const errText = await new Response(proc.stderr).text()
      throw new Error('chromium exit ' + exit + ': ' + errText.slice(0, 300))
    }
    return out
  } finally {
    clearTimeout(timer)
  }
}

// harness:白底、内联本地 mermaid、渲染后把 SVG 摆到 (0,0) 并上报尺寸。
// 结果经 <title> 传出(dump-dom 一定包含);securityLevel strict = mermaid 内置 DOMPurify。
function buildHarness(code: string, mermaidJsPath: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>MMD:PENDING</title>
<style>html,body{margin:0;padding:0;background:#fff}#g{display:inline-block;padding:12px}</style>
</head><body>
<div id="g"></div>
<script src="file://${mermaidJsPath}"></script>
<script>
(async () => {
  try {
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral',
      fontFamily: '"Noto Sans CJK SC","PingFang SC",system-ui,sans-serif' });
    const code = ${JSON.stringify(code)};
    await mermaid.parse(code);
    const { svg } = await mermaid.render('m1', code);
    const g = document.getElementById('g');
    g.innerHTML = svg;
    const el = g.querySelector('svg');
    // mermaid 出的 svg 常用 max-width 百分比;固定为实际内容尺寸,让窗口贴合。
    const bb = el.getBBox();
    const w = Math.ceil(bb.width + bb.x * 2) || el.getBoundingClientRect().width;
    const h = Math.ceil(bb.height + bb.y * 2) || el.getBoundingClientRect().height;
    el.setAttribute('width', w); el.setAttribute('height', h);
    el.style.maxWidth = 'none';
    const rect = g.getBoundingClientRect();
    document.title = 'MMD:OK:' + Math.ceil(rect.width) + 'x' + Math.ceil(rect.height);
  } catch (e) {
    document.title = 'MMD:ERR:' + String(e && e.message || e).replace(/</g, ' ').slice(0, 180);
  }
})();
</script>
</body></html>`
}
