// ============================================================================
// agent → backend 内网回调:上报「带外」token 用量 —— 即那些 agent 直连模型、**不产生
// message_complete 帧**的调用(会话标题生成,未来的上下文压缩 / 子-agent)。正常对话轮的
// token 永远走 WS 的 message_complete,后端在那里记账;此通道只补「带外」那部分,两路互斥不双计。
//
// fire-and-forget:超时/失败只 console.warn,**绝不阻塞、绝不抛**(标题生成本就 best-effort)。
// 鉴权用内网共享密钥 Bearer = ANTHROPIC_API_KEY(容器内被覆盖成 AGENT_INTERNAL_TOKEN,
// 与 backend 的 AGENT_AUTH_TOKEN 同源)。走内网直连(NO_PROXY 含 scholar_backend,不经 egress)。
// ============================================================================

import type { TitleGenUsage } from './titleService.js'

const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL || 'http://scholar_backend:8080'

export interface AgentUsageReport {
  sessionId: string
  // agent_call: CLI 子进程内每一次真实模型调用(主轮 / 子 agent / 压缩等),一次一报、后端一次一记录。
  // title_gen: server 端直连模型的带外用量(不进 CLI 会话)。compaction/subagent 已被 agent_call 覆盖。
  kind: 'agent_call' | 'title_gen' | 'compaction' | 'subagent'
  model: string
  usage: TitleGenUsage
}

/** 上报一次带外 token 用量。失败静默(最多一次重试),不影响调用方主流程。 */
export async function reportTokenUsage(report: AgentUsageReport): Promise<void> {
  const token = process.env.ANTHROPIC_API_KEY || ''
  if (!token || !report.sessionId) return
  const url = `${BACKEND_BASE_URL.replace(/\/+$/, '')}/api/v1/internal/agent/usage`

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(report),
        signal: AbortSignal.timeout(3000),
      })
      // 2xx 成功;4xx 是脏请求,重试无意义 —— 都直接结束。
      if (resp.ok || (resp.status >= 400 && resp.status < 500)) return
    } catch (err) {
      if (attempt === 1) {
        console.warn(
          `[backendUsageClient] reportTokenUsage(${report.kind}) failed: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }
  }
}
