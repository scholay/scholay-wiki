// ============================================================================
// 本轮 per-call token 用量收集器(在 CLI 子进程内累计,随 result 帧带出)。
//
// 背景:token 账本改为「带内」—— agent 不再用独立 HTTP 回调上报用量(那条旁路在子
// 进程里拿错鉴权密钥、且 fire-and-forget 易丢)。改为:每次真实模型调用把用量 push 进
// 这个进程级单例;QueryEngine 在 result 帧 drain 出来(per_call_usages),经既有 WS 流
// 回到后端,后端在已鉴权的会话上按模型逐行记账。
//
// 进程级单例是安全的:一个 CLI 子进程只服务一个会话;drain 在每个 result 帧(=每轮)
// 调用一次,天然按轮清空。
// ============================================================================

/** 一次真实模型调用的用量(主轮 / 子 agent / 上下文压缩 / advisor 各算一次)。 */
export interface PerCallUsage {
  model: string
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_creation_tokens: number
}

// 单轮上限:正常一轮几次~几十次调用;给个宽松硬上限兜底,防极端情况下 result 帧无界膨胀。
const MAX_PER_TURN = 2000

let perCallUsages: PerCallUsage[] = []

/** 记一次模型调用的 per-call 用量(claude.ts 在每次 message_delta / 非流式完成时调用)。 */
export function recordPerCallUsage(u: PerCallUsage): void {
  if (perCallUsages.length >= MAX_PER_TURN) return
  perCallUsages.push(u)
}

/** 取出并清空本轮累计的 per-call 用量(QueryEngine 在构造 result 帧时调用)。 */
export function drainPerCallUsages(): PerCallUsage[] {
  if (perCallUsages.length === 0) return []
  const out = perCallUsages
  perCallUsages = []
  return out
}
