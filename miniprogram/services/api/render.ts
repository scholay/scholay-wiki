// 公式渲染 API —— 受保护。镜像后端 POST /user/render/math(agent MathJax → PNG + Redis 缓存)。
// 小程序 rich-text 跑不了 KaTeX,把 $$…$$ 送这里换成图内联。失败(400/5xx)时 reject,前端走文本兜底。
import { request } from '../request'
// MathImg 单一真源在 lib/math-cache;这里 re-export 供 renderMath 返回类型用,避免双声明漂移。
import type { MathImg } from '../../lib/math-cache'
export type { MathImg }

export function renderMath(tex: string, display: boolean): Promise<MathImg> {
  // quotaModal:false —— 后台静默渲染(失败走文本兜底),不该因 6010 在用户阅读时弹全局额度提示
  return request<MathImg>({ url: '/user/render/math', method: 'POST', data: { tex, display }, quotaModal: false })
}

// mermaid 图表 → PNG(agent headless Chromium 渲染,后端 Redis 长缓存)。
// 语法无法解析回 400 → reject,前端回退成源码卡。
export interface MermaidImg {
  png: string // base64(无 data: 前缀),2x 位图
  width: number // 逻辑 px(1x)
  height: number
}
export function renderMermaid(code: string): Promise<MermaidImg> {
  // 同 renderMath:后台静默渲染失败回退源码卡,禁全局额度弹窗
  return request<MermaidImg>({ url: '/user/render/mermaid', method: 'POST', data: { code }, quotaModal: false })
}
