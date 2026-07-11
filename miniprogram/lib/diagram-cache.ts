// mermaid 图表渲染缓存(与 math-cache 同构:内容寻址,叶子模块零依赖)。
// 值三态:DiagramImg = 已渲成(PNG 已落本地临时文件,存路径不存 base64 —— 大图 base64
// 走 setData 会卡);null = 渲染失败(永不重试,回退源码卡);缺键 = 未渲染。
export interface DiagramImg {
  path: string // 本地文件路径(wxfile://…),<image src> 与 previewImage 直接用
  width: number // 逻辑 px(1x)
  height: number
}

const cache = new Map<string, DiagramImg | null>()
let version = 0

export function getDiagram(code: string): DiagramImg | null | undefined {
  return cache.get(code)
}

export function hasDiagram(code: string): boolean {
  return cache.has(code)
}

// 写入即 bump 版本 → 页面 turnSig 失配,受影响轮重绘。
export function setDiagram(code: string, img: DiagramImg | null): void {
  cache.set(code, img)
  version++
}

export function diagramVersion(): number {
  return version
}
