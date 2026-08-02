// 取证轮路由 + 交付契约的工具名(2026-08 证据账本 P1 / 终稿 §四③「编排要加强」)。
//
// ── 这个文件回答一个问题:这一轮要不要走取证契约?────────────────────────────────
// 终稿否决清单 #11 明确否决「claw 无条件强制取证」:42.8% 零工具轮里大量是正当的闲聊 / 写作 /
// 统计轮,无条件强制会伤体验。所以必须先有一个**引擎侧、0 token、0 延迟、无 LLM**的判定。
// 否决清单 #5 同时禁止把这个判定交给模型自评 —— 那等于把刚拆掉的自由裁量装回去。
// ⇒ 有序规则 Router:首个命中生效,输入只有「工具面 + 会话账本 + 用户消息形态」三样,全是现成的。
//
// ── 误判代价刻意不对称 ────────────────────────────────────────────────────────
// 该 chat 判成 evidence:模型多一次检索、或多一次 DeclareInsufficient(贵,但无害);
// 该 evidence 判成 chat:模型凭训练记忆写题录 —— **唯一危险方向**。故规则整体偏向 evidence。
// 判定结果(phase + 命中的规则名)随 research_state 帧进 journal:误判率是可 SQL 复盘的生产探针,
// 不是拍脑袋的假设(终稿 W4 口径陷阱:不切分母的 42.8% 不可读)。
//
// ── 为什么账本非空就判 chat(rule ledger_grounded)────────────────────────────
// P1 的闸判据是 `ledger.count > 0`(终稿 3.3c;覆盖度轴是 P2)。账本非空时闸恒开 ——
// 在那种轮次上摆出 SubmitAnswer 就是**一条永远绿的规则**,本仓库被这个模式坑过(见 CLAUDE.md
// 跨包镜像整族 skip 的横幅设计)。宁可不给,也不给一个装样子的闸。
// 代价必须写明:同一会话后续换话题的轮次不受闸约束 —— 那正是 P2 覆盖度轴要补的洞。

export type ResearchPhase = "chat" | "evidence";

export interface ResearchVerdict {
  phase: ResearchPhase;
  /** 命中的规则名,原样进 research_state 帧 —— 让「为什么这轮被判成这样」可 SQL 复盘。 */
  rule: string;
}

// ── 交付契约的两个工具名(registry.ts 实现 / turnLoop.ts 编排,单一真源在这里)────────
export const SUBMIT_ANSWER_TOOL = "SubmitAnswer";
export const DECLARE_INSUFFICIENT_TOOL = "DeclareInsufficient";
export const ORCHESTRATION_TOOLS: ReadonlySet<string> = new Set([SUBMIT_ANSWER_TOOL, DECLARE_INSUFFICIENT_TOOL]);

/** 具备「写 / 执行」能力的工具:出现任意一个即说明本 feature 不是纯检索面(smart_search 判据)。 */
const WRITE_CAPABLE_TOOLS: ReadonlySet<string> = new Set([
  "Write", "Edit", "MultiEdit", "NotebookEdit", "Bash", "BashOutput", "KillShell",
  "Glob", "Grep", "ExportDocument", "BuildDeck",
]);

const MCP_TOOL_PREFIX = "mcp__";

// ── 文献取证意图(用户消息形态)────────────────────────────────────────────────
// 强信号:出现即判取证,不需要再配动词。
const STRONG_INTENT =
  /文献综述|研究现状|研究进展|最新进展|研究热点|系统综述|系统评价|荟萃分析|meta[\s-]?分析|参考文献|文献调研|文献检索|(?:有没有|有无|是否有|有哪些|找)[^。;\n]{0,6}证据|证据(?:支持|表明|显示|不足)|literature\s+review|systematic\s+review|scoping\s+review|meta[\s-]?analysis|state[\s-]of[\s-]the[\s-]art|prisma/i;
// 弱信号需「文献名词 × 寻求动作」同时命中 —— 单独一个「论文」不够(「这篇论文讲了什么」是读稿轮)。
const LIT_NOUN =
  /文献|论文|综述|期刊|预印本|被引|引用|研究|试验|队列|随机对照|paper|literature|stud(?:y|ies)|article|publication|preprint|citation|reference|trial|cohort|rct/i;
// SEEK_ACT 含**写作类动词**是刻意的:「帮我写一个 XX 综述」是最吃证据的一类请求,却既不含
// 「检索」也不含「找」—— 只认检索动词会把它整类漏掉(漏到 chat 是唯一危险方向)。
const SEEK_ACT =
  /检索|搜索|查询|查找|查一下|查查|查一查|找|收集|梳理|盘点|调研|列出|列举|推荐|综述一下|写|撰写|起草|汇总|整理|有哪些|还有哪些|有没有|哪几篇|哪些|最新|近年|近五年|前沿|进展|现状|证据|支持吗|是否有|search|find|look\s+up|list|recommend|write|draft|summari[sz]e|recent|latest|any\s+evidence|is\s+there\s+evidence|what\s+(?:are\s+)?(?:the\s+)?(?:recent|latest|key|main)/i;

export function hasLiteratureIntent(text: string): boolean {
  if (!text) return false;
  // 只看前 4000 字符:超长粘贴稿件的正文不该左右轮次形态,且这条路径在每轮热路上。
  const t = text.slice(0, 4000);
  if (STRONG_INTENT.test(t)) return true;
  return LIT_NOUN.test(t) && SEEK_ACT.test(t);
}

/**
 * 有序规则 Router —— 首个命中生效。
 *
 * @param toolNames 本轮**实际发给模型**的工具名(已过控制面 denylist / MCP 白名单)。
 *   用它而不是 featureKey:执行器无状态、后端从不下发 feature 名,而「能不能检索 / 能不能写」
 *   本来就是比 feature 名更贴近事实的判据(smart_search = 有检索面 + 零写面)。
 * @param interactive taskBudget 是否在场。backend 只给 5 个交互式 chat feature 盖预算章
 *   (ws.ts parseTaskBudget 注释);peerreview 等 server-side 任务型不盖 —— 它已经是仓内唯一
 *   plan-first 编排,终稿否决清单 #12 明写「不动它的编排」,故在此直接放行成 chat。
 */
export function classifyResearchTurn(a: {
  userText: string;
  ledgerTotal: number;
  toolNames: readonly string[];
  interactive: boolean;
}): ResearchVerdict {
  if (!a.interactive) return { phase: "chat", rule: "task_feature" };
  const hasRetrieval = a.toolNames.some((n) => n.startsWith(MCP_TOOL_PREFIX));
  if (!hasRetrieval) return { phase: "chat", rule: "no_retrieval_tools" };
  // 闸判据是 ledger.count>0 —— 账本非空即恒开,不摆恒绿的闸(见文件头)。
  if (a.ledgerTotal > 0) return { phase: "chat", rule: "ledger_grounded" };
  // 纯检索面(smart_search):它就是检索 feature,默认全开,不看消息形态。
  if (!a.toolNames.some((n) => WRITE_CAPABLE_TOOLS.has(n))) {
    return { phase: "evidence", rule: "retrieval_only_feature" };
  }
  if (hasLiteratureIntent(a.userText)) return { phase: "evidence", rule: "literature_intent" };
  return { phase: "chat", rule: "default" };
}
