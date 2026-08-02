// ============================================================================
// tool_choice provider 支持度探针 —— 2026-08 证据账本 P0-d(终稿 §五 P0-d / §七 拍板项 1)
// ----------------------------------------------------------------------------
// 这是**一次性诊断工具,不是生产代码路径**:不被 src/index.ts 引用、不被 bun test 收集
// (文件名非 *.test.ts)、不改任何现有文件。与 src/harness/conformance.ts 同级同性质。
//
// 【它回答什么】
// 终稿 §二层二复核结论:`tool_choice` 在 agent/src 全目录命中 0 处 —— turnLoop.ts:324 的
// client.messages.stream() 不带该字段,openai/adapter.ts:280 的 body 里也没有通路。
// ⇒ 每一轮「直接回答」在 API 层都是合法且零成本的采样动作,这是「配了工具却不用」的 API 层根因。
// P1 要用分阶段 tool_choice 让 end_turn 在取证相**不是可采样的分支**。
// 本探针先回答前置问题:**线上这些 provider 到底支不支持?**
//
// 【判据(三分,不是二分)】—— 这是本探针最重要的设计决定
//   ① rejected  上游 4xx 明确拒收 tool_choice           → 不支持,但**诚实**
//   ② ignored   上游 200 却当没看见,照常出文本/end_turn → 不支持,且**假装支持**
//   ③ honored   上游真的被迫产出 tool_call              → 支持
// ② 比 ① 危险得多:它会让「evidence 相不可能 end_turn」这条不变量在代码里存在、在运行时不存在,
// 也就是仓内被坑过的那个模式 ——「一条永远绿的规则」和「一条不存在的规则」等价。
// 因此 ignored 在报告里必须比 rejected 更响,且**同样判 FAIL**。
//
// 【怎么跑】见 docs/tool-choice-probe-2026-08.md。三种模式:
//   bun run src/harness/toolChoiceProbe.ts --selftest    # 零网络:自检分类器(CI 可跑)
//   bun run src/harness/toolChoiceProbe.ts --dry-run     # 零网络:打印将要发出的请求体
//   bun run src/harness/toolChoiceProbe.ts --run --md /tmp/probe.md   # 真发请求
//
// 【花钱声明】--run 每个模型至多 6 发、max_tokens=256、prompt < 400 token。12 个模型满跑
// 约 72 发 ≈ 不到 0.05 元。默认 --dry-run,必须显式 --run 才会联网。
// ============================================================================

import { chatCompletionsURL } from "../openai/adapter.ts";

// ────────────────────────────────────────────────────────────────────────────
// 0 · 目标清单(可离线:env > 文件 > 内置快照)
// ────────────────────────────────────────────────────────────────────────────

export type ApiFormat = "anthropic" | "openai";

export interface ProbeTarget {
  /** 上游真实 model id(agent_models.model_id) */
  model: string;
  /** 展示名(agent_models.display_name),只用于报告 */
  label?: string;
  /** agent_models.provider_id;0 = 默认 provider(走 agent_config 那一行) */
  providerId: number;
  /** agent_providers.name,或默认 provider 的 "scholay-managed" */
  providerName: string;
  /** agent_providers.base_url,或 agent_config.base_url */
  baseUrl: string;
  /** agent_providers.api_format;默认 provider 恒为 anthropic */
  apiFormat: ApiFormat;
  /** 明文 key;缺省时从 env PROBE_KEY_P<providerId> 读 */
  apiKey?: string;
}

/**
 * 内置快照 —— 2026-08-01 从本机 dev 库 agent_models ⨝ agent_providers ⨝ agent_config 实测导出。
 * **不含任何 key**(key 一律从 env PROBE_KEY_P<providerId> 注入)。
 * 这份快照存在的唯一理由是「离线也能跑」;线上口径请用 docs 里的 SQL 现导 targets.json,
 * 快照会随目录变更而过期 —— 报告会把 source=snapshot 打出来,别把过期快照的结果当线上结论。
 */
export const SNAPSHOT_TARGETS: ProbeTarget[] = [
  // provider_id=0 · 默认 provider(agent_config)· Anthropic Messages 协议 —— 线上主力
  { model: "deepseek-v4-pro", label: "DeepSeek V4 Pro", providerId: 0, providerName: "scholay-managed", baseUrl: "https://api.deepseek.com/anthropic", apiFormat: "anthropic" },
  { model: "deepseek-v4-flash", label: "DeepSeek V4 Flash", providerId: 0, providerName: "scholay-managed", baseUrl: "https://api.deepseek.com/anthropic", apiFormat: "anthropic" },
  // provider_id=6 · DashScope(百炼)· OpenAI 兼容
  { model: "qwen3.7-max", label: "Qwen3.7 Max", providerId: 6, providerName: "dashscope", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", apiFormat: "openai" },
  { model: "qwen3.7-plus", label: "Qwen3.7 Plus", providerId: 6, providerName: "dashscope", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", apiFormat: "openai" },
  { model: "qwen3.7-flash", label: "Qwen3.7 Flash", providerId: 6, providerName: "dashscope", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", apiFormat: "openai" },
  { model: "qwen3.6-flash", label: "Qwen3.6 Flash", providerId: 6, providerName: "dashscope", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", apiFormat: "openai" },
  // provider_id=7 · 智谱 GLM · OpenAI 兼容(注意 base_url 是 /v4,chatCompletionsURL 已处理)
  { model: "glm-5.2", label: "GLM-5.2", providerId: 7, providerName: "glm", baseUrl: "https://open.bigmodel.cn/api/paas/v4", apiFormat: "openai" },
  { model: "glm-4.7-flashx", label: "GLM-4.7-FlashX", providerId: 7, providerName: "glm", baseUrl: "https://open.bigmodel.cn/api/paas/v4", apiFormat: "openai" },
  { model: "glm-5v-turbo", label: "GLM-5V-Turbo", providerId: 7, providerName: "glm", baseUrl: "https://open.bigmodel.cn/api/paas/v4", apiFormat: "openai" },
  // provider_id=8 · MiniMax · OpenAI 兼容
  { model: "MiniMax-M3", label: "MiniMax M3", providerId: 8, providerName: "minimax", baseUrl: "https://api.minimaxi.com/v1", apiFormat: "openai" },
  { model: "MiniMax-M2.7", label: "MiniMax M2.7", providerId: 8, providerName: "minimax", baseUrl: "https://api.minimaxi.com/v1", apiFormat: "openai" },
  { model: "MiniMax-M2.7-highspeed", label: "MiniMax M2.7 Highspeed", providerId: 8, providerName: "minimax", baseUrl: "https://api.minimaxi.com/v1", apiFormat: "openai" },
];

/** 决策闸只认这两个:终稿 §五「若线上主力(deepseek-v4-flash/pro)支持 → 纳入 P0」。 */
export const GATE_MODELS = ["deepseek-v4-flash", "deepseek-v4-pro"];

export function loadTargets(env: Record<string, string | undefined>): { targets: ProbeTarget[]; source: string } {
  const inline = env.TOOL_CHOICE_PROBE_TARGETS;
  if (inline && inline.trim()) return { targets: parseTargets(inline, "env:TOOL_CHOICE_PROBE_TARGETS"), source: "env" };
  const file = env.TOOL_CHOICE_PROBE_FILE;
  if (file && file.trim()) {
    const raw = require("node:fs").readFileSync(file, "utf8") as string;
    return { targets: parseTargets(raw, `file:${file}`), source: `file:${file}` };
  }
  return { targets: SNAPSHOT_TARGETS, source: "snapshot(2026-08-01, 可能已过期)" };
}

function parseTargets(raw: string, where: string): ProbeTarget[] {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch (e) {
    throw new Error(`${where}: 不是合法 JSON — ${String((e as Error).message)}`);
  }
  // 容忍 mysql --json / JSON_ARRAYAGG 包一层的形态
  const arr = Array.isArray(v) ? v : (v as { targets?: unknown }).targets;
  if (!Array.isArray(arr)) throw new Error(`${where}: 期望 JSON 数组(或 {targets:[...]})`);
  return arr.map((x, i) => {
    const o = x as Record<string, unknown>;
    const model = String(o.model ?? o.model_id ?? "");
    const baseUrl = String(o.baseUrl ?? o.base_url ?? "");
    if (!model || !baseUrl) throw new Error(`${where}[${i}]: 缺 model / baseUrl`);
    const fmt = String(o.apiFormat ?? o.api_format ?? "anthropic");
    return {
      model,
      label: o.label ? String(o.label) : o.display_name ? String(o.display_name) : undefined,
      providerId: Number(o.providerId ?? o.provider_id ?? 0),
      providerName: String(o.providerName ?? o.provider_name ?? "scholay-managed"),
      baseUrl,
      apiFormat: fmt === "openai" ? "openai" : "anthropic",
      apiKey: o.apiKey ? String(o.apiKey) : o.api_key ? String(o.api_key) : undefined,
    } satisfies ProbeTarget;
  });
}

export function resolveKey(t: ProbeTarget, env: Record<string, string | undefined>): string {
  if (t.apiKey && t.apiKey.trim()) return t.apiKey.trim();
  return (env[`PROBE_KEY_P${t.providerId}`] ?? "").trim();
}

// ────────────────────────────────────────────────────────────────────────────
// 1 · 探针工具定义(两个,让「强制具名」有意义)
// ────────────────────────────────────────────────────────────────────────────

const TOOL_SEARCH = {
  name: "probe_search",
  description: "Search academic papers by keyword. Use this to retrieve evidence before answering.",
  input_schema: {
    type: "object",
    properties: { query: { type: "string", description: "search keyword" } },
    required: ["query"],
  },
} as const;

const TOOL_FINISH = {
  name: "probe_finish",
  description: "Declare that evidence gathering is complete and the answer can be written.",
  input_schema: {
    type: "object",
    properties: { reason: { type: "string", description: "why gathering is complete" } },
    required: ["reason"],
  },
} as const;

type ProbeTool = { name: string; description: string; input_schema: Record<string, unknown> };
const BOTH_TOOLS: ProbeTool[] = [TOOL_SEARCH as unknown as ProbeTool, TOOL_FINISH as unknown as ProbeTool];
const ONE_TOOL: ProbeTool[] = [TOOL_SEARCH as unknown as ProbeTool];

// ⚠️【判别力的全部所在,改这两行前先读完这段】
// 2026-08-01 首跑踩到的坑:初版用「注意力机制是谁提出的?」当问句 —— DeepSeek 在 **auto 基线下
// 就已经调了 probe_search**。于是 force_any 同样返回 tool_call 这件事**什么都没证明**:
// 无法区分「上游真的执行了强制」和「上游把 tool_choice 当没看见、模型碰巧自己想调」。
// 那正是本探针要防的「假绿」—— 一条永远绿的规则 = 一条不存在的规则。
//
// 修法:问句必须是**调工具明显荒谬**的那种,让 auto 基线可靠地落在零工具。
//   auto 零工具 + force_any 有工具  ⇒ 强制**确实生效**(判别成立)
//   auto 有工具                     ⇒ 该对照失效,本轮结论 INCONCLUSIVE(不许当 PASS)
// 另一条独立且更强的判据是 force_named:它强制的是**模型本来不会选的那个**工具
// (probe_finish),honored 即自证生效,不依赖基线。两条只要有一条成立即判别成立。
const USER_Q_CHAT = "请只回复两个汉字:好的。不要调用任何工具,不要做别的事。";
// round2 专用:已经有一条 tool_result 在上下文里,自然续写就是直接出文本答案(auto_round2 量它),
// 强制态则必须再出一个 tool_call —— 这是「evidence 相第 2 轮起强制还成不成立」的判别对照。
const USER_Q_EVIDENCE = "深度学习里的注意力机制是谁提出的?根据已检索到的资料一句话回答。";

// ────────────────────────────────────────────────────────────────────────────
// 2 · 用例矩阵
// ────────────────────────────────────────────────────────────────────────────

export type CaseId =
  | "auto"           // 基线①:今天生产的形状(不带 tool_choice)。零工具是判别力的前提
  | "force_any"      // 核心:anthropic {type:"any"} / openai "required"
  | "force_any_1x"   // 同上 + 禁并行(anthropic disable_parallel_tool_use / openai parallel_tool_calls:false)
  | "force_any_nothink" // 同 force_any + 关思考模式。DeepSeek/Qwen 的拒收话术都点名 thinking mode,
                        // 这一发回答「是彻底没有,还是关掉思考就有」—— 决定了 P1 还有没有牌可打
  | "force_named"    // 强制具名(强制模型本不会选的 probe_finish)—— 不依赖基线的独立判据
  | "seed_r1"        // round2 的第 1 轮:证据向问句 + 两工具 + 不强制。**只为拿真实历史**,不参与裁决
  | "auto_round2"    // 基线②:带真实 tool_result 历史、不强制 → 量「自然续写是不是文本」
  | "force_round2"   // 带真实历史再强制:evidence 相第 2 轮起强制还成不成立
  | "stream_any";    // force_any 的流式形态(生产真实形状;查空 content / 迟到 name / 无 finish_reason)

export const ALL_CASES: CaseId[] = ["auto", "force_any", "force_any_1x", "force_any_nothink", "force_named", "seed_r1", "auto_round2", "force_round2", "stream_any"];

/**
 * 关思考模式的旋钮 —— **各家方言不同,这里刻意两个都带上**。
 * anthropic 道:DeepSeek 文档的 `thinking:{type:"disabled"}`。
 * openai 道:DashScope 用 `enable_thinking:false`,智谱用 `thinking:{type:"disabled"}` —— 同发,
 * 谁认谁生效;若某端点对未知参数 400,那本身就是这一发要报的结论(会如实记成 rejected 并附报文)。
 */
function thinkingOffFields(fmt: ApiFormat): Record<string, unknown> {
  return fmt === "anthropic"
    ? { thinking: { type: "disabled" } }
    : { enable_thinking: false, thinking: { type: "disabled" } };
}

/** Anthropic Messages 端点:baseUrl 可能已含 /v1,规则与 chatCompletionsURL 同构。 */
export function messagesURL(baseUrl: string): string {
  const b = baseUrl.replace(/\/+$/, "");
  if (b.endsWith("/messages")) return b;
  return /\/v\d+$/.test(b) ? `${b}/messages` : `${b}/v1/messages`;
}

/**
 * round2 的历史。**必须来自真实的 round-1 回包,不能手搓** —— 2026-08-01 首跑的教训:
 * 手搓一条只含 tool_use 的 assistant 消息喂 DeepSeek 的 Anthropic 端点,得到
 * 400「The `content[].thinking` in the thinking mode must be passed back to the API.」。
 * 那**不是**生产缺陷(turnLoop.ts:592 是 `messages.push({role:"assistant", content: msg.content})`,
 * 把含 thinking+signature 的 content 原样回放),而是探针自造的假故障。
 * 假故障比没数据更坏,故改成:先真跑一轮 seed,把上游回包**逐字**当历史送回去。
 */
export interface Round2History {
  /** 上游 round-1 的 assistant 消息(anthropic: content 数组;openai: message 对象),逐字回放 */
  assistant: unknown;
  /**
   * round-1 里**全部** tool_use / tool_call 的 id —— 必须每个都配一条 tool_result。
   * ⚠️ 2026-08-01 第二次踩坑:只回一条时 deepseek-v4-flash 返 400
   * 「`tool_use` ids were found without `tool_result` blocks immediately after」
   * (flash 的 seed 轮一次并行发了 2 个 tool_use)。这同样是探针自造的假故障。
   */
  toolIds: string[];
  /** 合成的工具结果正文 */
  resultText: string;
}

const PLACEHOLDER_HISTORY: Round2History = {
  assistant: "<dry-run 占位;--run 时此处是真实 round-1 回包>",
  toolIds: ["probe_tu_1"],
  resultText: "1. Bahdanau et al. 2014. 2. Vaswani et al. 2017.",
};

/** 构造请求(纯函数,--dry-run 与 --run 共用同一份,保证「打印的就是发出的」)。 */
export function buildRequest(t: ProbeTarget, c: CaseId, hist?: Round2History): { url: string; body: Record<string, unknown> } {
  const stream = c === "stream_any";
  const round2 = c === "force_round2" || c === "auto_round2";
  const evidenceQ = round2 || c === "seed_r1";
  const h = round2 ? (hist ?? PLACEHOLDER_HISTORY) : null;
  const tools = c === "force_named" || evidenceQ ? BOTH_TOOLS : ONE_TOOL;

  if (t.apiFormat === "anthropic") {
    const messages: Record<string, unknown>[] = [{ role: "user", content: evidenceQ ? USER_Q_EVIDENCE : USER_Q_CHAT }];
    if (h) {
      messages.push(
        { role: "assistant", content: h.assistant },
        // 每个 tool_use 都要有对应 tool_result(并行轮 = 多条),否则 Anthropic 协议层 400。
        { role: "user", content: h.toolIds.map((id) => ({ type: "tool_result", tool_use_id: id, content: h.resultText })) },
      );
    }
    const tc: Record<string, unknown> | undefined =
      c === "auto" || c === "auto_round2" || c === "seed_r1" ? undefined
      : c === "force_named" ? { type: "tool", name: "probe_finish" }
      : c === "force_any_1x" ? { type: "any", disable_parallel_tool_use: true }
      : { type: "any" };
    return {
      url: messagesURL(t.baseUrl),
      body: {
        model: t.model,
        max_tokens: 256,
        messages,
        tools,
        ...(tc ? { tool_choice: tc } : {}),
        ...(c === "force_any_nothink" ? thinkingOffFields("anthropic") : {}),
        ...(stream ? { stream: true } : {}),
      },
    };
  }

  // openai 兼容
  const messages: Record<string, unknown>[] = [{ role: "user", content: evidenceQ ? USER_Q_EVIDENCE : USER_Q_CHAT }];
  if (h) {
    messages.push(
      // assistant 逐字回放上游给的 message 对象(含 reasoning_content 等方言字段 —— 是否该回传是
      // provider.reasoningReplay 的生产开关,探针不替它做决定,原样送回最贴近上游自己的期望)。
      (h.assistant && typeof h.assistant === "object" ? (h.assistant as Record<string, unknown>) : { role: "assistant", content: String(h.assistant) }),
      // 并行 tool_calls → 逐个 role:tool(与 adapter.ts:104-110 的逐块转换同形)
      ...h.toolIds.map((id) => ({ role: "tool", tool_call_id: id, content: h.resultText })),
    );
  }
  const tc: unknown =
    c === "auto" || c === "auto_round2" || c === "seed_r1" ? undefined
    : c === "force_named" ? { type: "function", function: { name: "probe_finish" } }
    : "required";
  return {
    url: chatCompletionsURL(t.baseUrl),
    body: {
      model: t.model,
      max_tokens: 256,
      messages,
      tools: tools.map((x) => ({ type: "function", function: { name: x.name, description: x.description, parameters: x.input_schema } })),
      ...(tc !== undefined ? { tool_choice: tc } : {}),
      ...(c === "force_any_1x" ? { parallel_tool_calls: false } : {}),
      ...(c === "force_any_nothink" ? thinkingOffFields("openai") : {}),
      ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 3 · 分类器(纯函数 —— --selftest 就是在验它)
// ────────────────────────────────────────────────────────────────────────────

export type Outcome =
  | "honored"          // 真的产出了 tool_call
  | "rejected"         // 4xx 明确拒收(诚实的不支持)
  | "ignored_text"     // 200 但零 tool_call、有文本 → 静默无视 tool_choice(假装支持)
  | "ignored_empty"    // 200 但零 tool_call、零文本 → 更糟:adapter 会当断流抛错
  | "wrong_tool"       // 强制具名却调了别的工具
  | "transport_error"; // 连接层失败

export interface CaseResult {
  case: CaseId;
  outcome: Outcome;
  httpStatus: number;
  toolCalls: string[];      // 调到的工具名(按序)
  parallel: boolean;        // toolCalls.length > 1
  argsParsed: boolean;      // 全部 tool 参数是合法 JSON
  textLen: number;
  stopReason: string;       // anthropic stop_reason / openai finish_reason;流式无终帧 → "<none>"
  detail: string;           // 上游报文摘录(截断 + 脱敏)
  elapsedMs: number;
}

export interface ParsedResponse {
  httpStatus: number;
  /** 4xx/5xx 时的报文原文,或流式收尾的诊断串 */
  raw: string;
  toolCalls: { name: string; args: string }[];
  text: string;
  stopReason: string | null;
  /** round2 链式回放用:上游 assistant 消息逐字原件(anthropic=content 数组 / openai=message 对象) */
  rawAssistant?: unknown;
  /** **全部** tool_use / tool_call 的 id(链式回放时每个都要有 tool_result) */
  toolIds?: string[];
}

/** 上游报文 → Outcome。分类逻辑与协议无关,两条道共用。 */
export function classify(c: CaseId, r: ParsedResponse): Outcome {
  if (r.httpStatus === 0) return "transport_error";
  if (r.httpStatus < 200 || r.httpStatus >= 300) return "rejected";
  if (r.toolCalls.length > 0) {
    if (c === "force_named" && !r.toolCalls.every((t) => t.name === "probe_finish")) return "wrong_tool";
    return "honored";
  }
  // 200 且零工具:auto 用例这属正常基线(它本来就不该被强制),但仍按同一套标签记录,
  // 由报告层区分「基线的零工具」和「强制态的零工具」。
  return r.text.trim().length > 0 ? "ignored_text" : "ignored_empty";
}

/**
 * 单个 target 的用例集 → 决策闸裁决。
 *
 * INCONCLUSIVE 是刻意存在的第四态:上游 200 且出了 tool_call,但**证不出**是强制起的作用
 * (基线 auto 本来就调工具 且 force_named 没能独立自证)。这种情况**绝不许当 PASS** ——
 * 把「没证出来」记成「通过」正是本仓库被坑过的假绿模式。
 */
export type Verdict = "PASS" | "PASS_WITH_CAVEAT" | "INCONCLUSIVE" | "FAIL";
export interface TargetVerdict {
  verdict: Verdict;
  reasons: string[];
  /** 强制态是否被静默无视 —— 报告里必须比 rejected 更响 */
  silentlyIgnored: boolean;
}

export function verdictFor(results: CaseResult[]): TargetVerdict {
  const by = new Map<CaseId, CaseResult>();
  for (const r of results) by.set(r.case, r);
  const reasons: string[] = [];
  let silentlyIgnored = false;

  const auto = by.get("auto");
  const any = by.get("force_any");
  const named = by.get("force_named");
  const a2 = by.get("auto_round2");
  const r2 = by.get("force_round2");

  if (!any) return { verdict: "FAIL", reasons: ["force_any 未执行"], silentlyIgnored: false };

  // 关思考模式那一发的结论,无论主判据成败都要带出来 —— 它决定 P1 还有没有牌可打。
  const nothink = by.get("force_any_nothink");
  const nothinkNote = !nothink
    ? []
    : nothink.outcome === "honored"
      ? ["🔑 但**关掉思考模式后强制态可用** —— 存在一条「牺牲推理换可编排」的路。是否走由产品拍板(代价:主力模型失去 reasoning),探针不替它决定。"]
      : [`关思考模式后仍不可用(${nothink.outcome},HTTP ${nothink.httpStatus})${nothink.detail ? ":" + nothink.detail : ""} —— 这条退路也不通。`];

  if (any.outcome === "transport_error") return { verdict: "FAIL", reasons: [`force_any 连接失败:${any.detail}`, ...nothinkNote], silentlyIgnored: false };
  if (any.outcome === "rejected") {
    return { verdict: "FAIL", reasons: [`上游拒收 tool_choice(HTTP ${any.httpStatus}):${any.detail}`, ...nothinkNote], silentlyIgnored: false };
  }
  if (any.outcome === "ignored_text" || any.outcome === "ignored_empty") {
    silentlyIgnored = true;
    reasons.push(
      `🔴 强制态被**静默无视**(HTTP 200 / 零 tool_call / stop=${any.stopReason})。` +
        `这比 4xx 更危险:阶段编排会在代码里存在、在运行时不存在 —— 即仓内被坑过的「一条永远绿的规则」。`,
    );
    if (any.outcome === "ignored_empty") {
      reasons.push("且返回空 content:走 openai/adapter.ts:419 的「无 finish_reason 且零工具零正文」分支会直接抛错(整轮报错)。");
    }
    reasons.push(...nothinkNote);
    return { verdict: "FAIL", reasons, silentlyIgnored };
  }

  // honored —— 但 200 + 有 tool_call ≠ 强制生效。先问判别力从哪来。
  let v: Verdict = "PASS";
  const autoCalledTool = !!auto && auto.toolCalls.length > 0;
  const namedProves = named?.outcome === "honored"; // 强制了模型本不会选的工具 → 自证,不依赖基线
  const anyProves = !!auto && !autoCalledTool && any.outcome === "honored"; // 基线零工具 → 对照成立
  if (!namedProves && !anyProves) {
    const why = !auto
      ? "未跑 auto 基线,且 force_named 未自证"
      : autoCalledTool
        ? `auto 基线本身就调了工具(${auto.toolCalls.join("/")}),force_any 出 tool_call 无法区分「强制生效」与「上游静默无视 + 模型碰巧想调」;force_named 亦未自证`
        : "force_named 未自证且 auto 基线不可用";
    return {
      verdict: "INCONCLUSIVE",
      reasons: [
        `⚠️ **判别力不足,不予通过**:${why}。`,
        "重跑建议:换一个「调工具明显荒谬」的问句让 auto 稳定落在零工具,或单独重跑 `--cases force_named`(强制 probe_finish 是不依赖基线的独立判据)。",
        "🔴 此处**不许**回落成 PASS —— 把「没证出来」记成「通过」就是本仓库被坑过的假绿模式。",
      ],
      silentlyIgnored: false,
    };
  }
  reasons.push(
    namedProves
      ? "判别力来源:force_named 强制了模型本不会选的 `probe_finish` 并成功 —— 不依赖基线的自证。"
      : "判别力来源:auto 基线零工具 × force_any 出 tool_call 的对照。",
  );
  if (any.parallel) {
    v = "PASS_WITH_CAVEAT";
    reasons.push(`force_any 一次返回 ${any.toolCalls.length} 个 tool_call(仅定义了 1 个工具)→ 强制并行;阶段编排需配合禁并行参数。`);
    const oneX = by.get("force_any_1x");
    if (oneX) {
      reasons.push(
        oneX.parallel
          ? "🔴 禁并行参数无效(force_any_1x 仍多发)—— 并行不可关。"
          : "禁并行参数有效(force_any_1x 收敛到 1 发)。",
      );
      if (oneX.parallel) v = "FAIL";
    }
  }
  if (!any.argsParsed) {
    v = "FAIL";
    reasons.push("tool 参数不是合法 JSON(assembleToolUse 会吞成 input={},生产里表现为缺参工具轮 → 道歉轮)。");
  }
  if (named) {
    if (named.outcome === "wrong_tool") {
      v = "FAIL";
      reasons.push(`强制具名失败:要求 probe_finish,实际调 ${named.toolCalls.join("/")}。P1 阶段机的「钉到 ResearchPhase」不可用。`);
    } else if (named.outcome !== "honored") {
      v = v === "FAIL" ? "FAIL" : "PASS_WITH_CAVEAT";
      reasons.push(`强制具名不可用(${named.outcome},HTTP ${named.httpStatus}):${named.detail}`);
    }
  }
  if (r2) {
    if (r2.outcome === "rejected" || r2.outcome === "transport_error") {
      v = "FAIL";
      reasons.push(`带 tool_result 历史时强制态失败(${r2.outcome},HTTP ${r2.httpStatus}):${r2.detail} —— evidence 相第 2 轮起就会崩。`);
    } else if (r2.outcome === "ignored_text" || r2.outcome === "ignored_empty") {
      // 第 2 轮起被静默无视 = evidence 相在有证据之后就漏气,与首轮同等严重。
      v = "FAIL";
      silentlyIgnored = true;
      reasons.push(`🔴 带 tool_result 历史时强制态被**静默无视**(${r2.outcome},stop=${r2.stopReason})—— evidence 相只有第 1 轮有效,第 2 轮起 end_turn 又变回可采样分支。`);
    } else if (r2.outcome === "honored") {
      const a2Text = a2 ? a2.toolCalls.length === 0 : false;
      if (a2 && !a2Text) {
        reasons.push(`注:auto_round2 基线也调了工具(${a2.toolCalls.join("/")}),故 round2 这一对照本身判别力有限,仅作参考。`);
      }
      if (!r2.toolCalls.includes("probe_finish")) {
        v = v === "FAIL" ? "FAIL" : "PASS_WITH_CAVEAT";
        reasons.push("带证据后仍只调检索工具、不选退出工具 —— evidence 相需要引擎侧轮预算强制前进(终稿 §三 3.3 已按此设计,非阻塞)。");
      }
    }
  }
  const st = by.get("stream_any");
  if (st) {
    if (st.outcome !== any.outcome) {
      v = v === "FAIL" ? "FAIL" : "PASS_WITH_CAVEAT";
      reasons.push(`🔴 流式与非流式结论不一致(stream=${st.outcome} vs 非流=${any.outcome})—— 生产走的是流式(turnLoop:324 client.messages.stream),以流式为准。`);
    }
    if (st.outcome === "honored" && st.toolCalls.some((n) => n === "<unnamed>")) {
      v = v === "FAIL" ? "FAIL" : "PASS_WITH_CAVEAT";
      reasons.push("流式下 tool name 迟到/缺失(adapter.ts:393 有补名分支,但 tool_use_complete 帧会先带空名下发前端)。");
    }
    if (st.outcome === "honored" && !st.argsParsed) {
      v = "FAIL";
      reasons.push("流式下 tool 参数分片拼不成合法 JSON(adapter.ts:453 会抛 `tool arguments truncated by upstream`,整轮报错)。");
    }
    if (st.stopReason === "<none>") reasons.push("⚠️ 流式无 finish_reason/stop_reason 终帧:adapter.ts:419 的断流判定分支会被触发。");
  }
  return { verdict: v, reasons, silentlyIgnored };
}

// ────────────────────────────────────────────────────────────────────────────
// 4 · 报文解析(两协议各一,非流式 + 流式)
// ────────────────────────────────────────────────────────────────────────────

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

export function parseAnthropicJSON(status: number, bodyText: string): ParsedResponse {
  if (status < 200 || status >= 300) return { httpStatus: status, raw: bodyText, toolCalls: [], text: "", stopReason: null };
  let j: unknown;
  try { j = JSON.parse(bodyText); } catch { return { httpStatus: status, raw: bodyText, toolCalls: [], text: "", stopReason: null }; }
  const o = asRecord(j);
  const content = Array.isArray(o.content) ? (o.content as unknown[]) : [];
  const toolCalls: { name: string; args: string }[] = [];
  let text = "";
  const toolIds: string[] = [];
  for (const b of content) {
    const blk = asRecord(b);
    if (blk.type === "tool_use") {
      toolCalls.push({ name: String(blk.name ?? ""), args: JSON.stringify(blk.input ?? {}) });
      toolIds.push(String(blk.id ?? ""));
    } else if (blk.type === "text") text += String(blk.text ?? "");
  }
  return { httpStatus: status, raw: bodyText, toolCalls, text, stopReason: o.stop_reason == null ? null : String(o.stop_reason), rawAssistant: content, toolIds };
}

export function parseOpenAIJSON(status: number, bodyText: string): ParsedResponse {
  if (status < 200 || status >= 300) return { httpStatus: status, raw: bodyText, toolCalls: [], text: "", stopReason: null };
  let j: unknown;
  try { j = JSON.parse(bodyText); } catch { return { httpStatus: status, raw: bodyText, toolCalls: [], text: "", stopReason: null }; }
  const choice = asRecord(asRecord(j).choices instanceof Array ? (asRecord(j).choices as unknown[])[0] : undefined);
  const msg = asRecord(choice.message);
  const raw = Array.isArray(msg.tool_calls) ? (msg.tool_calls as unknown[]) : [];
  const toolCalls = raw.map((t) => {
    const fn = asRecord(asRecord(t).function);
    return { name: String(fn.name ?? ""), args: String(fn.arguments ?? "") };
  });
  return {
    httpStatus: status,
    raw: bodyText,
    toolCalls,
    text: typeof msg.content === "string" ? msg.content : "",
    stopReason: choice.finish_reason == null ? null : String(choice.finish_reason),
    rawAssistant: msg,
    toolIds: raw.map((t) => String(asRecord(t).id ?? "")),
  };
}

/**
 * 流式解析 —— 刻意复刻 openai/adapter.ts 的状态机形状(按 tool_calls[i].index 聚合、name 可能迟到、
 * arguments 分片拼接),这样「流式下 tool_choice 是否可用」的结论对生产是可迁移的。
 * Anthropic SSE 形态另走一条:content_block_start(tool_use) + input_json_delta。
 */
export function parseSSE(fmt: ApiFormat, status: number, sse: string): ParsedResponse {
  if (status < 200 || status >= 300) return { httpStatus: status, raw: sse, toolCalls: [], text: "", stopReason: null };
  let text = "";
  let stop: string | null = null;
  const byIdx = new Map<number, { name: string; args: string }>();
  for (const line of sse.split("\n")) {
    const s = line.trim();
    if (!s.startsWith("data:")) continue;
    const d = s.slice(5).trim();
    if (!d || d === "[DONE]") continue;
    let ev: unknown;
    try { ev = JSON.parse(d); } catch { continue; }
    const o = asRecord(ev);
    if (fmt === "openai") {
      const choices = Array.isArray(o.choices) ? (o.choices as unknown[]) : [];
      const ch = asRecord(choices[0]);
      if (ch.finish_reason != null) stop = String(ch.finish_reason);
      const delta = asRecord(ch.delta);
      if (typeof delta.content === "string") text += delta.content;
      const tcs = Array.isArray(delta.tool_calls) ? (delta.tool_calls as unknown[]) : [];
      for (const t of tcs) {
        const tr = asRecord(t);
        const i = typeof tr.index === "number" ? tr.index : 0;
        const cur = byIdx.get(i) ?? { name: "", args: "" };
        const fn = asRecord(tr.function);
        if (fn.name) cur.name = String(fn.name);
        if (typeof fn.arguments === "string") cur.args += fn.arguments;
        byIdx.set(i, cur);
      }
    } else {
      const type = String(o.type ?? "");
      if (type === "content_block_start") {
        const cb = asRecord(o.content_block);
        const i = typeof o.index === "number" ? o.index : 0;
        if (cb.type === "tool_use") byIdx.set(i, { name: String(cb.name ?? ""), args: "" });
      } else if (type === "content_block_delta") {
        const dl = asRecord(o.delta);
        const i = typeof o.index === "number" ? o.index : 0;
        if (dl.type === "input_json_delta") {
          const cur = byIdx.get(i) ?? { name: "", args: "" };
          cur.args += String(dl.partial_json ?? "");
          byIdx.set(i, cur);
        } else if (dl.type === "text_delta") text += String(dl.text ?? "");
      } else if (type === "message_delta") {
        const dl = asRecord(o.delta);
        if (dl.stop_reason != null) stop = String(dl.stop_reason);
      }
    }
  }
  return { httpStatus: status, raw: sse.slice(0, 4000), toolCalls: [...byIdx.values()], text, stopReason: stop };
}

// ────────────────────────────────────────────────────────────────────────────
// 5 · 执行
// ────────────────────────────────────────────────────────────────────────────

const REDACT = /(sk-[A-Za-z0-9_\-]{6,}|Bearer\s+[A-Za-z0-9._\-]{6,}|"api_?key"\s*:\s*"[^"]+")/gi;
export function redact(s: string): string {
  return s.replace(REDACT, "***redacted***");
}
function excerpt(s: string, n = 400): string {
  const one = redact(s).replace(/\s+/g, " ").trim();
  return one.length > n ? one.slice(0, n) + "…" : one;
}

function headersFor(t: ProbeTarget, key: string): Record<string, string> {
  if (t.apiFormat === "anthropic") {
    // 与生产同形:anthropic/client.ts 同时传 authToken(→ Authorization)与 apiKey(→ x-api-key)。
    return {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    };
  }
  return { "content-type": "application/json", authorization: `Bearer ${key}` };
}

/** 原始一发(不分类),供 seed 与 runCase 共用。 */
async function post(t: ProbeTarget, key: string, c: CaseId, timeoutMs: number, hist?: Round2History): Promise<ParsedResponse> {
  const { url, body } = buildRequest(t, c, hist);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { method: "POST", headers: headersFor(t, key), body: JSON.stringify(body), signal: ac.signal });
    const txt = await resp.text();
    return c === "stream_any" && resp.status >= 200 && resp.status < 300
      ? parseSSE(t.apiFormat, resp.status, txt)
      : t.apiFormat === "anthropic"
        ? parseAnthropicJSON(resp.status, txt)
        : parseOpenAIJSON(resp.status, txt);
  } catch (e) {
    return { httpStatus: 0, raw: String((e as Error)?.message ?? e), toolCalls: [], text: "", stopReason: null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * round2 的 seed:真跑一轮「不带 tool_choice + 证据向问句 + 两个工具」,把上游回包逐字留作历史。
 * 拿不到 tool_use 就没有 round2 的前提(而不是硬造一个)—— 返回 null,上层显式跳过并说明理由。
 */
export async function seedRound2(t: ProbeTarget, key: string, timeoutMs: number): Promise<{ hist: Round2History | null; why: string; probe: CaseResult }> {
  const t0 = Date.now();
  const r = await post(t, key, "seed_r1", timeoutMs);
  const probe: CaseResult = {
    case: "seed_r1", outcome: classify("seed_r1", r), httpStatus: r.httpStatus,
    toolCalls: r.toolCalls.map((x) => x.name || "<unnamed>"), parallel: r.toolCalls.length > 1,
    argsParsed: true, textLen: r.text.length, stopReason: r.stopReason ?? "<none>",
    detail: r.httpStatus >= 200 && r.httpStatus < 300 ? "" : excerpt(r.raw), elapsedMs: Date.now() - t0,
  };
  if (r.httpStatus < 200 || r.httpStatus >= 300) return { hist: null, why: `seed 轮失败(HTTP ${r.httpStatus}):${excerpt(r.raw, 200)}`, probe };
  const ids = (r.toolIds ?? []).filter(Boolean);
  if (ids.length === 0 || r.toolCalls.length === 0) {
    return { hist: null, why: "seed 轮上游没调工具 → 无 tool_result 历史可造,round2 无前提(**不硬造**:手搓历史会制造假故障)", probe };
  }
  return {
    hist: { assistant: r.rawAssistant, toolIds: ids, resultText: "1. Bahdanau et al. 2014, Neural Machine Translation by Jointly Learning to Align and Translate. 2. Vaswani et al. 2017, Attention Is All You Need." },
    why: "",
    probe,
  };
}

async function runCase(t: ProbeTarget, key: string, c: CaseId, timeoutMs: number, hist?: Round2History): Promise<CaseResult> {
  const t0 = Date.now();
  const parsed = await post(t, key, c, timeoutMs, hist);
  const outcome = classify(c, parsed);
  const argsParsed = parsed.toolCalls.every((x) => {
    if (!x.args) return true;
    try { JSON.parse(x.args); return true; } catch { return false; }
  });
  return {
    case: c,
    outcome,
    httpStatus: parsed.httpStatus,
    toolCalls: parsed.toolCalls.map((x) => x.name || "<unnamed>"),
    parallel: parsed.toolCalls.length > 1,
    argsParsed,
    textLen: parsed.text.length,
    stopReason: parsed.stopReason ?? "<none>",
    detail: outcome === "honored" ? "" : excerpt(parsed.raw),
    elapsedMs: Date.now() - t0,
  };
}

export interface TargetReport {
  target: ProbeTarget;
  skipped?: string;
  results: CaseResult[];
  verdict: TargetVerdict;
  /** round2 组因拿不到真实历史而整组跳过时的理由(显式记录,不静默略过) */
  seedNote?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// 6 · 报告渲染
// ────────────────────────────────────────────────────────────────────────────

const OUTCOME_ICON: Record<Outcome, string> = {
  honored: "✅ honored",
  rejected: "⛔ rejected(诚实的不支持)",
  ignored_text: "🔴 ignored(静默无视 · 有正文)",
  ignored_empty: "🔴🔴 ignored(静默无视 · 空 content)",
  wrong_tool: "⚠️ wrong_tool",
  transport_error: "💥 transport_error",
};

export function renderMarkdown(reports: TargetReport[], meta: { source: string; startedAt: string; mode: string }): string {
  const L: string[] = [];
  L.push(`# tool_choice provider 支持度探针 · 实测结果`);
  L.push("");
  L.push(`> 2026-08 证据账本 P0-d(终稿 §五 P0-d / §七 拍板项 1)。生成:${meta.startedAt} · 模式:${meta.mode} · 目标来源:${meta.source}`);
  L.push("");

  const gate = reports.filter((r) => GATE_MODELS.includes(r.target.model));
  // 闸只认真正证出来的:INCONCLUSIVE 与 FAIL 同样不放行。
  const gatePass = gate.length > 0 && gate.every((r) => !r.skipped && (r.verdict.verdict === "PASS" || r.verdict.verdict === "PASS_WITH_CAVEAT"));
  const gateInconclusive = gate.some((r) => r.verdict.verdict === "INCONCLUSIVE");
  L.push(`## 决策闸`);
  L.push("");
  if (gate.length === 0) {
    L.push(`**⚠️ 未测到主力模型(${GATE_MODELS.join(" / ")}),闸未裁决。**`);
  } else if (!gatePass && gateInconclusive) {
    L.push(`**⚠️ 闸未裁决(INCONCLUSIVE)** —— 请求没被拒,但**证不出强制真的生效**(见逐模型明细的判别力说明)。`);
    L.push("");
    L.push(`按未通过处理:在拿到判别性证据前,round-0 tool_choice **不进 P0**。`);
    L.push(`🔴 不许把 INCONCLUSIVE 记成 PASS —— 那会让「evidence 相不可能 end_turn」这条不变量在代码里存在、在运行时不存在。`);
  } else if (gatePass) {
    L.push(`**✅ 闸通过** —— 主力模型支持 tool_choice ⇒ smart_search round-0 强制取证**纳入 P0**(改动 ~15 行:openai/adapter.ts:280 透传 + turnLoop.ts:324 传参;anthropic 道由 SDK 直接透传)。`);
  } else {
    L.push(`**⛔ 闸未通过** —— 主力模型不支持 ⇒ round-0 tool_choice **顺延 P1**,并在 admin 模型目录页对这些行标注「不支持阶段编排」。`);
    L.push("");
    L.push(`🔴 **不做「软形态强制」**(吞掉 end_turn 再重发):那是最坏的一种 guard。宁可缺失也不假装启用。`);
  }
  L.push("");

  L.push(`## 汇总`);
  L.push("");
  L.push(`| 模型 | provider | 协议 | auto 基线 | force_any | 关思考后 | force_named | round2 | stream | 裁决 |`);
  L.push(`|---|---|---|---|---|---|---|---|---|---|`);
  for (const r of reports) {
    const g = (c: CaseId) => {
      const x = r.results.find((y) => y.case === c);
      if (!x) return "—";
      return x.outcome === "honored" ? `✅×${x.toolCalls.length}` : x.outcome === "rejected" ? `⛔${x.httpStatus}` : x.outcome === "wrong_tool" ? "⚠️" : x.outcome === "transport_error" ? "💥" : "🔴";
    };
    // auto 基线的语义是反的:零工具才是「对照可用」,出工具反而削弱判别力 → 单独一列单独的符号。
    const autoCell = (() => {
      const x = r.results.find((y) => y.case === "auto");
      if (!x) return "—";
      if (x.outcome === "rejected" || x.outcome === "transport_error") return `💥${x.httpStatus}`;
      return x.toolCalls.length === 0 ? "零工具(对照可用)" : `⚠️自发调×${x.toolCalls.length}`;
    })();
    const v = r.skipped
      ? `⏭ ${r.skipped}`
      : r.verdict.verdict === "PASS" ? "✅ PASS"
      : r.verdict.verdict === "PASS_WITH_CAVEAT" ? "🟡 CAVEAT"
      : r.verdict.verdict === "INCONCLUSIVE" ? "⚪ INCONCLUSIVE"
      : "⛔ FAIL";
    L.push(`| \`${r.target.model}\` | ${r.target.providerName}(#${r.target.providerId}) | ${r.target.apiFormat} | ${autoCell} | ${g("force_any")} | ${g("force_any_nothink")} | ${g("force_named")} | ${g("force_round2")} | ${g("stream_any")} | ${v} |`);
  }
  L.push("");

  L.push(`## 逐模型明细`);
  for (const r of reports) {
    L.push("");
    L.push(`### \`${r.target.model}\`${r.target.label ? ` · ${r.target.label}` : ""}`);
    L.push("");
    L.push(`- provider:${r.target.providerName}(id=${r.target.providerId})· 协议:${r.target.apiFormat} · endpoint:\`${r.target.apiFormat === "anthropic" ? messagesURL(r.target.baseUrl) : chatCompletionsURL(r.target.baseUrl)}\``);
    if (r.skipped) {
      L.push(`- ⏭ **跳过**:${r.skipped}`);
      continue;
    }
    L.push(`- 裁决:**${r.verdict.verdict}**${r.verdict.silentlyIgnored ? " · 🔴 强制态被静默无视" : ""}`);
    for (const why of r.verdict.reasons) L.push(`  - ${why}`);
    if (r.seedNote) L.push(`  - ⏭ round2 组未执行:${r.seedNote}`);
    L.push("");
    L.push(`| case | 结果 | HTTP | tool_calls | stop | text | ms | 报文摘录 |`);
    L.push(`|---|---|---|---|---|---|---|---|`);
    for (const x of r.results) {
      L.push(
        `| \`${x.case}\` | ${OUTCOME_ICON[x.outcome]} | ${x.httpStatus} | ${x.toolCalls.length ? x.toolCalls.join(", ") : "—"}${x.toolCalls.length && !x.argsParsed ? " ⚠️参数非法JSON" : ""} | ${x.stopReason} | ${x.textLen} | ${x.elapsedMs} | ${x.detail ? "`" + x.detail.replace(/\|/g, "\\|") + "`" : ""} |`,
      );
    }
  }
  L.push("");
  L.push(`---`);
  L.push("");
  L.push(`探针源码:\`agent/src/harness/toolChoiceProbe.ts\`(非生产代码路径)· 用法与已知资料:\`docs/tool-choice-probe-2026-08.md\``);
  return L.join("\n");
}

// ────────────────────────────────────────────────────────────────────────────
// 7 · 自检(零网络;--selftest 跑它。分类器是本探针的全部结论所系,必须可离线验)
// ────────────────────────────────────────────────────────────────────────────

interface SelfCase { name: string; got: unknown; want: unknown }

export function selftest(): { pass: number; fail: SelfCase[] } {
  const cs: SelfCase[] = [];
  const eq = (name: string, got: unknown, want: unknown) => cs.push({ name, got, want });

  // ── URL 推导(GLM 的 /v4 与 DeepSeek 的 /anthropic 两个真实坑)
  eq("messagesURL /anthropic", messagesURL("https://api.deepseek.com/anthropic"), "https://api.deepseek.com/anthropic/v1/messages");
  eq("messagesURL /v1", messagesURL("https://x.y/v1"), "https://x.y/v1/messages");
  eq("messagesURL 已完整", messagesURL("https://x.y/v1/messages"), "https://x.y/v1/messages");
  eq("chatCompletionsURL /v4(GLM)", chatCompletionsURL("https://open.bigmodel.cn/api/paas/v4"), "https://open.bigmodel.cn/api/paas/v4/chat/completions");

  // ── 请求体形状
  const aAny = buildRequest(SNAPSHOT_TARGETS[0]!, "force_any");
  eq("anthropic force_any 用 {type:any}", JSON.stringify(aAny.body.tool_choice), '{"type":"any"}');
  const a1x = buildRequest(SNAPSHOT_TARGETS[0]!, "force_any_1x");
  eq("anthropic 禁并行", JSON.stringify(a1x.body.tool_choice), '{"type":"any","disable_parallel_tool_use":true}');
  const aAuto = buildRequest(SNAPSHOT_TARGETS[0]!, "auto");
  eq("auto 基线不带 tool_choice", "tool_choice" in aAuto.body, false);
  const oTarget = SNAPSHOT_TARGETS.find((t) => t.apiFormat === "openai")!;
  eq("openai force_any 用 required", buildRequest(oTarget, "force_any").body.tool_choice, "required");
  eq("openai 禁并行用 parallel_tool_calls", buildRequest(oTarget, "force_any_1x").body.parallel_tool_calls, false);
  eq("nothink(anthropic)带 thinking disabled", JSON.stringify(buildRequest(SNAPSHOT_TARGETS[0]!, "force_any_nothink").body.thinking), '{"type":"disabled"}');
  eq("nothink 仍是强制态", JSON.stringify(buildRequest(SNAPSHOT_TARGETS[0]!, "force_any_nothink").body.tool_choice), '{"type":"any"}');
  eq("nothink(openai)带 enable_thinking:false", buildRequest(oTarget, "force_any_nothink").body.enable_thinking, false);
  eq("force_any 不带 thinking 字段(对照纯净)", "thinking" in buildRequest(SNAPSHOT_TARGETS[0]!, "force_any").body, false);
  eq("force_named 定义两个工具", (buildRequest(SNAPSHOT_TARGETS[0]!, "force_named").body.tools as unknown[]).length, 2);
  eq("round2 带 tool_result 历史", (buildRequest(SNAPSHOT_TARGETS[0]!, "force_round2").body.messages as unknown[]).length, 3);
  eq("auto_round2 也带历史但不强制", "tool_choice" in buildRequest(SNAPSHOT_TARGETS[0]!, "auto_round2").body, false);
  eq("auto_round2 历史长度同 force_round2", (buildRequest(SNAPSHOT_TARGETS[0]!, "auto_round2").body.messages as unknown[]).length, 3);
  eq("openai auto_round2 不带 tool_choice", "tool_choice" in buildRequest(oTarget, "auto_round2").body, false);
  eq("seed_r1 是单轮无历史", (buildRequest(SNAPSHOT_TARGETS[0]!, "seed_r1").body.messages as unknown[]).length, 1);
  eq("seed_r1 不带 tool_choice", "tool_choice" in buildRequest(SNAPSHOT_TARGETS[0]!, "seed_r1").body, false);
  eq("seed_r1 给两个工具(让 round2 有退出工具可选)", (buildRequest(SNAPSHOT_TARGETS[0]!, "seed_r1").body.tools as unknown[]).length, 2);
  eq("seed_r1 与 round2 同问句(历史才接得上)",
    JSON.stringify((buildRequest(SNAPSHOT_TARGETS[0]!, "seed_r1").body.messages as unknown[])[0]) ===
      JSON.stringify((buildRequest(SNAPSHOT_TARGETS[0]!, "force_round2").body.messages as unknown[])[0]), true);
  // 🔴 round2 必须逐字回放真实 round-1 回包(手搓历史 → DeepSeek 400 thinking-replay 假故障)
  const realHist: Round2History = { assistant: [{ type: "thinking", thinking: "…", signature: "sig" }, { type: "tool_use", id: "tu_real", name: "probe_search", input: {} }], toolIds: ["tu_real"], resultText: "R" };
  const r2body = buildRequest(SNAPSHOT_TARGETS[0]!, "force_round2", realHist).body;
  eq("round2 逐字回放 assistant(含 thinking)", JSON.stringify((r2body.messages as Record<string, unknown>[])[1]?.content), JSON.stringify(realHist.assistant));
  eq("round2 tool_result 对上真实 id", JSON.stringify((r2body.messages as Record<string, unknown>[])[2]?.content), '[{"type":"tool_result","tool_use_id":"tu_real","content":"R"}]');
  // 🔴 并行 seed:每个 tool_use 都必须配一条 tool_result(少一条 → deepseek-v4-flash 400)
  const parHist: Round2History = { assistant: [{ type: "tool_use", id: "a" }, { type: "tool_use", id: "b" }], toolIds: ["a", "b"], resultText: "R" };
  eq("并行历史 → 两条 tool_result",
    JSON.stringify((buildRequest(SNAPSHOT_TARGETS[0]!, "force_round2", parHist).body.messages as Record<string, unknown>[])[2]?.content),
    '[{"type":"tool_result","tool_use_id":"a","content":"R"},{"type":"tool_result","tool_use_id":"b","content":"R"}]');
  const oaHist: Round2History = { assistant: { role: "assistant", content: null, tool_calls: [{ id: "c9" }, { id: "c10" }] }, toolIds: ["c9", "c10"], resultText: "R" };
  const oaMsgs = buildRequest(oTarget, "force_round2", oaHist).body.messages as unknown[];
  eq("openai round2 逐字回放 message 对象", JSON.stringify(oaMsgs[1]), JSON.stringify(oaHist.assistant));
  eq("openai 并行历史 → 两条 role:tool", oaMsgs.length, 4);
  // 解析器要收全 id(不是只收第一个)
  eq("anthropic 解析收全 toolIds",
    JSON.stringify(parseAnthropicJSON(200, JSON.stringify({ content: [{ type: "tool_use", id: "x1", name: "a" }, { type: "tool_use", id: "x2", name: "a" }] })).toolIds),
    '["x1","x2"]');
  // 判别力的物理前提:auto/force_any 用的必须是「调工具明显荒谬」那句,round2 用的是另一句。
  eq(
    "auto 与 force_any 同问句(对照有效)",
    JSON.stringify((buildRequest(SNAPSHOT_TARGETS[0]!, "auto").body.messages as unknown[])[0]) ===
      JSON.stringify((buildRequest(SNAPSHOT_TARGETS[0]!, "force_any").body.messages as unknown[])[0]),
    true,
  );
  eq(
    "round2 换用证据向问句",
    JSON.stringify((buildRequest(SNAPSHOT_TARGETS[0]!, "force_round2").body.messages as unknown[])[0]) !==
      JSON.stringify((buildRequest(SNAPSHOT_TARGETS[0]!, "auto").body.messages as unknown[])[0]),
    true,
  );

  // ── 解析器
  const oaTool = parseOpenAIJSON(200, JSON.stringify({ choices: [{ finish_reason: "tool_calls", message: { content: "", tool_calls: [{ id: "1", function: { name: "probe_search", arguments: '{"query":"a"}' } }] } }] }));
  eq("openai 解析 tool_call", oaTool.toolCalls.map((x) => x.name).join(), "probe_search");
  const oaText = parseOpenAIJSON(200, JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "Bahdanau 2014。" } }] }));
  eq("openai 解析纯文本", oaText.toolCalls.length, 0);
  const anTool = parseAnthropicJSON(200, JSON.stringify({ stop_reason: "tool_use", content: [{ type: "tool_use", name: "probe_finish", input: {} }] }));
  eq("anthropic 解析 tool_use", anTool.toolCalls.map((x) => x.name).join(), "probe_finish");
  const sse = [
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"probe_search","arguments":"{\\"que"}}]}}]}',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"ry\\":\\"a\\"}"}}]}}]}',
    'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}',
    "data: [DONE]",
  ].join("\n");
  const sseP = parseSSE("openai", 200, sse);
  eq("SSE 分片聚合 name", sseP.toolCalls[0]?.name, "probe_search");
  eq("SSE 分片聚合 args", sseP.toolCalls[0]?.args, '{"query":"a"}');
  eq("SSE finish_reason", sseP.stopReason, "tool_calls");
  const anSSE = [
    'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","name":"probe_search"}}',
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{}"}}',
    'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}',
  ].join("\n");
  eq("anthropic SSE tool_use", parseSSE("anthropic", 200, anSSE).toolCalls[0]?.name, "probe_search");

  // ── 分类器(三分判据本体)
  eq("400 → rejected", classify("force_any", { httpStatus: 400, raw: "Thinking mode does not support this tool_choice", toolCalls: [], text: "", stopReason: null }), "rejected");
  eq("200+tool → honored", classify("force_any", { httpStatus: 200, raw: "", toolCalls: [{ name: "probe_search", args: "{}" }], text: "", stopReason: "tool_calls" }), "honored");
  eq("200+文本零工具 → ignored_text", classify("force_any", { httpStatus: 200, raw: "", toolCalls: [], text: "是 Bahdanau。", stopReason: "stop" }), "ignored_text");
  eq("200+空 content → ignored_empty", classify("force_any", { httpStatus: 200, raw: "", toolCalls: [], text: "", stopReason: "stop" }), "ignored_empty");
  eq("具名却调错 → wrong_tool", classify("force_named", { httpStatus: 200, raw: "", toolCalls: [{ name: "probe_search", args: "{}" }], text: "", stopReason: "tool_calls" }), "wrong_tool");
  eq("具名调对 → honored", classify("force_named", { httpStatus: 200, raw: "", toolCalls: [{ name: "probe_finish", args: "{}" }], text: "", stopReason: "tool_calls" }), "honored");
  eq("连接失败 → transport_error", classify("force_any", { httpStatus: 0, raw: "ECONNRESET", toolCalls: [], text: "", stopReason: null }), "transport_error");

  // ── 决策闸
  const mk = (c: CaseId, o: Outcome, names: string[] = [], status = 200): CaseResult => ({
    case: c, outcome: o, httpStatus: status, toolCalls: names, parallel: names.length > 1,
    argsParsed: true, textLen: 0, stopReason: "tool_use", detail: "", elapsedMs: 1,
  });
  const autoClean = mk("auto", "ignored_text", []); // 基线零工具 = 对照可用
  const autoDirty = mk("auto", "honored", ["probe_search"]); // 基线自发调工具 = 对照失效
  eq("闸:基线干净 + 全 honored → PASS", verdictFor([autoClean, mk("force_any", "honored", ["probe_search"]), mk("force_named", "honored", ["probe_finish"]), mk("force_round2", "honored", ["probe_finish"])]).verdict, "PASS");
  eq("闸:400 → FAIL", verdictFor([autoClean, mk("force_any", "rejected", [], 400)]).verdict, "FAIL");
  const ig = verdictFor([autoClean, mk("force_any", "ignored_text")]);
  eq("闸:静默无视 → FAIL", ig.verdict, "FAIL");
  eq("闸:静默无视要打旗标", ig.silentlyIgnored, true);
  // 🔴 判别力硬闸:基线自己就调工具 且 force_named 没自证 ⇒ 必须 INCONCLUSIVE,绝不能是 PASS
  eq("闸:基线污染且无具名自证 → INCONCLUSIVE", verdictFor([autoDirty, mk("force_any", "honored", ["probe_search"])]).verdict, "INCONCLUSIVE");
  eq("闸:基线污染但具名自证 → PASS", verdictFor([autoDirty, mk("force_any", "honored", ["probe_search"]), mk("force_named", "honored", ["probe_finish"])]).verdict, "PASS");
  eq("闸:没跑 auto 且无具名自证 → INCONCLUSIVE", verdictFor([mk("force_any", "honored", ["probe_search"])]).verdict, "INCONCLUSIVE");
  eq(
    "闸:强制并行且禁不掉 → FAIL",
    verdictFor([autoClean, mk("force_any", "honored", ["probe_search", "probe_search"]), mk("force_any_1x", "honored", ["probe_search", "probe_search"])]).verdict,
    "FAIL",
  );
  eq(
    "闸:强制并行但可禁 → CAVEAT",
    verdictFor([autoClean, mk("force_any", "honored", ["probe_search", "probe_search"]), mk("force_any_1x", "honored", ["probe_search"])]).verdict,
    "PASS_WITH_CAVEAT",
  );
  eq("闸:具名调错 → FAIL", verdictFor([autoClean, mk("force_any", "honored", ["probe_search"]), mk("force_named", "wrong_tool", ["probe_search"])]).verdict, "FAIL");
  eq(
    "闸:round2 被静默无视 → FAIL",
    verdictFor([autoClean, mk("force_any", "honored", ["probe_search"]), mk("force_round2", "ignored_text")]).verdict,
    "FAIL",
  );
  eq(
    "闸:流式与非流式结论不一致 → 降级",
    verdictFor([autoClean, mk("force_any", "honored", ["probe_search"]), mk("stream_any", "ignored_text")]).verdict,
    "PASS_WITH_CAVEAT",
  );

  // ── 脱敏
  eq("脱敏 sk- key", redact("authorization: Bearer sk-abc123def456"), "authorization: ***redacted***");

  const fail = cs.filter((c) => JSON.stringify(c.got) !== JSON.stringify(c.want));
  return { pass: cs.length - fail.length, fail };
}

// ────────────────────────────────────────────────────────────────────────────
// 8 · CLI
// ────────────────────────────────────────────────────────────────────────────

const USAGE = `
tool_choice provider 支持度探针(2026-08 证据账本 P0-d · 非生产代码)

  bun run src/harness/toolChoiceProbe.ts --selftest
  bun run src/harness/toolChoiceProbe.ts --dry-run [--models a,b] [--cases force_any,...]
  bun run src/harness/toolChoiceProbe.ts --run --md /tmp/tool-choice.md [--models …] [--cases …]

目标来源(优先级递减):
  TOOL_CHOICE_PROBE_TARGETS   内联 JSON 数组
  TOOL_CHOICE_PROBE_FILE      JSON 文件路径(推荐:用 docs 里的 SQL 从 agent_models 现导)
  内置快照                     2026-08-01 dev 库导出,可能过期(报告会标注来源)

密钥:PROBE_KEY_P<providerId>(如 PROBE_KEY_P0 / PROBE_KEY_P6);目标 JSON 里带 apiKey 亦可。
缺 key 的目标会被跳过并在报告里显式列出 —— 绝不静默略过。

其它:--timeout <ms>(默认 60000)· --md <path> 写报告文件(不给则只打 stdout)
`;

function argVal(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) { console.log(USAGE); return 0; }

  if (argv.includes("--selftest")) {
    const r = selftest();
    for (const f of r.fail) console.log(`SELFTEST FAIL  ${f.name}\n  got  = ${JSON.stringify(f.got)}\n  want = ${JSON.stringify(f.want)}`);
    console.log(`SELFTEST ${r.fail.length === 0 ? "OK" : "FAILED"}  ${r.pass} pass / ${r.fail.length} fail`);
    return r.fail.length === 0 ? 0 : 1;
  }

  const env = process.env as Record<string, string | undefined>;
  const { targets: all, source } = loadTargets(env);
  const modelFilter = argVal(argv, "--models")?.split(",").map((s) => s.trim()).filter(Boolean);
  const caseFilter = argVal(argv, "--cases")?.split(",").map((s) => s.trim()).filter(Boolean) as CaseId[] | undefined;
  const targets = modelFilter ? all.filter((t) => modelFilter.includes(t.model)) : all;
  const cases = caseFilter && caseFilter.length ? ALL_CASES.filter((c) => caseFilter.includes(c)) : ALL_CASES;
  const timeout = Number(argVal(argv, "--timeout") ?? 60000);
  const live = argv.includes("--run");

  if (!live) {
    console.log(`[dry-run] 目标来源:${source} · ${targets.length} 个模型 × ${cases.length} 个用例 = ${targets.length * cases.length} 发(未联网)\n`);
    for (const t of targets) {
      const key = resolveKey(t, env);
      console.log(`## ${t.model}  (${t.providerName}#${t.providerId} · ${t.apiFormat}) key=${key ? "present" : "MISSING → 会被跳过"}`);
      for (const c of cases) {
        const { url, body } = buildRequest(t, c);
        console.log(`--- ${c} → POST ${url}`);
        console.log(JSON.stringify(body));
      }
      console.log("");
    }
    console.log(`[dry-run] 加 --run 才会真的发请求。`);
    return 0;
  }

  const reports: TargetReport[] = [];
  for (const t of targets) {
    const key = resolveKey(t, env);
    if (!key) {
      reports.push({ target: t, skipped: `缺密钥(设 PROBE_KEY_P${t.providerId} 或在目标 JSON 里给 apiKey)`, results: [], verdict: { verdict: "FAIL", reasons: ["未执行"], silentlyIgnored: false } });
      console.log(`SKIP  ${t.model}  (no PROBE_KEY_P${t.providerId})`);
      continue;
    }
    const results: CaseResult[] = [];
    const line = (r: CaseResult) =>
      console.log(`PROBE ${t.model.padEnd(24)} ${r.case.padEnd(14)} ${r.outcome.padEnd(16)} http=${r.httpStatus} tools=[${r.toolCalls.join(",")}] stop=${r.stopReason} ${r.elapsedMs}ms ${r.detail ? "| " + r.detail.slice(0, 160) : ""}`);

    // round2 组需要**真实的** round-1 历史 —— 先 seed,拿不到就整组显式跳过(不硬造)。
    const wantsRound2 = cases.includes("auto_round2") || cases.includes("force_round2");
    let hist: Round2History | null = null;
    let seedWhy = "";
    if (wantsRound2) {
      const s = await seedRound2(t, key, timeout);
      hist = s.hist;
      seedWhy = s.why;
      if (cases.includes("seed_r1")) { results.push(s.probe); line(s.probe); }
      if (!hist) console.log(`NOTE  ${t.model}  round2 组跳过:${seedWhy}`);
    }

    for (const c of cases) {
      if (c === "seed_r1") continue; // 已在 seed 阶段执行
      if ((c === "auto_round2" || c === "force_round2") && !hist) continue; // 无前提,显式不跑
      const r = await runCase(t, key, c, timeout, hist ?? undefined);
      results.push(r);
      line(r);
    }
    reports.push({ target: t, results, verdict: verdictFor(results), seedNote: seedWhy || undefined });
  }

  const md = renderMarkdown(reports, { source, startedAt: new Date().toISOString(), mode: "--run" });
  const out = argVal(argv, "--md");
  if (out) {
    require("node:fs").writeFileSync(out, md, "utf8");
    console.log(`\n报告已写入 ${out}`);
  } else {
    console.log("\n" + md);
  }

  const gate = reports.filter((r) => GATE_MODELS.includes(r.target.model));
  const gatePass = gate.length > 0 && gate.every((r) => !r.skipped && (r.verdict.verdict === "PASS" || r.verdict.verdict === "PASS_WITH_CAVEAT"));
  const inconclusive = gate.some((r) => r.verdict.verdict === "INCONCLUSIVE");
  console.log(
    `\nGATE ${
      gate.length === 0 ? "UNDECIDED(主力模型未测)"
      : gatePass ? "PASS(round-0 tool_choice 纳入 P0)"
      : inconclusive ? "INCONCLUSIVE(判别力不足;按未通过处理,不许记成 PASS)"
      : "FAIL(顺延 P1 + admin 标注不支持阶段编排)"
    }`,
  );
  return 0;
}

// 仅在被直接执行时跑(被 import 时只暴露纯函数,便于将来接测试)
if (import.meta.main) {
  main()
    .then((code) => process.exit(code))
    .catch((e) => {
      console.error("PROBE FATAL " + String((e as Error)?.message ?? e));
      process.exit(1);
    });
}
