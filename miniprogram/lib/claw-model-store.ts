// per-session 模型偏好持久化(对齐 Web scholay:claw:session-model)。
// agent 的 set_runtime_config 不写盘 → 每次新 WS 都要重发 → 偏好只能前端存(wx.storage)。
// 小程序总是先建好 session 再对话,故只用「按 sessionId 存」这一把 key(不需要新对话单独 key)。
const KEY = 'scholay:claw:session-model'

function readMap(): Record<string, string> {
  try {
    return (wx.getStorageSync(KEY) as Record<string, string>) || {}
  } catch {
    return {}
  }
}

export function getSessionModel(sessionId: string): string {
  if (!sessionId) return ''
  return readMap()[sessionId] || ''
}

export function setSessionModel(sessionId: string, modelId: string | null): void {
  if (!sessionId) return
  const m = readMap()
  if (!modelId) delete m[sessionId]
  else m[sessionId] = modelId
  try {
    wx.setStorageSync(KEY, m)
  } catch {
    /* 存储满/禁用 → 忽略 */
  }
}
