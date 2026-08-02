// 取证型预检索 · 执行侧(2026-08 证据账本 P1)。检索式抽取在 prefetchQuery.ts(纯函数)。
//
// ── 它把哪条因果链改了 ────────────────────────────────────────────────────────────
//   今天:  用户问 → 模型直接开口(可凭记忆编)→ 想收工时被 SubmitAnswer 出口闸拦
//   预检索:用户问 → **引擎先查一次** → 账本已有真题录 → digest 注入 → 模型开口时看得见
//                                     → 「编」已经比「引」更贵了,不需要强制
// 出口闸是「拦住错误的路」,预检索是「让正确的路更便宜」。终稿 §三 3.2 的成本表:引一条真文献
// 从 digest 里挑一个 [[E7]] ≈ 4 token,编一条假的 ≈ 40 token —— 只有账本非空时这张表才成立,
// 而**账本非空正是这个模块负责的事**。
//
// ── 为什么不走 runTools ────────────────────────────────────────────────────────────
// 走 runTools 就得先手搓一个 tool_use 塞进 history(否则 Anthropic 的 tool_use↔tool_result 配对
// 会崩),那等于**伪造一次模型的动作** —— 模型下一轮读 history 会看到「我调过 search_papers」,
// 我们刚要治的就是这种「宣称检索过」。所以这里直连 callMcpTool + ledger.ingest:
// 结果**只经证据账本进入模型视野**(digest),history 里一个字都不加。
// 这也顺带保证了 shadowTurn 冷重灌时它不会丢 —— 账本在会话 cwd,TTL 30 天。
//
// ── 三条边界 ──────────────────────────────────────────────────────────────────────
// 1. **控制面仍是权威**:只有 search_papers 出现在本轮真实工具面里才预检索(该工具面已过
//    DisallowedTools + AllowedMcpTools 两道过滤)。执行器绝不比控制面更宽。
// 2. **绝不阻塞本轮**:失败/超时/零结果一律照常让模型开口。🔴 这不是兜底 —— 兜底是「拦住错误
//    的路」,预检索是「让正确的路更便宜」;它失败时我们**回到今天的状态,不更差**,出口闸还在。
// 3. **一轮至多一次**。没有「零命中就换个词再来一次」的重试:那是模型的活(skill §5 的放宽顺序),
//    引擎多探一枪只会在延迟和账本噪声上双输。

import { callMcpTool } from "../mcp/mcpTools.ts";
import { log } from "../obs/log.ts";
import { ingest } from "./ledger.ts";
import { parsePapersFromToolResult } from "./parse.ts";
import { buildPrefetchQuery } from "./prefetchQuery.ts";

/** 去空 + 去重,保序。用于把题录标识符压成可入 journal 的紧凑列表。 */
function dedupeStrings(xs: (string | undefined)[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of xs) {
    if (!x) continue;
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}

/** 预检索工具:三个 feature 的 AllowedMcpTools 里都有它,且它是唯一「按主题找论文」的入口。 */
export const PREFETCH_TOOL = "mcp__minicod__search_papers";

/**
 * 结果状态。进 research_state 帧(带外可视化)+ slog,是这条改造的生产探针:
 *   hit         预检索拿到题录 → 模型开口时账本非空(这条改造起作用的那一格)
 *   empty       上游 0 命中 —— **本身就是信息**,见 note
 *   failed      上游 429/超时/熔断/异常 → 本轮回落到今天的行为
 *   no_query    抽不出主题(纯寒暄 / 纯指代 / 纯 meta 措辞)→ 不拿垃圾去搜
 *   unavailable 本轮工具面里没有 search_papers(控制面收窄或 MCP 未就绪)
 *   off         运维急停阀 EXECUTOR_EVIDENCE_PREFETCH=off
 */
export type PrefetchStatus = "hit" | "empty" | "failed" | "no_query" | "unavailable" | "off";

export interface PrefetchOutcome {
  status: PrefetchStatus;
  query?: string;
  /** 上游送达条数(0 = empty)。 */
  delivered?: number;
  /** 本次新入账的 E 编号。 */
  newIds?: string[];
  /** 本次送达题录的 DOI(去重、可能为空:并非所有源都给 DOI)。仅 status="hit" 时有值。 */
  dois?: string[];
  /** 本次送达题录的规范化 paperId(olx:W… / pmd:… / stc 裸 id)。DOI 缺失时的兜底标识。 */
  paperIds?: string[];
  /** 注入模型视野的说明块;空串 = 什么都不注入(digest 自己会说账上有什么)。 */
  note: string;
}

// 三个旋钮**在调用时**读 env(与 turnLoop 里 EXECUTOR_HONESTY_GUARD 同姿态,不是模块加载时求值):
// 一来运维改 env 重启即生效,二来这三条闸才是真的可被单测覆盖 ——
// 模块加载时求值的开关,测试只能断言「枚举里有这一档」,那正是本仓库反复被坑的「永远绿的规则」。
/** 探路的 limit。skill §1 原文就是「先用核心 2-3 词探路(limit=5)」——这里是那句话的机械执行版。 */
function prefetchLimit(): number {
  return Number(process.env.EVIDENCE_PREFETCH_LIMIT || 5);
}
/** 本轮愿意为预检索多等多久。超时即放弃(不等、不重试、不后台续跑),首 token 延迟有确定上界。 */
function prefetchTimeoutMs(): number {
  return Number(process.env.EVIDENCE_PREFETCH_TIMEOUT_MS || 8000);
}
/**
 * 检索源。**必填** —— `search_papers` 的 source 是 enum('semantic'|'openalex'|'pubmed') 且 Required。
 *
 * 🔴 2026-08-02 实测教训:此前这里**没传 source**,上游恒回
 *    `MCP error -32602: ... "source" Required` ⇒ 预检索**从上线第一天起 100% 失败**,
 *    而当时日志只写「upstream_error」不写原因,谁也不知道。P1 的「让正确的路更便宜」主路径
 *    实际一直是死的,V2/V3 指标还会因此被压向「改造无效」的反向结论。
 *    补详细日志(query_chars + upstream 正文)才把它挖出来 —— 「失败要对 journal 大声」不是空话。
 *
 * 默认 semantic:与仓库既有的换源顺序 stc→olx→pmd 一致(semantic=Graph 是主源)。
 * 对外品牌名映射见 parse.ts 的 SOURCE_BRAND;**这个原码绝不进模型可见文本**。
 */
function prefetchSource(): string {
  return process.env.EVIDENCE_PREFETCH_SOURCE || "semantic";
}

/** 运维急停阀:免 rebuild 关掉整条路径。 */
function prefetchOn(): boolean {
  return (process.env.EXECUTOR_EVIDENCE_PREFETCH ?? "on") !== "off";
}

const NOTE_HEAD = "【平台预检索 · 引擎自动执行,不是你调用的工具】";
/** 中文零命中的解释:与 sanitizeMinicod.COVERAGE_NOTE 同口径,只出现对外品牌名(商务硬约束)。 */
const CJK_COVERAGE_HINT =
  "该检索式里含中文,而平台三源(Graph / Discovery / Medicine)都是国际英文学术库、不含知网 CNKI / 万方 / 维普," +
  "中文直搜命中率本来就低 —— 优先转成英文学术术语重搜,并如实向用户披露这一覆盖限制。";

function hitNote(query: string, delivered: number, newCount: number): string {
  return (
    NOTE_HEAD +
    `\n本轮开始前,平台用检索式「${query}」自动探了一枪(limit=${prefetchLimit()}):送达 ${delivered} 条,` +
    `新入账 ${newCount} 条,已在下方证据账本里。` +
    "\n这是一次未经优化的宽口径探路,不是完整检索;需要更准或更全时请自行调用检索工具收窄、换词、顺引文滚雪球。"
  );
}

// 🔴 零命中的措辞是刻意收窄的。老板原话把它描述成「平台对这个主题没有覆盖」,但**一次宽口径
//    单查询探路支撑不了一个覆盖结论** —— 把它写成覆盖结论,就是我们亲手制造了一条新的谎,
//    正是这轮改造要消灭的东西。所以只陈述可证实的那一句:这一个检索式零命中。
function emptyNote(query: string, hasCjk: boolean): string {
  return (
    NOTE_HEAD +
    `\n本轮开始前,平台用检索式「${query}」自动探了一枪:0 命中,证据账本仍为空。` +
    "\n0 命中只说明**这一个检索式**在平台三源上没有匹配,不等于该主题没有文献;换同义术语、拆短查询、放宽年份再搜。" +
    (hasCjk ? "\n" + CJK_COVERAGE_HINT : "")
  );
}

/**
 * 触发条件的**单一真源**:取证轮 **且** 账本为空。turnLoop 与单测共用这一份判据 ——
 * 写成函数而不是两处 if,是因为这两个条件今天由 Router 的规则顺序耦合着
 * (ledger_grounded 让 evidence ⇒ 账本空),而规则顺序**不是契约**;判据只有一份才不会漂。
 * 账本非空 = 这个会话已经有证据了,再探一枪只是白花钱。
 */
export function shouldPrefetch(phase: "chat" | "evidence", ledgerTotal: number): boolean {
  return phase === "evidence" && ledgerTotal === 0;
}

/** 上游调用的形状(= callMcpTool)。只为单测可注入而抽出,生产恒用默认实现。 */
type ToolCaller = (name: string, args: Record<string, unknown>) => Promise<{ content: unknown; isError: boolean }>;

/**
 * 引擎侧预检索。调用点在 turnLoop 的**第一次 LLM call 之前、digest 构建之前**(顺序错了就白做)。
 * 本函数**永不抛**:任何异常都折成 status:"failed",绝不把一条增益变成新的失败面。
 */
export async function runPrefetch(a: {
  workDir: string;
  /** 本轮 user 消息**原文**(turnLoop append 平台指令之前的那一份)。 */
  userText: string;
  /** 本轮真实发给模型的工具名(已过控制面 denylist + MCP 白名单)。 */
  toolNames: readonly string[];
  /** 会话内轮序,只作账本展示(ledger 内部会再做一次单调化)。 */
  turn: number;
  sessionId?: string;
  /** 单测注入用;生产不传 = callMcpTool。 */
  callTool?: ToolCaller;
}): Promise<PrefetchOutcome> {
  if (!prefetchOn()) return { status: "off", note: "" };
  if (!a.toolNames.includes(PREFETCH_TOOL)) return { status: "unavailable", note: "" };

  const q = buildPrefetchQuery(a.userText);
  if (!q) return { status: "no_query", note: "" };

  const started = Date.now();
  const limit = prefetchLimit();
  const deadlineMs = prefetchTimeoutMs();
  let content: unknown;
  try {
    // 超时只作用于**本轮等待**:放弃后不 ingest 那份迟到的结果 —— 让它悄悄写进账本会与下一轮的
    // queries 基线打架,把 research_state 的「本轮检索 N 次」变成一个不可复现的数字。
    const call = (a.callTool ?? callMcpTool)(PREFETCH_TOOL, {
      query: q.query,
      limit,
      source: prefetchSource(), // 必填 enum;漏传 = 上游 -32602,整条预检索静默失效(见 prefetchSource 注释)
    });
    call.catch(() => undefined); // 放弃后仍要吞掉 rejection,否则是 unhandled
    const res = await Promise.race([
      call,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`prefetch timed out after ${deadlineMs}ms`)), deadlineMs),
      ),
    ]);
    if (res.isError) {
      // 上游工具级错误(含熔断快速失败)。**不入账**:错误正文不是题录。
      // 🔴 必须把上游的错误正文带进日志:2026-08-02 首次真实会话里这条命中了(47ms upstream_error),
      //    而当时日志只说"失败"不说"为什么",无法判断是检索式问题、参数问题还是熔断 ——
      //    预检索是 P1 主路径,它静默失败等于整条改造在生产上不生效而我们看不见。
      //    对**模型**仍然静默(告诉它平台故障只会引它向用户复述内部错误),对 journal 大声。
      log.warn("evidence_prefetch", {
        session_id: a.sessionId, status: "failed", reason: "upstream_error", query: q.query,
        query_chars: q.query.length,
        upstream: JSON.stringify(res.content ?? "").slice(0, 400),
        ms: Date.now() - started,
      });
      return { status: "failed", query: q.query, note: "" };
    }
    content = res.content;
  } catch (e) {
    log.warn("evidence_prefetch", {
      session_id: a.sessionId, status: "failed", reason: "call_failed", query: q.query,
      ms: Date.now() - started, err: String((e as Error)?.message ?? e),
    });
    return { status: "failed", query: q.query, note: "" };
  }

  try {
    // 走**同一个咽喉点**(ledger.ingest):去重键、E 编号分配、queries 流水、INDEX.md 全部与模型自己
    // 调工具时完全一致 —— 账本只有一个 writer(终稿否决清单 #13:不许各写一份台账)。
    // args 里的 _by 只落 queries.jsonl 供审计;渲染层 queryText 只读 query/q/keywords/… ⇒ 不进模型视野。
    const row = await ingest(a.workDir, a.turn, PREFETCH_TOOL, { query: q.query, limit, _by: "engine_prefetch" }, content);
    const delivered = row.delivered;
    // 再解析一次拿标识符(必补 C)。刻意**不**改 ingest 的返回形状去顺带吐 DOI:
    // 那是账本的咽喉点,被三条路径共用,为一个观测需求扩它的契约会波及所有调用点。
    // 这里重解析的成本是一次 limit≤10 的纯内存 parse,与"改公共契约"的代价不在一个量级。
    const papers = parsePapersFromToolResult(content);
    log.info("evidence_prefetch", {
      session_id: a.sessionId, status: delivered > 0 ? "hit" : "empty", kind: q.kind,
      query: q.query, delivered, new: row.new_ids.length, dup: row.dup_ids.length,
      ms: Date.now() - started,
    });
    if (delivered === 0) {
      return { status: "empty", query: q.query, delivered: 0, newIds: [], note: emptyNote(q.query, q.hasCjk) };
    }
    return {
      status: "hit", query: q.query, delivered, newIds: row.new_ids,
      // 2026-08 指标必补 C:把这一枪拿到的**标识符**带出去,供 turnLoop 发 evidence_appended 帧进 journal。
      // 🔴 为什么非带不可:预检索**刻意不走 runTools**(走它要手搓 tool_use 进 history = 伪造模型的动作),
      //    因此它一帧 tool_result 都不产生。而 journal 侧算「接地率」正是拿正文里的 DOI 去比对
      //    EvToolResult 的内容 ⇒ 预检索拿到的**真论文**会被判成模型编造的,方向单一地把北极星压低。
      //    账本里有它们(同一个 ingest 咽喉点),但账本是容器内的文件,SQL 看不见。
      dois: dedupeStrings(papers.map((p) => p.doi)),
      paperIds: dedupeStrings(papers.map((p) => p.paperId)),
      note: hitNote(q.query, delivered, row.new_ids.length),
    };
  } catch (e) {
    log.warn("evidence_prefetch", {
      session_id: a.sessionId, status: "failed", reason: "ingest_failed", query: q.query,
      err: String((e as Error)?.message ?? e),
    });
    return { status: "failed", query: q.query, note: "" };
  }
}
