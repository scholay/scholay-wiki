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
 *   改 backend 时, 同步改这里的 marker 即可 (中间 .*? 是通配, 不用动)。
 *
 * ⚠️ 历史 bug (memory 段漏匹配):
 *   buildInjectionPrefix 在 END-OF-RULES marker 与「以下是用户的请求:」之间, 当 per-user
 *   长期记忆非空时还会插一段 `[关于这位用户 — 长期记忆…]…[/长期记忆]\n\n`。早期正则把
 *   END-OF-RULES 与「以下是用户的请求:」写成相邻 —— 凡是有记忆的用户, 整段 prefix 匹配
 *   失败、原样泄漏给用户 (= 截图里看到的现象)。现在用可选分组兼容「有/无记忆」两种形态。
 *   后端也已在历史出口 (agentbridge/bridge.go stripInjectionFromMessages) 兜底剥离,
 *   本前端正则是 defense-in-depth。
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
//   \n\[\/AGENT BRIDGE — END OF RULES\]\n\n               rules 段结束 marker
//   (?:\[关于这位用户[\s\S]*?\[\/长期记忆\]\n\n)?           可选的 per-user 长期记忆段 (memory 为空时不出现)
//   以下是用户的请求:\n                                     用户真实输入前的最后一行
//
// 注意 "—" 是 EM DASH (U+2014) 不是普通 "-", 跟 backend 字面量必须一致。
const INJECTED_PREFIX_RE =
  /^\[AGENT BRIDGE — STRICT RULES YOU MUST FOLLOW\]\n[\s\S]*?\n\[\/AGENT BRIDGE — END OF RULES\]\n\n(?:\[关于这位用户[\s\S]*?\[\/长期记忆\]\n\n)?以下是用户的请求:\n/;

/**
 * 把 agentbridge 注入的 prompt prefix 从用户消息文本里剥掉。
 *
 * 幂等: 调用第二次返回同一字符串 (因为 prefix 已经没了, 正则不匹配)。
 * 安全: 没有匹配时原样返回 —— 不会误删用户内容。
 */
export function stripAgentBridgePrefix(text: string): string {
  return text.replace(INJECTED_PREFIX_RE, '');
}
