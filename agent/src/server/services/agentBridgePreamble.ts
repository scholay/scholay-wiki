/**
 * Scholay backend (internal/agentbridge/ws.go buildInjectionPrefix) 会把一段"规则前缀"
 * 拼到首条 user_message 前面, 格式:
 *   [AGENT BRIDGE — STRICT RULES YOU MUST FOLLOW]\n<规则...>\n[/AGENT BRIDGE — END OF RULES]\n\n以下是用户的请求:\n<真实请求>
 *
 * 凡是"基于首条用户消息做展示"的地方 (标题生成 deriveTitle/generateTitle, 列表标题 fallback)
 * 都必须先剥掉这段 wrapper, 否则会话标题会变成 "[AGENT BRIDGE — STRICT RULES...]"。
 *
 * 抽到独立文件是为了避免 titleService ↔ sessionService 互相 import 形成循环依赖
 * (titleService 依赖 sessionService 写盘, sessionService 又需要这个 strip)。
 *
 * 注意: END marker 字符串必须跟 backend buildInjectionPrefix 保持一致 (含 em-dash —, U+2014)。
 */
const AGENT_BRIDGE_END_MARKER = '[/AGENT BRIDGE — END OF RULES]'

export function stripAgentBridgeRulesPreamble(text: string): string {
  const idx = text.indexOf(AGENT_BRIDGE_END_MARKER)
  if (idx === -1) return text
  const after = text
    .slice(idx + AGENT_BRIDGE_END_MARKER.length)
    // 去掉紧跟其后的 "以下是用户的请求:" 引导行
    .replace(/^\s*以下是用户的请求[:：]\s*/, '')
    .trim()
  // 万一剥完是空 (理论不会), 兜底返回原文避免标题彻底空掉
  return after || text
}
