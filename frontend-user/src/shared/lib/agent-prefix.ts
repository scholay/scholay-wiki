/**
 * agentbridge 注入 prefix 的剥离工具。
 *
 * 背景:
 *   backend `internal/agentbridge/ws.go:buildInjectionPrefix` 会在用户首条
 *   `user_message` 前面拼一段:
 *
 *     [AGENT BRIDGE — STRICT RULES YOU MUST FOLLOW]
 *     <systemPrompt 全文>
 *     [/AGENT BRIDGE — END OF RULES]
 *
 *     以下是用户的请求:
 *     <真正的用户输入>
 *
 *   回放 (replayHistoryAsTurns) 时拿到的就是带 prefix 的版本, 必须剥掉再显示,
 *   否则用户会看到那一大段规则说明 (= 历史 bug: marker 漂移导致 strip 失效)。
 *
 * 为什么用正则不用 indexOf:
 *   - systemPrompt 文案 (品牌名 / 数据源映射 / 工具白名单 ...) 经常改, 用 indexOf
 *     方案就必须保证前后端的 *end-marker* 一字不差; 实际上历史上发生过 backend
 *     把 marker 从 "SCHOLAY 检索代理 — 规则结束" 改到 "AGENT BRIDGE — END OF RULES"
 *     而前端没同步, 整段 prefix 全部被渲染。
 *   - 用正则锁住 *start + end* 两个 marker, 中间 systemPrompt 怎么变都不影响匹配,
 *     脆弱面缩到只有 marker 本身变更; 改 marker 时大概率两边一起改。
 *
 * 同步契约:
 *   marker 字符串必须跟 backend `agentbridge/ws.go:buildInjectionPrefix` 保持一致。
 *   改 backend 时, 同步改这里的两个 marker 即可 (中间 .*? 是通配, 不用动)。
 *
 * 边界:
 *   - 文本不以 "[AGENT BRIDGE — STRICT RULES YOU MUST FOLLOW]" 开头 → 原样返回
 *   - 找不到 end marker (传输截断 / 历史脏数据) → 原样返回 (宁可显示也不要误删)
 *   - 多次注入 (理论上不会, agentbridge 有 atomic 单次保护) → 只剥第一次
 */

// 正则解读:
//   ^                                                     必须在文本开头, 防止匹配到用户自己引用的 marker
//   \[AGENT BRIDGE — STRICT RULES YOU MUST FOLLOW\]\n     start marker (\n 是 buildInjectionPrefix 必有的换行)
//   [\s\S]*?                                              systemPrompt 全文 (非贪婪, [\s\S] 是为了跨行)
//   \n\[\/AGENT BRIDGE — END OF RULES\]\n\n以下是用户的请求:\n  end marker (前导 \n 在 systemPrompt 末尾)
//
// 注意 "—" 是 EM DASH (U+2014) 不是普通 "-", 跟 backend 字面量必须一致。
const INJECTED_PREFIX_RE =
  /^\[AGENT BRIDGE — STRICT RULES YOU MUST FOLLOW\]\n[\s\S]*?\n\[\/AGENT BRIDGE — END OF RULES\]\n\n以下是用户的请求:\n/;

/**
 * 把 agentbridge 注入的 prompt prefix 从用户消息文本里剥掉。
 *
 * 幂等: 调用第二次返回同一字符串 (因为 prefix 已经没了, 正则不匹配)。
 * 安全: 没有匹配时原样返回 —— 不会误删用户内容。
 */
export function stripAgentBridgePrefix(text: string): string {
  return text.replace(INJECTED_PREFIX_RE, '');
}
