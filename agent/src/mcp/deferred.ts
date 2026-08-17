// MCP 工具的**渐进披露**(2026-08-14):常驻热工具,冷工具按需检索。
//
// ── 为什么要做 ────────────────────────────────────────────────────────────────
// minicod 0.4.1 定义 76 个工具 ≈ 49,767 tokens。featurePolicy 的 allowedMcpTools 已把它收敛到
// 每 feature 12~17 个,但那仍是 9.4k~14.5k tokens,占 prism 常驻前缀(实测下限 19,073)的一半、
// 占 claw/smart_search 的七成 —— **每一次 LLM call 都在为它付钱**,而线上一个月的真实调用
// 分布是极端长尾:每个 feature 的 top 4 覆盖 92%~96%,top 9 覆盖 98%+。
//
// ── 为什么这样做(而不是别的三种)────────────────────────────────────────────
// ① Anthropic 官方的 Tool Search(defer_loading + tool_search_tool_*)用不了:它是**服务端**能力,
//    要求 Anthropic 平台 + Claude 模型 + advanced-tool-use beta 头。本项目三个 provider 是
//    DeepSeek / DashScope / BigModel。所以这里复用它的**协议形状**,在客户端实现。
// ② 「发现后把工具加进 tools[]」被否决:改 tools 会作废整条上游前缀缓存(Anthropic 官方口径:
//    tools → system → messages 分层,改上层作废下层),而且它就是 2026-08-13 那次事故的形状 ——
//    轮内工具面变形。本文件的全部意义是**让 tools[] 在一轮内恒定不变**。
// ③ 派生一个 per-feature 的新会话字段被否决:哪些 minicod 工具「热」是**全局事实**(由线上调用
//    分布决定),不是 feature 策略。feature 策略是 allowedMcpTools,它已经在 backend 里且已生效。
//    在这里再开一个平行的下发通道 = 两处真源、必然漂移。
//
// ── 契约 ──────────────────────────────────────────────────────────────────────
// 可见性 = allowedMcpTools ∩ RESIDENT_CORE;可执行性 = allowedMcpTools(**不变**)。
// 差集(允许但不常驻)经 ToolSearch 检索到定义、经 ToolInvoke 调用。featurePolicy.toolPermitted
// 仍是执行侧的唯一真源 —— 本文件只减少「广告面」,不放宽任何权限边界。

import { MCP_PREFIX } from "./mcpTools.ts";

/**
 * RESIDENT_CORE —— 常驻广告面的 minicod 工具(去前缀原始名)。
 *
 * 🔴 这份名单是**用线上真实调用分布算出来的**,不是拍脑袋。口径与重算方法:
 *
 *   SELECT t.feature_key, REPLACE(JSON_UNQUOTE(JSON_EXTRACT(e.payload,'$.toolName')),'mcp__minicod__','') tool,
 *          COUNT(*) n
 *     FROM agent_turn_events e JOIN agent_turns t ON t.id = e.turn_id
 *    WHERE e.ev_type='tool_use' AND JSON_UNQUOTE(JSON_EXTRACT(e.payload,'$.toolName')) LIKE 'mcp__%'
 *    GROUP BY 1,2 ORDER BY 1, n DESC;
 *
 * 2026-07-15 ~ 08-13 的分布(prism 1404 次 / claw 2742 次 / smart_search 2385 次)取并集,
 * 使每个 feature 的原生覆盖率 ≥98%:
 *   prism        top4 = 99.1%    claw  top9 = 98.1%    smart_search top9 = 98.4%
 * 落在名单外的调用不会失败,只是多走一次 ToolSearch(一次 tool_result,不破缓存)。
 *
 * ⚠️ 改这份名单前先重跑上面那条 SQL。凭直觉往里加工具 = 直接往每一次 LLM call 的账单上加钱;
 *    凭直觉往外删 = 把某个 feature 的主力路径打成两跳。两个方向都必须有数据。
 */
export const RESIDENT_CORE: ReadonlySet<string> = new Set([
  // 三个 feature 共同的绝对主力(单 search_papers 就占各自的 64%~79%)
  "search_papers",
  "get_paper",
  "get_paper_by_doi",
  "match_paper",
  // 引用接地 / 作者近作(smart_search 与 claw 的次主力)
  "search_authors",
  "get_author_papers",
  "get_paper_citations",
  "get_paper_references",
  "get_papers_batch",
  // 片段接地(反幻觉命门:可引用的原文片段)
  "search_snippets",
  // 投稿期刊(claw 的次主力:search_journals 95 次 / get_journal 27 次)
  "search_journals",
  "get_journal",
  "suggest_journals",
]);

/** 去前缀:mcp__minicod__search_papers → search_papers。非 MCP 名原样返回。 */
export function bareMcpName(name: string): string {
  return name.startsWith(MCP_PREFIX) ? name.slice(MCP_PREFIX.length) : name;
}

/** 该 MCP 工具是否常驻广告面。非 MCP 工具恒为 true(本机制只管 MCP)。 */
export function isResidentMcpTool(prefixedName: string): boolean {
  if (!prefixedName.startsWith(MCP_PREFIX)) return true;
  return RESIDENT_CORE.has(bareMcpName(prefixedName));
}

/**
 * 渐进披露总开关。默认**开**;置 "0" 关闭 → 全部 allowedMcpTools 回到常驻,
 * 行为与本机制上线前逐字相同(出事时的第一道回滚闸,不需要重新构建镜像)。
 */
export function deferralEnabled(): boolean {
  return process.env.EXECUTOR_DEFER_MCP_TOOLS !== "0";
}
