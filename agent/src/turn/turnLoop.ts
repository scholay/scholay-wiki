// ★ agent loop(详细设计 §2.3)—— 落在 GREEN 探针上。
// while (stop_reason==='tool_use'): stream → emit 中性帧 → 组装 tool_use → 执行 → tool_result → loop。
// 无状态:messages[] 由后端喂。tier→活跃 provider 槽位。provider-agnostic。零 cc-haha 血统。

import type Anthropic from "@anthropic-ai/sdk";
import { anthropicClientFromProvider } from "../anthropic/client.ts";
import { resolveTier } from "../config/models.ts";
import { buildTools } from "../tools/toAnthropicTools.ts";
import { ToolUseAssembler } from "./assembleToolUse.ts";
import { extractStreamingFieldValue, FieldStreamer, streamFieldFor } from "./streamText.ts";
import { runTools } from "./runTools.ts";
import type { EventSink, TurnInput } from "./types.ts";
import { loadAddDirContext } from "../skills/loader.ts";
import { limitLiveImages, stripImageBlocks } from "../server/attachments.ts";
import { buildDateLine } from "../tools/clock.ts";
import { reduceForWindow } from "./compact.ts";
import { snapshotOut, emitArtifacts, diffOut, type OutSnapshot, type ArtifactDecl } from "./artifacts.ts";
import { runDeliveryGate } from "./deliveryGate.ts";
import { ProtocolLeakGuard, stripProtocolMarkers, describeLeak } from "./leakGuard.ts";
import { detectPhantomToolNarration, toolRecordLine } from "./toolRecord.ts";
import {
  auditClaims,
  hasFindings,
  CORRECTIVE_PREFIX,
  type ClaimFindings,
} from "./verifyClaims.ts";
import { buildDigest, loadLedger, stats as ledgerStats, type EvidenceRecord } from "../evidence/ledger.ts";
import { runPrefetch, shouldPrefetch, type PrefetchOutcome } from "../evidence/prefetch.ts";
import {
  classifyResearchTurn,
  DECLARE_INSUFFICIENT_TOOL,
  ORCHESTRATION_TOOLS,
  SUBMIT_ANSWER_TOOL,
} from "../policy/researchTurn.ts";
import { detectLang, langDirective, cjkRatio, explicitLangRequest, hasBoxArt, stripForLangGuard } from "./lang.ts";
import { log } from "../obs/log.ts";

const MAX_TOOL_ROUNDS = Number(process.env.EXECUTOR_MAX_TOOL_ROUNDS || 24);
// 上限(非每次都用满,模型按需 end_turn/tool_use 自然停)。8192 太小:生成大文档时模型把整篇当
// Write 的 content 参数流式输出会撞顶 → stop_reason=max_tokens → 工具未执行 → 前端「已暂停」。
// 调到 64000:turnLoop 用 messages.stream(流式),DeepSeek 在流式下接受大 max_tokens(实测)。
export const MAX_TOKENS = Number(process.env.EXECUTOR_MAX_TOKENS || 64000);

// effectiveOutputCap 本轮实际输出上限 = min(全局 MAX_TOKENS, 模型 maxOutput)(maxOutput 缺省用全局)。
// 压缩墙据此预留输出空间,保证「输入 + 输出 ≤ 上下文」不溢出(与 runTurn 里 maxTokens 口径一致)。
export function effectiveOutputCap(maxOutput?: number | null): number {
  return maxOutput && maxOutput > 0 ? Math.min(MAX_TOKENS, maxOutput) : MAX_TOKENS;
}

// 单轮(一次 runTurn)累计 token 硬闸(input+output,逐 LLM call 累加)。第二层失控保护:
// 轮数上限只挡「工具循环次数」,挡不住「每轮全量重发超长 history」造成的 token 爆炸
// (历史事故:审稿向导单轮 10-17M token)。默认 5M —— 只兜真正失控,正常多轮读稿不受影响。
// 业务每日额度是 user_message 前的前置闸,进入 turn 后无内层闸;此为该缺口的兜底。0 = 关闭。
const MAX_TURN_TOKENS = Number(process.env.EXECUTOR_MAX_TURN_TOKENS || 5_000_000);

// 随请求外发的历史图块上限(P3 遗留补齐):base64 图每轮全量重发,长会话成本线性涨且
// 加剧不稳中转掐大请求。保最近 N 张,更早换占位(history 不动)。0 = 不限制。
const MAX_LIVE_IMAGES = Number(process.env.EXECUTOR_MAX_LIVE_IMAGES || 3);

// 2026-07 线上审计:瞬态流错误(流式 JSON 损坏 / socket 意外断开 / 503 过载)当轮重放的次数与退避。
// 传输层重试,与 DSML round_discarded 重试(内容层)各自独立计数、并存不叠加。
const MAX_TRANSIENT_RETRIES = Number(process.env.EXECUTOR_TRANSIENT_RETRIES ?? 1);
const TRANSIENT_RETRY_DELAY_MS = Number(process.env.EXECUTOR_TRANSIENT_RETRY_MS || 2000);

// budgetDisclosure —— 有界透支预算(SS#2)的「软自控」披露:turn 开始时告诉模型本次大致预算,
// 让它自我配速、接近用尽时主动交付最完整答案(Anthropic Task-Budgets 式)。
// V3-4.1-1:披露含逐轮变化的数字,若放 system 会让**跨轮** system 前缀每轮变 → 打断上游隐式前缀缓存;
// 故改为 append 到本轮 user 消息尾部(历史里冻结不回改,前缀跨轮 byte 稳定)。轮内仍只算一次。
// 2026-07 审计 P1-9:旧文案「配额已接近用尽」被模型改写成"你还有 1 次提问机会"吓付费用户
// (857ba9e6 实锤,用户炸锅"我已经充钱了")。改写为「内部执行参数」口径 + 明令封口:
// 预算是我们主动注入的带内文本,模型泄漏它属于转述被投喂内容 —— 源头收紧措辞即可斩断供词链。
export function budgetDisclosure(tb?: { softRemaining: number; hardRemaining: number }): string {
  if (!tb) return "";
  const seal =
    "注意:这是平台内部的单次执行参数,与用户的会员权益、提问次数、配额完全无关;" +
    "绝不向用户提及、复述或改写成「配额不足/次数用尽/只能再问 N 次」之类的话。" +
    "需要收尾时只说「本次先整理到这里,欢迎继续追问」。";
  if (tb.softRemaining <= 0) {
    return "【内部执行提示 · 严禁向用户转述】内部资源即将见底:请用尽量少的步骤、基于已有信息给出最完整回答并尽快结束。" + seal;
  }
  return `【内部执行提示 · 严禁向用户转述】本次任务的内部预算约 ${tb.softRemaining} token,请据此自行配速:接近用尽时基于已掌握信息给出最完整回答并结束。` + seal;
}
// wind-down「硬但优雅」的收尾指令:到 hardRemaining 时收窄工具 + 注入本指令,
// 模型写完最终答案后自然 end_turn → 正常 message_complete(非硬杀 socket)。
//
// 🔴 2026-08 证据账本 P0:旧版这里是 activeTools = [](清空全部工具)。收尾恰恰是「把已取到的证据
// 引进正文」的时刻,清空工具等于**在最该引账本的一刻只剩训练记忆** —— 这是编造引用的一个结构性诱因。
// 反向化:检索类工具照常清空(不再新增外部消耗),但保留读回本会话已有证据的两个只读工具。
// 2026-08 证据账本 P1:交付契约的两个工具必须**活到收尾轮**,否则取证轮一进 wind-down 就无路交付
// (模型只能硬 end_turn = 又变回今天那条零信号的路)。
const WIND_DOWN_KEEP_TOOLS = new Set(["EvidenceGet", "Read", SUBMIT_ANSWER_TOOL, DECLARE_INSUFFICIENT_TOOL]);
// wind-down 之后还允许的工具轮数:收尾阶段是「翻一次账本再落笔」,不是继续干活。
// 越过后 activeTools 清空 → 模型只能出文本。确定性状态转移,不靠文字劝导。
const WIND_DOWN_TOOL_ROUNDS = Number(process.env.EXECUTOR_WIND_DOWN_TOOL_ROUNDS || 2);
const budgetWindDownDirective =
  "【内部指令 · 收尾】现在起不要再发起任何新的检索或外部调用;只有需要核对本会话已经取到的证据时," +
  "才用 EvidenceGet 读回证据账本、用 Read 读回会话内文件。随后基于已掌握的全部信息给出最完整、可交付的最终回答,然后结束。" +
  "不得向用户提及任何内部预算/配额/次数;如需解释,只说「本次先整理到这里,欢迎继续追问」。";
// ask 收尾指令:模型本轮调用过 AskUserQuestion(问题卡片已呈现给用户)后,下一轮去掉全部工具 +
// 注入本指令 —— 模型只能出文本,写一句简短收尾就自然 end_turn,不阻塞等待。答案作为下一条 user
// 消息开新轮回来(方案 B:优雅终轮,不占并发槽、天然耐断连/多端)。与预算 wind-down 同机制。
// protocolRetryDirective —— DSML 熔断后重打那一轮追加的系统指令。
// 旧行为是**原样重放**同一份请求:线上日志里 `round 9 → round 10`、`round 8 → round 9` 这种
// 「熔断 → 重打 → 又熔断 → 判死」的相邻对反复出现,因为重放没有携带任何「上次错在哪」的信息。
// 这句话不解释协议细节(模型不需要知道 DSML 是什么),只把唯一正确的动作说死:走工具通道。
const protocolRetryDirective =
  "【内部指令 · 协议纠正】你上一次的输出把工具调用写进了正文,导致这次调用没有被执行、本轮已作废。" +
  "现在重做这一轮:需要调用工具时**只能**通过工具通道发起(function call)," +
  "绝不要在正文里书写任何形如 <…tool_calls>、<…invoke name=…>、<…parameter…> 的标记或它们的闭合标签," +
  "也不要用文字描述「我调用了某工具、返回了什么」。不要向用户提及本次纠正。";
const askWindDownDirective =
  "【等待用户选择】你刚刚通过 AskUserQuestion 把问题以选项卡片的形式呈现给了用户。现在不要再调用任何工具、不要重复罗列这些选项,用一句自然的话简短收尾(例如「选好之后告诉我,我接着做」)并结束本轮,等待用户在卡片上作答。用户的选择会作为下一条消息发给你,届时你再继续。";

// AskUserQuestion 工具名(与 tools/registry.ts 一致)。turnLoop 据此在提问后触发 ask 收尾。
const ASK_USER_QUESTION_TOOL = "AskUserQuestion";

// ── 2026-08 证据账本 P1 · 交付契约(SubmitAnswer / DeclareInsufficient)的编排侧常量 ──────
// INSUFFICIENT_BANNER:DeclareInsufficient 成功后由**引擎**发出的用户可见横幅,位置在模型正文之前。
// 与今天「模型自己写一句『未经检索验证』」的差别是所有权:这句话不由模型产出,它压不掉、改不写。
const INSUFFICIENT_BANNER =
  "> ⚠️ **证据不足(平台自动标注)**:本轮未取得平台检索证据,以下内容基于模型自身知识,未经文献核验。\n\n";
// 交付正文的分片大小:一次性发一个巨帧对下游(hub/journal/前端 fold)不友好,切片也让长答案有流式观感。
const DELIVER_CHUNK = 800;
// history 里 tool_use.input.answer 的占位:正文已作为 assistant 文本块入 history,不留等长副本。
const SUBMITTED_PLACEHOLDER = "[已作为本轮回答交付给用户]";

// langLine —— 语言纪律(静态串,保 prompt cache):中文平台默认中文;**思考过程(thinking)同样受约束**
// (owner 反馈:thinking 时中时英观感割裂)。2026-07 审计 P1-7:旧文案把「跟随消息语言」与「跟随记忆
// 偏好」并列且无优先级,1dca5f82 的整份老挝语交付正是记忆偏好压过了当条中文消息 —— 改为显式排序;
// 动态的按轮语言行(lang.ts langDirective)随 user 消息注入,本静态串保底。
const langLine =
  "语言:默认使用中文 —— 你的思考过程与最终回复都用中文书写。" +
  "优先级:用户当条消息中的明确语言要求 > 用户当条消息本身的语言 > 长期记忆中的语言偏好 > 默认中文。" +
  "记忆里的语言偏好只在当条消息看不出语言倾向时才使用,绝不能压过用户当条消息的语言。" +
  "代码、命令、专业术语、文献标题与直接引语保持原文,不翻译。";

// attachLine —— 附件约定(静态串,保 prompt cache):backend hub 把用户上传的附件折成 user 消息
// 开头的 @"绝对路径" 标记(2026-07-14 断链修复)。没有这行,模型对着标记只能靠猜(实测 deepseek
// 会 Glob 自救,但依赖用户口头提示)。回复中不要复读该标记(前端已把它渲染成附件卡片)。
// 2026-07 文件上传调研落地:旧版这段教「PDF/Office 用 Bash 转」——完全没提 ReadDocument(7-15 新增),
// 对无 Bash 的 feature 字面上教模型直接放弃。现按真实工具矩阵重写:ReadDocument 全 feature 可用。
const attachLine =
  '附件约定:用户消息开头形如 @"/绝对路径" 的标记表示该轮上传到会话工作目录的附件文件,标记后紧跟用户正文。' +
  "**图片附件(png/jpg 等)已直接随消息呈现给你**:直接观察图片作答,绝不要对图片路径调用 Read/ReadDocument" +
  "(消息里没有随附图像时,说明当前模型不支持识图,如实告知用户并建议切换支持视觉的模型)。" +
  "文本类附件(txt/md/csv/代码等)用 Read 读取;PDF 与 Office 文档(docx/xlsx/pptx/odt/rtf/epub)用 " +
  "ReadDocument 工具提取文本(长 PDF 传 first_pages 限页;xlsx 每个工作表一张表,pptx 按幻灯片分节)。" +
  "需要对表格数据做统计/画图/精读特定 sheet 且本会话提供 Bash 工具时,可用 python(openpyxl/pandas)处理。" +
  "读取失败或格式不支持(如旧版 doc/xls/ppt)时如实告知用户并建议另存为 docx/xlsx/pptx 再传,绝不凭空编造文件内容。" +
  "回复中引用附件用其文件名,不要复读整段路径标记。";

// toolFailLine —— 工具失败纪律(静态串,保 prompt cache;2026-07 审计 P1-12/P1-13):失败点的
// tool_result 带内指令是主防线(紧贴生成点),本行兜「失败发生在多轮之前、模型后续又提起」的场景。
// 系统级注入覆盖四个 feature,不可被会话 prompt 覆盖。
const toolFailLine =
  "工具失败纪律:工具执行失败时,错误文本(含路径、环境变量、沙箱/运维词汇、修复指引)只供你内部调整策略," +
  "严禁向用户复述错误原文或任何内部环境细节。向用户只说三件事:哪一步没有成功、对本次结果的影响、" +
  "你接下来改用什么办法(或需要用户提供什么)。严禁向用户虚构不存在的补救方法" +
  "(例如声称「用 Word 直接打开 .md 会自动保留格式」——这是错误的);不确定的补救办法就不要说。";

// runTurn 返回本轮结束后的完整 messages[](含 assistant + tool_result),供 WS 层做会话续接。
// 注:这是「会话内 history」的内存承载;耐久真源在后端事件溯源 journal(执行器跨重启无状态)。
export async function runTurn(
  input: TurnInput,
  sink: EventSink,
  signal?: AbortSignal,
): Promise<Anthropic.MessageParam[]> {
  // 具体 model id 覆盖优先(peerreview 按轮切模型);否则 tier→活跃 provider 槽位
  const model = (input.modelOverride && input.modelOverride.trim()) || resolveTier(input.tier);
  if (!model) {
    sink.error("no active provider/model (awaiting PushConfig)", "config");
    return input.messages;
  }
  const client = anthropicClientFromProvider(input.providerName);
  // max_tokens = min(全局上限, 模型完成窗):目录 max_output 未配置(0/缺失)时用全局值;
  // 上游仍拒绝时 openai adapter 会按 400 报文钳制重试(零配置兜底),anthropic 系暂无该自愈。
  const maxTokens = effectiveOutputCap(input.maxOutput);
  const allTools = await buildTools(input);
  // 2026-08 证据账本 P1:交付契约的两个工具(SubmitAnswer / DeclareInsufficient)**不进默认工具面**。
  // 闸判据是 ledger.count>0 —— 账本非空时它恒开,那种轮次上摆出来就是一条永远绿的规则(本仓库
  // 被这个模式坑过)。只有 Router 判为取证轮时才把它们放进 tools[](见下方 research)。
  // 控制面仍是权威:feature 若在 DisallowedTools 里禁掉它们,buildTools 这里就已经没有了。
  const tools = allTools.filter((t) => !ORCHESTRATION_TOOLS.has(t.name));
  const messages: Anthropic.MessageParam[] = [...input.messages];
  // 成果交付(产物即带外声明):turn 开头 snapshot ./out/ 作基线,finally diff 出本 turn 新增/变更
  // 的产物 → 发 artifact 帧(工具无关,覆盖 Write/Edit/ExportDocument/Bash/Python)。./out/ 不存在
  // 时为空快照,零帧(smart_search 等无产物 feature 自然无影响)。
  let outBaseline: OutSnapshot | null = null;
  try {
    outBaseline = await snapshotOut(input.workDir);
  } catch {
    outBaseline = null;
  }
  // 2026-08 证据账本 P0-c:带外过程可视化的基线。turn 末发 research_state 帧,让**引擎数出来的**
  // 检索次数印在模型输出旁边 —— 取消模型对自身过程的叙述垄断(线上实证:正文写「我刚检索过、
  // 来源:Discovery」而该轮 tool_use=0)。
  // 用**基线差值**而不是 QueryRecord.turn:执行器无状态,turn 号是数 user 条数推出来的,
  // window/compact 裁历史时会回退(ledger.ts 已标注该字段只能当近似值)。差值与轮号无关,恒精确。
  // ledgerAtStart 同时是 P1 交付闸的 Router 输入(账本非空 → 闸恒开 → 不摆恒绿的闸)。
  let queriesBaseline = 0;
  let ledgerAtStart = 0;
  try {
    const st0 = await ledgerStats(input.workDir);
    queriesBaseline = st0.queries;
    ledgerAtStart = st0.total;
  } catch {
    queriesBaseline = 0;
    ledgerAtStart = 0;
  }
  // system = 当前日期锚点 + 语言纪律 + 控制面 appendSystemPrompt(规则+记忆)+ per-feature skill/CLAUDE.md(H6)。
  // dateLine 放这里(而非 backend)是刻意的:此处是四个 feature 每轮必经的唯一 system 组装点
  // (peerreview 不走 appendSystemPrompt、prism 建会话绕过 buildCreateOptions,backend 注入必漏),
  // 且每轮现算 → 长寿会话跨天自动更新;天粒度 → prompt cache 每天最多 miss 一次(clock.ts 铁律)。
  // langLine 同理放这里(owner 反馈:思考过程时中时英):静态串不破缓存,四个 feature 全覆盖。
  const skillCtx = loadAddDirContext(input.addDirs ?? []);
  const baseSystem =
    [buildDateLine(), langLine, attachLine, toolFailLine, toolRecordLine, input.appendSystemPrompt, skillCtx]
      .filter((s) => s && s.trim())
      .join("\n\n");
  // 动态语言锁定(P1-7):对本轮 user 消息**原文**(append 任何指令之前)判语言,生成按轮语言行
  // —— 与预算披露同机制注入 user 消息尾部,不进 system、不破 prompt cache。und(弱信号)不注入,
  // 保留记忆偏好通道。expectedLang/lastUserRaw 同时供轮末语言纠偏 guard 与 P1 取证轮 Router 使用。
  const lastUserRaw = (() => {
    if (messages.length === 0) return "";
    const last = messages[messages.length - 1];
    if (last.role !== "user") return "";
    if (typeof last.content === "string") return last.content;
    if (Array.isArray(last.content)) {
      return last.content
        .filter((b): b is Anthropic.TextBlockParam => (b as { type?: string }).type === "text")
        .map((b) => b.text)
        .join("\n");
    }
    return "";
  })();
  const expectedLang = detectLang(lastUserRaw);
  // ── 2026-08 证据账本 P1 · 取证轮 Router(引擎侧有序规则,0 token / 0 延迟 / 无 LLM)──────
  // turn 开始时判一次并冻结:轮内不再重算 —— 工具面中途变形会打断上游隐式前缀缓存,且模型看见
  // 工具凭空出现/消失只会更迷惑。判定结果随 research_state 帧进 journal(误判率的生产探针)。
  const research = classifyResearchTurn({
    userText: lastUserRaw,
    ledgerTotal: ledgerAtStart,
    toolNames: tools.map((t) => t.name),
    interactive: !!input.taskBudget,
  });
  // 本轮的工具面上限:取证轮 = 默认面 + 两个交付工具;闲聊轮 = 默认面(与今天完全一致)。
  const turnTools = research.phase === "evidence" ? allTools : tools;
  if (research.phase === "evidence") {
    log.info("research turn: evidence contract active", {
      session_id: input.sessionId, rule: research.rule, ledger_total: ledgerAtStart,
    });
  }
  // ── 2026-08 证据账本 P1 · 取证型预检索(引擎在模型开口前先跑一次检索)────────────────
  // 出口闸(SubmitAnswer)有个结构缺口:模型硬 end_turn 不调该工具时我们只剩观测。而诊断数据
  // (有工具调用的纪元 DOI 接地率 98% vs 失忆纪元 43%)说的是**证据在场时模型本来就不编** ——
  // 所以最强的干预不是拦住它编,是让它开口时手上就有真东西。这条路径不需要模型配合,
  // 因此不依赖任何 provider 的 tool_choice 支持度(探针实测主力 provider 静默无视)。
  //
  // 🔴 位置铁律:必须在**第一次 LLM call 之前**且在**下面 buildDigest 之前** —— 预检索的题录
  //    正是要经这一轮的 digest 进入模型视野。放到 digest 之后就完全白做(账本要到下一轮才可见)。
  // 触发条件 = 取证轮 **且** 账本为空。两个条件都显式写出:今天 Router 的 ledger_grounded 规则
  // 让前者蕴含后者,但那是规则**顺序**的巧合,不是契约 —— 顺序一改这里就会在每个取证轮白花一次检索。
  // 失败/超时/零结果一律不阻塞本轮(回落到今天的行为,不更差);出口闸仍在。
  let prefetch: PrefetchOutcome | null = null;
  if (shouldPrefetch(research.phase, ledgerAtStart)) {
    prefetch = await runPrefetch({
      workDir: input.workDir,
      userText: lastUserRaw, // 必须是 append 平台指令之前的原文
      toolNames: tools.map((t) => t.name),
      turn: messages.reduce((n, m) => (m.role === "user" ? n + 1 : n), 0),
      sessionId: input.sessionId,
    });
    // 2026-08 指标必补 C:给引擎这一枪留下 **journal 痕迹**。
    //
    // 🔴 为什么必须单独发一帧:预检索刻意**不走 runTools**(走它要手搓 tool_use 进 history =
    //    伪造模型的动作,正是要治的病),所以它一帧 tool_result 都不产生。而 journal 侧算
    //    「DOI 接地率」用的正是「正文里的 DOI 能不能在本纪元的 EvToolResult 里找到」——
    //    ⇒ 不发这一帧,预检索送达的**真论文**会被算成模型编造的,**方向单一地把北极星压低**。
    //    (账本里当然有它们,同一个 ingest 咽喉点;但账本是容器内的文件,SQL 看不见。)
    //
    // 用 evidence_appended 这个既有帧型:backend 的 classifyJournalEv 已收(→ EvEvidence,
    // hub.go:2092)、前端 fold 已有显式 no-op(fold.ts:164)、eventlog_store 的读侧只认
    // research_state 快照会主动跳过它 ⇒ **三侧都不用改**,只缺这个发射点。
    // 发帧时机在本轮 in-flight 内(currentTurnID != 0),故不会被 tee 的 tid 守卫挡掉。
    if (prefetch.status === "hit") {
      sink.frame({
        type: "evidence_appended",
        origin: "engine_prefetch",
        query: prefetch.query,
        delivered: prefetch.delivered,
        ids: prefetch.newIds ?? [],
        dois: prefetch.dois ?? [],
        paper_ids: prefetch.paperIds ?? [],
      });
    }
  }
  // 有界透支预算(SS#2):披露一次(turn 开始)让模型据 soft 自我配速;越过 hard 时翻 windingDown →
  // 去工具 + 收尾指令,让 agent 自己给最完整答案并 end_turn 结束(非硬杀)。system/tools 只在翻转时变一次,
  // 不逐轮改 → 不破坏 prompt cache。peerreview 无 taskBudget → 全程 baseSystem + 全量 tools,行为完全不变。
  const tb = input.taskBudget;
  let windingDown = false;
  let windDownToolRounds = 0; // wind-down 生效后已用掉的工具轮数(见 WIND_DOWN_TOOL_ROUNDS)
  // ask 收尾:模型调用 AskUserQuestion 后置位,下一轮据此去工具 + 注入收尾指令(只翻一次)。
  // askWoundDown 防重复翻转(与 windingDown 各自独立;两者可叠加,都只是把 activeTools 收成 [])。
  let askFired = false;
  let askWoundDown = false;
  let activeTools = turnTools;
  // P1 交付闸的**本轮**计数(全部进 research_state 帧):
  //   gateBlocked = SubmitAnswer 被闸挡下的次数 —— 这就是「模型试图不取证就交付」的直接计数器
  //   (终稿 W2:今天完全不可观测);answerSubmitted / declaredInsufficient = 两条留痕出口各自是否走过。
  let gateBlocked = 0;
  let answerSubmitted = false;
  let declaredInsufficient = false;
  // system 不含披露(跨轮 byte 稳定保前缀缓存);披露 append 到本轮 user 消息尾部(见 budgetDisclosure 注释)。
  let system: string | undefined = baseSystem || undefined;
  // 2026-08 证据账本 P0 · digest 注入:走与 langDirective / budgetDisclosure **同一个已验证 seam**
  // (append 到本轮最后一条 user 消息尾部)—— 不进 system、不破上游隐式前缀缓存,历史里冻结不回改。
  // 账本为空 → 空串 → 行为回落到今天(存量会话不更差)。读失败只 warn,不阻断本轮。
  //
  // 预检索说明块排在 digest **之前**:它解释了下面那批题录是从哪来的。这条说明是必须的 ——
  // 没有它,模型看见账本里凭空多出 5 条题录,最自然的叙述就是「我刚检索过」,而那正是
  // 「伪造检索」的原话。零命中时 digest 恒为空串(renderDigest 空账本短路),所以
  // **零命中这个信号只能由这个块携带** —— 而它恰恰是最该让模型看见的一格。
  // 预检索失败则刻意**对模型静默**:失败时模型少知道一件事 = 回到今天的状态;而告诉它
  // 「平台检索刚才挂了」只会引它向用户复述内部故障(与 toolFailLine 纪律相冲)。失败留痕在
  // slog + research_state 帧(带外),不在模型视野里。
  let evidenceBlock = "";
  try {
    const digest = await buildDigest(input.workDir);
    if (digest.trim()) {
      evidenceBlock =
        "【本会话证据账本】以下是平台按工具返回自动记录的条目;E 编号是账本内标识,可用 EvidenceGet 读回完整字段。\n" +
        digest.trim();
    }
  } catch (e) {
    log.warn("evidence digest build failed", { session_id: input.sessionId, err: String((e as Error)?.message ?? e) });
  }
  if (prefetch?.note) evidenceBlock = evidenceBlock ? prefetch.note + "\n\n" + evidenceBlock : prefetch.note;
  const disclosure = [langDirective(expectedLang), budgetDisclosure(tb), evidenceBlock]
    .filter((s) => s)
    .join("\n\n");
  if (disclosure && messages.length > 0) {
    const last = messages[messages.length - 1];
    if (last.role === "user") {
      if (typeof last.content === "string") {
        messages[messages.length - 1] = { role: "user", content: last.content + "\n\n" + disclosure };
      } else if (Array.isArray(last.content)) {
        messages[messages.length - 1] = {
          role: "user",
          content: [...last.content, { type: "text", text: disclosure }],
        };
      }
    }
  }

  // 计费(C1):逐轮累加每个 LLM call 的 usage → calls[];message_complete 带 usage(本轮合计)+ calls。
  // session_total(会话累计)由 WS 层(server/ws.ts)据会话内存累计补上,executor 无状态不自持有。
  const calls: CallUsage[] = [];
  // —— 轮末 guard 链状态(2026-07 审计修复,唯一集成点在 stop_reason!==tool_use 分支)——
  // 共享纠偏预算:每 turn 纠偏轮总数 ≤2,各 guard 各 ≤1(max_tokens 恢复/语言/字符画)。
  // 🔴 2026-08 证据账本 P0:**诚实性核验已退出这个预算** —— 它降级为纯观测,不再注入纠偏轮,
  // 因此也不再和上面三条抢 MAX_CORRECTIVE_ROUNDS(旧行为下它的误报会把真故障挤出去)。
  const HONESTY_GUARD_ON = (process.env.EXECUTOR_HONESTY_GUARD ?? "on") !== "off";
  const LANG_GUARD_ON = (process.env.EXECUTOR_LANG_GUARD ?? "on") !== "off";
  const RENDER_GUARD_ON = (process.env.EXECUTOR_RENDER_GUARD ?? "on") !== "off";
  const MAX_DSML_RETRIES = Number(process.env.EXECUTOR_DSML_RETRIES ?? 1);
  const MAX_CORRECTIVE_ROUNDS = 2;
  const historyLen = messages.length; // 含本轮 user 消息;slice(historyLen) = 本 turn 产生的消息
  let correctiveRounds = 0;
  let honestyFired = false;
  let langFixFired = false;
  let asciiFixFired = false;
  let maxTokRecovered = false;
  let dsmlRetries = 0;
  let dsmlRetryDirectiveApplied = false; // protocolRetryDirective 只并进 system 一次
  let phantomFired = false; // 伪造工具调用(fold 模板回声)纠偏轮:每 turn 最多一次
  // 2026-07 线上审计:瞬态流错误当轮重放计数(传输层,与 dsmlRetries 内容层各自独立)。
  let transientRetries = 0;
  let claimAudit: ClaimFindings | null = null;
  // 空轮裁决(P0-3)判据:本 turn 是否发出过任何可见正文 / 是否执行过任何工具。
  let sawText = false;
  let ranTool = false;
  // 终帧守卫(C2):无论正常完成 / abort / error / round-cap,turn 退出时**必有**一个终帧
  // (message_complete 或 error),Go hub 据此清 inFlight,否则整个会话卡 busy 锁死。
  let terminalSent = false;
  // P0 反应式压缩:上游 context 溢出时有界次数「收紧压缩 + 重试本轮」(对齐 Claude Code prompt_too_long)。
  let reactiveReduces = 0;
  const MAX_REACTIVE_REDUCES = Number(process.env.EXECUTOR_MAX_REACTIVE_REDUCES || 2);
  const REACTIVE_KEEP_TURNS = Number(process.env.EXECUTOR_WINDOW_KEEP_TURNS || 25);
  const sendComplete = () => {
    if (terminalSent) return;
    terminalSent = true;
    // claim_audit(诚实性核验元数据):hub 对 message_complete 只浅解析 usage 后原样广播,
    // 前端忽略未知字段 —— 纯增量,零下游破坏;审计/前端可按需消费。
    sink.frame({
      type: "message_complete",
      usage: sumUsage(calls),
      calls,
      // 回显本轮 clientTurnId(审计 [18]):hub 据此把「轮级硬超时后迟到的孤儿终帧」精确匹配回被超时
      // 的那一轮,不会因随后一个快速重试轮 beginTurn 清了 bool 标志而把孤儿终帧误算到新轮上。
      ...(input.clientTurnId ? { clientTurnId: input.clientTurnId } : {}),
      ...(claimAudit
        ? {
            claim_audit: {
              dois_unverified: claimAudit.unverifiedDois.length,
              delivery_mismatch: claimAudit.deliveryMismatch,
              fullread_mismatch: claimAudit.fullReadMismatch,
              // 2026-08 证据账本 P0:核验已降级为纯观测,恒 false(字段保留 —— 下游按未知/兼容字段处理)。
              corrective_fired: false,
            },
          }
        : {}),
    });
  };
  // error 终帧同样携带本轮已完成 LLM call 的 usage/calls:多轮工具循环里最后一轮失败时,
  // 前几轮的上游消耗是真实发生的 —— 只发裸 error 会让 Go 侧整轮漏记(计费/配额)。
  // Go hub 的 error case 按 message_complete 同一链路入账;WS 层(server/ws.ts)会像完成帧
  // 一样补 session_total(水位口径跨帧型一致)。
  // 2026-08 指标必补 B:error 帧在这里**只登记、不发送** —— 真正发送统一挪到 finally 的终帧
  // 收口处,且**排在 research_state 之后**。
  //
  // 🔴 为什么要绕这一下:backend 一收到 error 就 endTurn() → currentTurnID = 0(hub.go:1222),
  //    而 journal 的 tee 有 `if tid != 0` 守卫(hub.go:1616)⇒ 在 error **之后**到达的
  //    research_state 会被静默丢弃。前端照样收得到(广播在 tee 之前),所以肉眼完全看不出来。
  //    受害的正是 round_cap / 预算耗尽 / 上游失败这几类轮:它们的 gate_blocked、queries
  //    一个字都进不了库 —— 而「模型试图不取证就交付」的直接计数恰恰最该在这些轮里量化。
  //
  //    刻意**不**采用「在每个 sendError 调用点前插一句 await emitResearchState()」:
  //    那要靠纪律,第 7 个调用点必然忘,且忘了没有任何红灯(又一次「造好没接线」)。
  //    改成单点收口后,「research_state 先于 error」由**结构**保证,新增调用点自动继承。
  let pendingError: { message: string; code: string } | null = null;
  const sendError = (message: string, code: string) => {
    // 立刻置位:finally 里的 emitArtifacts / sendComplete 仍按「本轮已终结」处理,与旧行为一致。
    terminalSent = true;
    pendingError = { message, code };
  };

  try {
    for (let round = 0; ; round++) {
      if (signal?.aborted) break; // 用户 stop → 跳出,finally 补终帧
      // 2026-08 Phase 1(Run 引擎):轮上限**单点参数化**。
      // maxRounds 不下发时 `?? MAX_TOOL_ROUNDS` 与旧行为逐字等价 —— 这是零回归的全部保证。
      if (round >= (input.maxRounds ?? MAX_TOOL_ROUNDS)) {
        if (input.maxRounds) {
          // 🔴 Run 的一步轮尽 = **分页**,不是失败。
          //    今天单体形态下 round_cap 是终结错误:用户白等 20 分钟拿到一句"系统正忙"。
          //    Run 形态下产物已落 run/steps/<key>.md,引擎把这一步退回 pending,
          //    下次认领时带着「这是续做,先 Read 已有产物再往下写」的提示接着推进。
          //    code 必须与 backend 的 isStepIncomplete 判据一致(agentrun/engine.go)。
          sendError("step incomplete: tool round budget exhausted for this step", "step_incomplete");
          break;
        }
        // 2026-07 线上审计:旧 code="busy" 被 backend 改名 overloaded →「系统正忙,请稍候再试」,
        // 诱导用户原样重发(必然再撞顶;线上 2 用户 7 轮白等)。改独立 code="round_cap"
        // (backend 映射由并行改动补;旧 backend 对未知 code 有兜底文案,可容忍)。
        sendError("tool round cap exceeded", "round_cap"); // error 即终帧(hub 在 error case 清 inFlight)
        break;
      }
      if (MAX_TURN_TOKENS > 0) {
        // V3-4.1-5:与 wind-down 统一为 raw 口径(4 类全 1x),两闸不再各说各话。
        const spent = calls.reduce(
          (n, c) => n + (c.input_tokens || 0) + (c.output_tokens || 0) + (c.cache_read_tokens || 0) + (c.cache_creation_tokens || 0),
          0,
        );
        if (spent > MAX_TURN_TOKENS) {
          log.warn("turn token budget exceeded", { session_id: input.sessionId, spent, budget: MAX_TURN_TOKENS });
          sendError("本轮处理量已达上限,已自动停止。请精简需求后重试。", "budget");
          break;
        }
      }
      // 有界透支自动收尾(SS#2):raw 口径(4 类全 1x)已花 >= hardRemaining → 翻 windingDown。
      // 只翻一次:去掉全部工具 + 换成收尾指令,后续轮模型只能出文本 → 写完 end_turn 自然结束。
      if (tb && !windingDown) {
        const rawSpent = calls.reduce(
          (n, c) => n + (c.input_tokens || 0) + (c.output_tokens || 0) + (c.cache_read_tokens || 0) + (c.cache_creation_tokens || 0),
          0,
        );
        if (rawSpent >= tb.hardRemaining) {
          windingDown = true;
          // 2026-08 证据账本 P0 · wind-down 反向化:不再清空全部工具,保留读回本会话已有证据的只读工具
          // (检索类照常消失 → 不再新增外部消耗)。同一触发点、同一「只翻一次」语义。
          activeTools = turnTools.filter((t) => WIND_DOWN_KEEP_TOOLS.has(t.name));
          system = [baseSystem, budgetWindDownDirective].filter((s) => s && s.trim()).join("\n\n") || undefined;
          log.info("turn budget wind-down: agent-driven finalize", {
            session_id: input.sessionId, raw_spent: rawSpent, hard_remaining: tb.hardRemaining,
            kept_tools: activeTools.map((t) => t.name).join(","),
          });
        }
      }
      // wind-down 后的工具轮数上限:翻完账本就必须落笔。到点清空 → 只能出文本(确定性,不靠劝导)。
      if (windingDown && activeTools.length > 0 && windDownToolRounds >= WIND_DOWN_TOOL_ROUNDS) {
        activeTools = [];
        log.info("turn budget wind-down: evidence lookup budget spent, text-only", {
          session_id: input.sessionId, rounds: windDownToolRounds,
        });
      }
      // ask 收尾(交互提问,方案 B):上一轮调用过 AskUserQuestion → 问题卡片已呈现给用户,现在去掉
      // 全部工具 + 注入 ask 收尾指令,让模型简短收一句就 end_turn 停下等用户点选(答案作为下一条
      // user 消息开新轮)。只翻一次;system 只在此变一次,不逐轮改 → 不破坏 prompt cache。
      if (askFired && !askWoundDown) {
        askWoundDown = true;
        activeTools = [];
        system = [baseSystem, askWindDownDirective].filter((s) => s && s.trim()).join("\n\n") || undefined;
        log.info("turn ask wind-down: awaiting user choice", { session_id: input.sessionId });
      }
      sink.frame({ type: "status", state: "thinking" });

      // P2 图片通道:无视觉模型 → 请求里的历史 image 块换文本占位(history 本体不动,
      // 切回视觉模型仍能看见);vision 模型限量外发(保最近 N 张,控 token/payload)。
      const wireMessages = input.vision
        ? limitLiveImages(messages, MAX_LIVE_IMAGES)
        : stripImageBlocks(messages);
      const stream = client.messages.stream(
        { model, max_tokens: maxTokens, system, messages: wireMessages, tools: activeTools as unknown as Anthropic.ToolUnion[] },
        signal ? { signal } : undefined,
      );
      const assembler = new ToolUseAssembler();
      // DSML 协议泄漏熔断(P0-5):两条 delta 通路各挂一个流式扫描器,发帧前过滤 —— 命中即吞掉
      // 该块余下全部文本(绝不下发/绝不进 journal),轮级裁决在 finalMessage 之后。每轮新流新建。
      const textGuard = new ProtocolLeakGuard();
      const thinkGuard = new ProtocolLeakGuard();
      // P1-1:per-block(content_block index)的流式明文抽取器 + 目标文件缓存。每轮新流 index 从 0 起,
      // 故随 assembler 一起每轮新建。FieldStreamer 有状态、O(N) 只发增量;toolPath 让前端能校验写的是不是
      // 活动文件(references.bib/terminology.md 等非活动文件不污染活动文件预览,review #2)。
      const streamers = new Map<number, FieldStreamer>();
      const toolPaths = new Map<number, string>();

      // 流式迭代与 finalMessage 必须同一个 try:OpenAI 适配层(及 SDK 网络层)的失败可能从
      // 迭代器本身 throw —— 若不接住,会越过本函数直接进 finally 的终帧守卫,先发出一个
      // 空 usage 的 message_complete,error 帧反而落在完成帧之后(前端已收轮 → 用户看到
      // 「无任何返回」且两侧都无日志)。2026-07-14 智能搜索空返回事故根因。
      let msg: Anthropic.Message;
      // 2026-07 审查[6]:本轮是否已经开过 tool_use / thinking 块 —— 瞬态重放的前置守卫用。
      // round_discarded 的四份消费方(claw/prism/search fold + backend eventlog_store)都是
      // 「只摘当前那一个在途文本块」的窄语义;一旦出现新的块边界,先前的文本块就撤不掉了。
      let roundEmittedToolBlock = false;
      let roundEmittedThinking = false;
      // abort 抢救:被中断轮从流事件累计的 usage 快照。message_start 带 input+cache(+初始 output),
      // message_delta 带累计 output。用户 stop 时 finalMessage() 抛错、该轮 usage 不进 calls → 若不抢救,
      // 大 prompt「发出即 stop」整轮 input 漏记(前置日额度闸只读不预扣,故可被反复利用绕过配额)。
      let partialUsage: Anthropic.Usage | null = null;
      try {
        for await (const ev of stream) {
          if (ev.type === "message_start") {
            partialUsage = ev.message.usage;
          } else if (ev.type === "message_delta") {
            // 覆盖式合并:message_delta.usage 带累计 output_tokens(及后续 SDK 的其它增量)。
            partialUsage = { ...(partialUsage ?? ({} as Anthropic.Usage)), ...ev.usage } as Anthropic.Usage;
          } else if (ev.type === "content_block_start") {
            const cb = ev.content_block;
            if (cb.type === "text") {
              sink.frame({ type: "content_start", blockType: "text" });
            } else if (cb.type === "tool_use") {
              assembler.open(ev.index, { id: cb.id, name: cb.name });
              roundEmittedToolBlock = true; // 审查[6]:块边界已产生 → 本轮不可再靠 round_discarded 整体撤回
              sink.frame({ type: "content_start", blockType: "tool_use", toolName: cb.name, toolUseId: cb.id });
            } else if (cb.type === "thinking") {
              roundEmittedThinking = true; // 同上
              sink.frame({ type: "content_start", blockType: "thinking" });
            }
          } else if (ev.type === "content_block_delta") {
            const d = ev.delta as { type: string; text?: string; thinking?: string; partial_json?: string };
            if (d.type === "text_delta" && d.text) {
              const out = textGuard.feed(d.text);
              if (out) {
                sawText = true;
                sink.frame({ type: "content_delta", text: out });
              }
            } else if (d.type === "thinking_delta" && d.thinking) {
              const out = thinkGuard.feed(d.thinking);
              if (out) sink.frame({ type: "thinking", text: out });
            }
            else if (d.type === "input_json_delta" && d.partial_json !== undefined) {
              assembler.push(ev.index, d.partial_json);
              // P1-1 逐 token 流式:若这是 Write,把 content 已解出的**明文增量**作为 content_delta.toolInput
              // 发出 → 前端右侧文档面逐字长出。有状态抽取器只解新字节(O(N));顺带带上目标文件 toolPath
              // 供前端校验(非活动文件不污染活动预览)。后端已就绪(不 journal 无 text 的 content_delta、
              // 也不当文本合并);前端 socket 合并相邻 toolInput、prism 消费喂预览。
              const meta = assembler.peek(ev.index);
              const field = meta && streamFieldFor(meta.name);
              if (meta && field) {
                let streamer = streamers.get(ev.index);
                if (!streamer) {
                  streamer = new FieldStreamer(field);
                  streamers.set(ev.index, streamer);
                }
                const inc = streamer.push(meta.json);
                if (inc) {
                  let path = toolPaths.get(ev.index);
                  if (!path) {
                    const p = extractStreamingFieldValue(meta.json, "file_path"); // 短、早于 content 完成
                    if (p) {
                      path = p;
                      toolPaths.set(ev.index, p);
                    }
                  }
                  sink.frame({ type: "content_delta", toolInput: inc, toolPath: path });
                }
              }
            }
          } else if (ev.type === "content_block_stop") {
            if (assembler.isTool(ev.index)) {
              const tu = assembler.close(ev.index);
              // 2026-08 证据账本 P1:SubmitAnswer 的入参**就是**最终答案正文,不能原样进工具卡片 ——
              // ① 闸放行时正文会另发 content_delta,卡片里再来一份就是屏幕上的重影 + journal 双份存储;
              // ② 闸挡下时正文**必须不可见**,否则「被拒绝的无据答案」照样送到了用户眼前 = 闸形同虚设。
              if (tu) {
                const frameInput =
                  tu.name === SUBMIT_ANSWER_TOOL
                    ? { ...((tu.input ?? {}) as Record<string, unknown>), answer: SUBMITTED_PLACEHOLDER }
                    : tu.input;
                sink.frame({ type: "tool_use_complete", toolName: tu.name, toolUseId: tu.id, input: frameInput });
              }
            }
          }
        }

        msg = await stream.finalMessage();
      } catch (e) {
        if (signal?.aborted) {
          // 抢救被中断轮的真实上游消耗(input 已发给 provider 计费、partial output 已产出),
          // 记一笔 best-effort usage,否则整轮漏记 + 可绕过 token 配额。走 finally 补终帧,不报 error。
          if (partialUsage) calls.push(normUsage(partialUsage, model));
          break;
        }
        const errMsg = String((e as Error)?.message ?? e);
        // P0 反应式压缩:上游报 context 溢出(声明窗口 < 实际 / 首轮 seed 大历史 / 切小模型)时,
        // 收紧目标再压一次并重试本轮 —— 而非直接报错。有界次数,防死循环。
        if (isContextOverflow(errMsg) && input.contextWindow && input.contextWindow > 0 && reactiveReduces < MAX_REACTIVE_REDUCES) {
          try {
            // 刚发生 context 溢出 → 真实占用必然 ≥ 窗口。用「窗口」与「最后一次成功 call 的真实 prompt」取大做
            // currentTokens,保证 reduceForWindow 入口闸一定放行(否则内层 estimateTokens 偏低会又空转返回、
            // 白烧一次重试)。溢出的那次 call 抛在 finalMessage() 前、未进 calls,故取上一次成功 call 兜底。
            const lastOk = calls[calls.length - 1];
            const reactiveCurrent = Math.max(
              input.contextWindow,
              lastOk ? lastOk.input_tokens + lastOk.cache_read_tokens + lastOk.cache_creation_tokens : 0,
            );
            // 预留本轮实际输出上限:压到「上下文 − 输出预留」而非整窗,保证重试后 输入+输出 ≤ 上下文。
            const reactiveBudget = Math.max(1024, input.contextWindow - effectiveOutputCap(input.maxOutput));
            const r = await reduceForWindow(messages, reactiveBudget, {
              keepTurns: REACTIVE_KEEP_TURNS,
              targetPct: 55,
              currentTokens: reactiveCurrent,
            });
            if (r.actions.length > 0) {
              messages.splice(0, messages.length, ...r.messages); // 原地替换工作数组
              // 压缩摘要 = 系统内部开销:与主动压缩(server/ws.ts)同口径,走带外 token_usage{context_compact}
              // 帧(Go recordOutOfBandTokens 置 SkipQuota,记账本但不扣用户额度)。**不能** push 进 calls
              // —— 否则并入 message_complete.usage/session_total 被当正常轮内消耗扣用户额度(两路口径相反)。
              if (r.usage) sink.frame({ type: "token_usage", usage: r.usage, kind: "context_compact" });
              reactiveReduces++;
              log.warn("reactive context reduce on overflow, retrying round", {
                session_id: input.sessionId, model, round, actions: r.actions.join(","), attempt: reactiveReduces,
              });
              continue; // 用压缩后的 messages 重发本轮
            }
          } catch (re) {
            log.warn("reactive reduce failed", { err: String((re as Error)?.message ?? re) });
          }
        }
        // 2026-07 线上审计:上游内容审查拦截(阿里云 data_inspection_failed 等,恒 400)不是连接问题,
        // 原样重试必然再拦 —— 旧路径落 upstream →「AI 服务连接中断,请重试」误导用户重试 3 连灭。
        // 独立 code="content_blocked",文案如实指向内容合规。
        if (isContentBlocked(errMsg)) {
          log.warn("upstream content inspection blocked", { err: errMsg, session_id: input.sessionId, model, round });
          sendError("内容未通过上游服务的合规审查,本轮已终止;请调整表述后重试。", "content_blocked");
          break;
        }
        // 2026-07 线上审计:瞬态流错误(流式 JSON 损坏 / socket 意外断开 / 503 过载)零重试直接炸轮
        // (4 天 4 例)。当轮限一次、退避后重放本轮;与 DSML round_discarded 重试(内容层)并存不叠加。
        // 失败尝试的真实上游消耗(partialUsage)照记入 calls —— 计费语义不变(与 abort 抢救同口径)。
        // 2026-07 审查[6]:补上与 DSML 路径同级的前置守卫。round_discarded 只能撤「当前那一个在途文本块」,
        // 本轮一旦已开过 tool_use / thinking 块,先前的文本块在四份 fold 里都已被块边界收尾、撤不回来,
        // 重放会留下「残缺前缀 + 正式答案」两段与无 tool_result 的孤儿工具卡 → 这种轮不重放,按 upstream 收轮。
        const transient = isTransientStreamError(errMsg, e);
        if (
          transient &&
          transientRetries < MAX_TRANSIENT_RETRIES &&
          !signal?.aborted &&
          !roundEmittedToolBlock &&
          !roundEmittedThinking
        ) {
          transientRetries++;
          if (partialUsage) calls.push(normUsage(partialUsage, model));
          // 撤回已流出的残缺前缀(实时 fold 与 journal 回放同步清掉),否则重放的完整答案会拼在其后。
          // 2026-08-07:帧带上**原因**(旧版 payload 只有 type,线上 39 条 round_discarded
          // 全靠「同轮碰巧还有 error 帧」才归得了因)。消费方只 switch type,加字段是纯增量。
          sink.frame({
            type: "round_discarded",
            reason: "transient_stream_error",
            attempt: transientRetries,
            detail: errMsg.slice(0, 200),
          });
          log.warn("transient upstream stream error, retrying round", {
            err: errMsg, session_id: input.sessionId, model, round, attempt: transientRetries,
          });
          await new Promise((r) => setTimeout(r, TRANSIENT_RETRY_DELAY_MS));
          if (signal?.aborted) break; // 退避期间用户 stop → 不再重放,finally 补终帧
          continue; // 原 messages 重发本轮
        }
        // transient=true 却走到这里 = 重试额度用尽 / 已 abort / 被审查[6]的块边界守卫挡下,留痕便于统计。
        log.error("upstream stream failed", {
          err: errMsg, session_id: input.sessionId, model, round,
          transient, emitted_tool_block: roundEmittedToolBlock, emitted_thinking: roundEmittedThinking,
        });
        sendError("模型服务响应异常,请稍后重试或更换模型。", "upstream");
        break;
      }

      // leakGuard 收尾:放出无害 holdback 尾巴(未构成 marker 前缀的正常文本)。
      {
        const tailT = textGuard.flush();
        if (tailT) {
          sawText = true;
          sink.frame({ type: "content_delta", text: tailT });
        }
        const tailK = thinkGuard.flush();
        if (tailK) sink.frame({ type: "thinking", text: tailK });
      }

      calls.push(normUsage(msg.usage, model)); // 每轮 LLM call 计费(C1)

      // DSML 泄漏轮级裁决(P0-5):history 消毒(marker 起一刀切,协议残渣绝不回喂下一 round/seed);
      // 干净正文几乎为零且无工具 → 整 round 作废重打一次(deepseek 该故障非确定性,重试通常即恢复);
      // 重试额度用尽仍全空 → 如实报协议异常;已有可观正文 → 保留净化后内容正常收轮。
      if (textGuard.tripped || thinkGuard.tripped) {
        const hasToolUse = msg.content.some((b) => b.type === "tool_use");
        // 归因字段(2026-08-07):family/marker/marker_hex 回答「漏的是哪一族变体」——
        // 判据已从字面量名单换成形状族,新变体出现时这三个字段是唯一能指出「哪一族在动」的读数。
        // marker_hex 报字节而非字形:线上 `｜` 是 U+FF5C,截图里与 ASCII `|` 肉眼无差,
        // 上一轮排查正是因此得出过错误结论。
        const leak = describeLeak(textGuard, thinkGuard);
        log.warn("DSML protocol leak intercepted", {
          session_id: input.sessionId,
          model,
          round,
          passed_chars: textGuard.passedChars,
          channel: leak?.channel,
          marker_family: leak?.family,
          marker: leak?.marker,
          marker_hex: leak?.markerHex,
          has_tool_use: hasToolUse,
          will_retry: !hasToolUse && textGuard.passedChars < 200 && dsmlRetries < MAX_DSML_RETRIES,
        });
        msg = {
          ...msg,
          content: msg.content.map((b) =>
            b.type === "text"
              ? { ...b, text: stripProtocolMarkers(b.text) }
              : b.type === "thinking"
                ? { ...b, thinking: stripProtocolMarkers(b.thinking ?? "") }
                : b,
          ),
        } as Anthropic.Message;
        if (!hasToolUse && textGuard.passedChars < 200 && dsmlRetries < MAX_DSML_RETRIES) {
          dsmlRetries++;
          // 作废本轮:已流式发出的干净前缀(<200 字符)必须从客户端撤回,否则重打的完整答案会
          // 追加成第二个文本块,用户看到「残缺前缀 + 正式答案」两段(审计 [10])。round_discarded
          // 帧让实时 fold 与 journal 回放都清掉本轮在途的 in-progress 文本块。
          sink.frame({
            type: "round_discarded",
            reason: "protocol_leak",
            attempt: dsmlRetries,
            markerFamily: leak?.family,
            marker: leak?.marker,
            markerHex: leak?.markerHex,
            passedChars: textGuard.passedChars,
          });
          // 重打不再是**原样重放**:线上日志里 round N 熔断、round N+1 紧接着又熔断的相邻对反复出现
          //(MAX_DSML_RETRIES=1 ⇒ 第二次踩就整轮判死)。原样重发等于赌同一个非确定性故障不再发生。
          // 这里改 system(只改一次,后续轮沿用)显式要求走工具通道 —— 不动 messages:
          // 追加 user 消息会在「上一条就是 user」时形成 user-after-user 非法序列。
          if (!dsmlRetryDirectiveApplied) {
            dsmlRetryDirectiveApplied = true;
            system = [system, protocolRetryDirective].filter((s) => s && s.trim()).join("\n\n") || undefined;
          }
          continue; // usage 已入账(真实上游消耗);污染内容不进 history
        }
        if (!hasToolUse && msg.content.every((b) => b.type !== "text" || !b.text.trim())) {
          // 判死也要留下「为什么」:这一条是全站第二大错误码(线上 26 条),而在此之前
          // 它的日志里没有任何能区分变体族的字段。
          log.error("protocol leak unrecoverable, turn failed", {
            session_id: input.sessionId,
            model,
            round,
            retries: dsmlRetries,
            marker_family: leak?.family,
            marker_hex: leak?.markerHex,
          });
          sendError("模型输出出现协议异常,本轮已终止,请重试或更换模型。", "model_protocol_error");
          break;
        }
      }

      // 必须 append 全 content(非仅 text),保留 tool_use 块给下一请求
      messages.push({ role: "assistant", content: msg.content });

      if (msg.stop_reason !== "tool_use") {
        // ═══ 轮末 guard 链(2026-07 审计修复的唯一集成点)═══
        // 顺序:max_tokens 恢复(协议要求,优先)→ 诚实性(2026-08 起**纯观测**,不再占纠偏预算)
        // → 语言 → 字符画。共享预算 correctiveRounds ≤2 现在只由 max_tokens/语言/字符画三条确定性
        // guard 分;windingDown/askWoundDown/abort/round 见顶全部跳过。
        const guardsEligible = !windingDown && !askWoundDown && !signal?.aborted && round < MAX_TOOL_ROUNDS - 1;

        // ① max_tokens 撞顶(P0-3 机制 2:thinking+大 Write content 吃光完成窗 → 工具未执行、用户无感知)。
        //    有 pending tool_use → 按协议回 is_error tool_result + 分段写指令,再走一轮自恢复;
        //    无工具可救 → 如实告知截断(system_notification 通道,前端未识别 kind 时静默忽略)。
        if (msg.stop_reason === "max_tokens") {
          log.warn("turn hit max_tokens (output truncated)", {
            session_id: input.sessionId,
            output_tokens: msg.usage?.output_tokens,
            max_tokens: maxTokens,
          });
          const pendingTools = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
          if (guardsEligible && pendingTools.length > 0 && !maxTokRecovered && correctiveRounds < MAX_CORRECTIVE_ROUNDS) {
            maxTokRecovered = true;
            correctiveRounds++;
            log.warn("guard:max_tokens recovery (chunked-write directive)", { session_id: input.sessionId, model });
            const results = pendingTools.map((tu) => truncatedToolResult(tu.id, sink));
            messages.push({ role: "user", content: results });
            continue;
          }
          sink.frame({
            type: "system_notification",
            kind: "output_truncated",
            level: "warning",
            message: "本轮输出达到长度上限,内容可能不完整;可让我分段继续。",
          });
          // 未走恢复分支(额度已用/纠偏预算耗尽/临近轮上限)但仍有悬挂 tool_use → 必须为每个回一条
          // is_error tool_result 平衡 history,否则下一条 user 消息会带着未配对的 tool_use 触发上游 400,
          // 整个会话卡死直到压缩才自愈(审计 [2])。截断轮就此收尾:不再跑 honesty/lang/ascii guard ——
          // 截断正文上跑纠偏既会误判,又会在 tool_result 之后再压一条 user 文本形成 user-after-user 非法序列。
          if (pendingTools.length > 0) {
            messages.push({ role: "user", content: pendingTools.map((tu) => truncatedToolResult(tu.id, sink)) });
            break;
          }
        }

        // 本 turn 全部可见正文(宣称可能分散在多 round 的 text 块里)。
        const turnMsgs = messages.slice(historyLen);
        const finalText = turnMsgs
          .filter((m) => m.role === "assistant" && Array.isArray(m.content))
          .flatMap((m) =>
            (m.content as Anthropic.ContentBlock[])
              .filter((b): b is Anthropic.TextBlock => b.type === "text")
              .map((b) => b.text),
          )
          .join("\n");

        // ② 诚实性核验 —— 🔴 2026-08 证据账本 P0:**已降级为纯观测**,不再注入纠偏轮。
        //    移除理由(硬纪律「不做兜底」的兑现,三条都是实测):
        //    (a) 判据集合与真实故障形态不相交 —— 609 轮只触发 8 次(1.3%);claw「用户上传 PDF 前就
        //        产出 31 条效应量荟萃数据集」那次 findings 全空、静默满分,最该拦的它拦不到;
        //    (b) 冷重播时它是净负值 —— 旧版 corpus 读的是被 shadowTurn 掏空的 messages,于是每条**真实**
        //        引用都被判 unverifiedDois,纠偏要求「补齐或更正」,而模型此时无法查证,最省力的服从方式
        //        是**删掉真引用**。现在 corpus 已换成账本(见 auditClaims 的 evidence 入参),判据本身好了,
        //        但仍不接回注入:guard 只做可观测,不做解法;
        //    (c) 误报会吃掉 MAX_CORRECTIVE_ROUNDS=2 的共享预算,把 max_tokens 恢复 / 语言 / 字符画三条
        //        确定性 guard 挤出去。
        //    findings 现在只落 claim_audit(message_complete,hub 原样透传)+ slog,供带外指标。
        if (HONESTY_GUARD_ON && input.honestyGuard && guardsEligible && !honestyFired) {
          honestyFired = true; // 每轮只观测一次(不再是「纠偏只放一次」的含义)
          let artifacts: ArtifactDecl[] = [];
          try {
            if (outBaseline) artifacts = diffOut(outBaseline, await snapshotOut(input.workDir));
          } catch {
            /* 快照失败不阻断收轮 */
          }
          // 引用判据的主语料 = 证据账本(冷重播后 messages 里已只剩一行摘要,账本是唯一存活的证据)。
          let evidence: EvidenceRecord[] = [];
          try {
            evidence = await loadLedger(input.workDir);
          } catch (e) {
            log.warn("honesty observe: load evidence ledger failed", {
              session_id: input.sessionId, err: String((e as Error)?.message ?? e),
            });
          }
          const findings = auditClaims(finalText, messages, turnMsgs, artifacts, input.honestyChecks, evidence);
          if (hasFindings(findings)) {
            claimAudit = findings;
            log.warn("observe:honesty findings (no corrective round)", {
              session_id: input.sessionId,
              model,
              dois: findings.unverifiedDois.length,
              delivery: findings.deliveryMismatch,
              fullread: findings.fullReadMismatch,
              ledger_total: evidence.length,
            });
          }
        }

        // ②' 伪造工具调用(2026-08-07 生产回归)——「读了文件、改了文件,然后什么都没发生」的**第二个**成因。
        //    判据是两个确定性事实的合取,不含任何语义判断:
        //      (a) 本轮可见正文里出现了平台的历史工具记录行(〔平台记录·历史工具调用〕/ 旧模板【已调用 X】);
        //      (b) 本 turn **一个工具都没有执行过**(ranTool=false)。
        //    模型只有在模仿冷重播折叠格式时才会同时满足两者 —— 生产 17 轮 17/17 命中、零误报。
        //    与 DSML 熔断的区别:那条路轮是 failed、用户至少看得到「协议异常」;这条路轮是 **complete**、
        //    零 error、零 discard,任何现有指标都看不见,用户拿到的是一份完全没发生过的操作记录。
        //    处理用既有纠偏机制(占共享预算),让模型带着「必须走工具通道」的指令重做一轮。
        if (guardsEligible && !phantomFired && !ranTool && correctiveRounds < MAX_CORRECTIVE_ROUNDS) {
          const phantom = detectPhantomToolNarration(finalText);
          if (phantom.count > 0) {
            phantomFired = true;
            correctiveRounds++;
            log.warn("guard:phantom tool narration corrective round", {
              session_id: input.sessionId,
              model,
              hits: phantom.count,
              samples: phantom.samples.join(" | "),
            });
            messages.push({
              role: "user",
              content:
                CORRECTIVE_PREFIX +
                "你刚才在正文里书写了工具调用记录,但本轮实际上一个工具都没有执行 —— 那些「读取/修改/导出」都没有发生。" +
                "请立即重做:需要操作文件或检索时,通过工具通道真正调用工具;" +
                "在工具真正返回结果之前,不要陈述任何操作已完成。不要向用户提及本次纠正。",
            });
            continue;
          }
        }

        // ③ 语言纠偏(P1-7):期望中文而可见正文 CJK≈0(整份外语交付,如老挝语案例)→ 中文重发。
        //    第一期只对 expectedLang=zh 启用(误报面最小);用户明确要求其它语言时豁免。
        if (
          LANG_GUARD_ON &&
          guardsEligible &&
          expectedLang === "zh" &&
          !langFixFired &&
          correctiveRounds < MAX_CORRECTIVE_ROUNDS &&
          !explicitLangRequest(lastUserRaw)
        ) {
          // stripForLangGuard 额外剥掉 markdown 表格行:文献列表表格里的英文标题/作者/期刊名是
          // 合法原文,不剥会把一份「短中文引言 + 大英文文献表」误判成错语言交付而无谓重发(审计 [13])。
          const vis = stripForLangGuard(finalText);
          if (vis.length > 300 && cjkRatio(vis) < 0.1) {
            langFixFired = true;
            correctiveRounds++;
            log.warn("guard:lang corrective round", { session_id: input.sessionId, model });
            messages.push({
              role: "user",
              content:
                CORRECTIVE_PREFIX +
                "你上一段回复使用的语言与用户本条消息的语言(中文)不一致。" +
                "请立即用中文重新完整给出上一段回复的全部内容(代码、术语、文献标题保持原文),不要调用任何工具,不要解释原因,不要道歉。",
            });
            continue;
          }
        }

        // ④ 字符画纠偏(P1-8):检出 box-drawing/纯符号拼图 → 要求改用 mermaid/表格重发该部分。
        if (
          RENDER_GUARD_ON &&
          guardsEligible &&
          !asciiFixFired &&
          correctiveRounds < MAX_CORRECTIVE_ROUNDS &&
          hasBoxArt(finalText)
        ) {
          asciiFixFired = true;
          correctiveRounds++;
          log.warn("guard:render corrective round (box art)", { session_id: input.sessionId, model });
          messages.push({
            role: "user",
            content:
              CORRECTIVE_PREFIX +
              "你上一段回复用字符画(制表符/画框字符/等宽符号拼图)表达了图或结构,本界面无法正确显示字符画。" +
              "请立即只重发这部分内容:流程/结构/架构图改用 mermaid 代码块(如 flowchart TD),行列对比改用标准 Markdown 表格;" +
              "其余已正确的内容不要重复,不要调用任何工具。",
          });
          continue;
        }

        break; // 正常完成:不在此发终帧,交 finally 统一「先 artifact 帧、后 message_complete」
      }

      const toolUses = msg.content
        .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
        .map((b) => ({ id: b.id, name: b.name, input: b.input }));

      sink.frame({ type: "status", state: "tool_executing" });
      ranTool = true; // 空轮裁决判据:工具批已开始执行(界面上有工具卡片,不算空轮)
      if (windingDown) windDownToolRounds++; // 收尾期的账本读回轮计数(到点强制转纯文本)
      const results = await runTools(toolUses, input, sink, signal, model);
      // 交互提问(方案 B):本轮调用过 AskUserQuestion → 置位 askFired,下一轮开头触发 ask 收尾
      // (去工具 + 收尾指令),让模型简短收尾结束本轮,等用户在卡片上作答。
      if (toolUses.some((t) => t.name === ASK_USER_QUESTION_TOOL)) askFired = true;
      // ── 2026-08 证据账本 P1 · 交付闸的编排侧(确定性状态转移,不注入劝导文本)────────────
      // 判据全部来自工具**自己**的 is_error(闸在工具内是 `ledger.count > 0` 的引擎算数),
      // turnLoop 只做状态转移,不做任何内容判断。
      const isErrById = new Map(results.map((r) => [r.tool_use_id, r.is_error === true]));
      for (const tu of toolUses) {
        if (tu.name !== DECLARE_INSUFFICIENT_TOOL || isErrById.get(tu.id)) continue;
        // 诚实出口:横幅由**引擎**发出、位置在模型正文之前,模型写什么都盖不掉它 ——
        // 这正是它与今天「模型自己写一句免责声明、写了没人管」的区别。
        declaredInsufficient = true;
        sawText = true;
        sink.frame({ type: "content_delta", text: INSUFFICIENT_BANNER });
      }
      const submit = toolUses.find((t) => t.name === SUBMIT_ANSWER_TOOL);
      // 只记数:不吞轮、不重发(探针报告 §六:软形态强制是最坏的一种 guard)。
      // 用户 stop 时整批被短路成 aborted,那不是闸挡下的,不计入 —— 否则这个计数器会被 stop 掺水,
      // 而它是 W2「模型试图不取证就交付」的直接读数,掺了就不能用了。
      if (submit && isErrById.get(submit.id) && !signal?.aborted) gateBlocked++;
      const delivered =
        submit && !isErrById.get(submit.id)
          ? stripProtocolMarkers(String((submit.input as { answer?: unknown } | null)?.answer ?? "")).trim()
          : "";
      // 所有 tool_result 在一个 user 消息里(SDK 规则;拆开会把模型训离 parallel call)
      messages.push({ role: "user", content: results });
      if (delivered) {
        // 闸开且已交付:正文由引擎发给用户并**当场收轮** —— 省掉「模型再复述一遍整篇答案」那一次
        // LLM 往返(输出 token 是最贵的一档)。这是本方案里唯一的确定性收轮点。
        answerSubmitted = true;
        sawText = true;
        for (let i = 0; i < delivered.length; i += DELIVER_CHUNK) {
          sink.frame({ type: "content_delta", text: delivered.slice(i, i + DELIVER_CHUNK) });
        }
        // 正文进 history 时只留 assistant 文本块:tool_use 里的那份等长副本换成占位。
        // 两个理由 —— ① 省一份等长 token;② shadowTurn 冷重灌只保 text 块,留在 tool_use 里
        // 等于下次重灌就没了(那正是本方案要根治的病灶,不能自己再造一个)。
        redactSubmittedAnswer(messages, submit!.id);
        messages.push({ role: "assistant", content: [{ type: "text", text: delivered }] });
        break;
      }
    }
  } finally {
    // 空轮改判(P0-3):整轮无可见正文、无工具执行、非用户 stop —— 旧行为发 complete 会静默吞掉
    // 用户消息(model=''+usage 全 0 标 complete,前端零提示,审计 12 会话)。改判为可见错误;
    // error 帧携带已发生的 usage/calls(如 thinking-only 截断),计费不漏。
    if (!terminalSent && !signal?.aborted && !sawText && !ranTool) {
      log.warn("empty turn adjudicated to error", {
        session_id: input.sessionId,
        model,
        calls: calls.length,
      });
      sendError("模型没有返回任何内容,本轮未完成,请重试。", "empty_turn");
    }
    // 正常完成(未走 error/round-cap 的 sendError)→ 先把本 turn 的 ./out/ 产物作为 artifact 帧发出,
    // **必须在 message_complete 之前**(前端 fold 据此把产物绑到当前轮;完成帧一到就切下一轮)。
    if (!terminalSent && outBaseline) {
      try {
        await emitArtifacts(input.workDir, outBaseline, sink);
      } catch (e) {
        log.warn("emit artifacts failed", { session_id: input.sessionId, err: String((e as Error)?.message ?? e) });
      }
    } else if (outBaseline) {
      // 🔴 异常终止轮**也要过交付闸**(2026-08-06 补)。
      //
      //    交付闸此前只挂在 `emitArtifacts` 里,而它被 `!terminalSent` 守着 ⇒
      //    六个 sendError 调用点(round_cap / budget / upstream / empty_turn …)整轮跳过闸。
      //    而 backend 的产物收割是 on-list 的 `ListWorkspaceFiles(out/)`,**与帧无关** ——
      //    文件照样被收割、照样能下载。于是闸恰好在「模型最可能乱写」的那类轮上全面失效:
      //    模型第 20 轮手写一份含自编 p 值的 docx、第 24 轮触 round_cap,闸一次都没跑。
      //
      //    这里只跑闸、不发帧:帧是「本轮产物」的呈现,异常轮不该有;
      //    而闸的职责是**把不该交付的文件挪出 out/**,那与本轮结不结得成无关。
      try {
        await runDeliveryGate(input.workDir);
      } catch (e) {
        log.error("交付闸执行异常(异常终止轮,本次未拦截)", {
          session_id: input.sessionId, err: String((e as Error)?.message ?? e),
        });
      }
    }
    // 2026-08 证据账本 P0-c:带外过程计数。**必须在 message_complete 之前**(同 artifact 帧:
    // 前端 fold 据此绑到当前轮,完成帧一到就切下一轮)。
    // 发帧门槛:本会话有账本 或 本轮检索过。纯闲聊会话(账本空 + 本轮零检索)不发 —— 否则用户
    // 会在「你好」下面看到「本轮未检索」。但**取证型会话里的零检索轮必须发**,那正是要曝光的一格。
    // 口径冻结:queries = **本轮**(基线差值);ledger_total / by_origin = 会话累计。
    // 前端 chip 文案「本轮检索 N 次 · 账本 M 条」直接依赖这个口径,填错即制造一条新的谎。
    // 2026-08 证据账本 P1 追加:phase/rule = Router 判定(误判率的生产探针,可 SQL 切分母);
    // gate_blocked = 本轮 SubmitAnswer 被闸挡下的次数(终稿 W2「模型试图不取证就交付」的直接计数);
    // submitted / insufficient = 两条留痕出口。取证轮**即使零检索零账本也必须发帧** —— 那正是要曝光的一格。
    try {
      const st = await ledgerStats(input.workDir);
      const turnQueries = Math.max(0, st.queries - queriesBaseline);
      if (st.total > 0 || turnQueries > 0 || research.phase === "evidence") {
        sink.frame({
          type: "research_state",
          queries: turnQueries,
          ledger_total: st.total,
          by_origin: st.byOrigin,
          phase: research.phase,
          rule: research.rule,
          // 预检索留痕(P1 预检索):hit / empty / failed / no_query / unavailable / off。
          // ⚠️ 口径:上面的 queries 是**本轮全部**检索次数,预检索成功时它含引擎那一枪 ——
          // 这是诚实的(那确实是本轮真的发生过的一次上游检索),但前端 chip 若只印
          // 「本轮检索 N 次」会让用户以为是模型搜的。prefetch 字段就是给 chip 拆开这一格用的。
          ...(prefetch ? { prefetch: prefetch.status } : {}),
          ...(prefetch?.delivered !== undefined ? { prefetch_hits: prefetch.delivered } : {}),
          ...(gateBlocked > 0 ? { gate_blocked: gateBlocked } : {}),
          ...(answerSubmitted ? { submitted: true } : {}),
          ...(declaredInsufficient ? { insufficient: true } : {}),
        });
      }
    } catch (e) {
      // 账本读失败不该影响出答案:少一枚 chip,不少一次回答。
      log.warn("emit research_state failed", { session_id: input.sessionId, err: String((e as Error)?.message ?? e) });
    }
    // 终帧收口(指标必补 B):error 必须排在 research_state **之后**发 —— 顺序反了 backend 就丢账,
    // 见上面 sendError 处的长注释。usage/calls 在此刻取:所有 sendError 调用点后面都紧跟 break,
    // calls 不会再增长,与「在 sendError 当场取」逐字段等价。
    const pe = pendingError as { message: string; code: string } | null;
    if (pe) {
      const carry = calls.length > 0 ? { usage: sumUsage(calls), calls } : {};
      // 回显 clientTurnId(审计 [18]):error 也是终帧,同样要能被 hub 精确匹配为孤儿(超时后迟到)。
      const ctid = input.clientTurnId ? { clientTurnId: input.clientTurnId } : {};
      sink.frame({ type: "error", message: pe.message, code: pe.code, ...ctid, ...carry });
    }
    sendComplete(); // C2:兜底终帧(abort/未捕获退出)。已发 error 的路径置了 terminalSent,不重复。
  }
  return messages;
}

// redactSubmittedAnswer(2026-08 证据账本 P1):把 SubmitAnswer 那个 tool_use 里的 answer 换成占位。
// 正文此刻已作为 assistant **文本块**进入 history —— 文本块是唯一能扛住 shadowTurn 冷重灌的形态
// (shadowTurn.ts:50 只保 text),留在 tool_use 里等于下次重灌就没了。同时省一份等长 token。
// 从尾往前找,只改命中的那一条(tool_use id 全局唯一)。导出供单测(同 isContextOverflow 等)。
export function redactSubmittedAnswer(messages: Anthropic.MessageParam[], toolUseId: string): void {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || m.role !== "assistant" || !Array.isArray(m.content)) continue;
    let hit = false;
    const content = (m.content as Anthropic.ContentBlockParam[]).map((b) => {
      const blk = b as { type?: string; id?: string; input?: Record<string, unknown> };
      if (blk.type !== "tool_use" || blk.id !== toolUseId) return b;
      hit = true;
      return { ...(b as object), input: { ...(blk.input ?? {}), answer: SUBMITTED_PLACEHOLDER } } as Anthropic.ContentBlockParam;
    });
    if (hit) {
      messages[i] = { role: "assistant", content };
      return;
    }
  }
}

// truncatedToolResult:max_tokens 撞顶恢复(guard ①)—— 被截断的 tool_use 必须回 tool_result
// (协议要求),借此注入确定性纠偏指令。is_error 帧让前端如实显示该工具"未成功"。
// 该 user 消息仅含 tool_result 块 —— backend journal parity 按契约豁免这类执行器内部消息。
function truncatedToolResult(toolUseId: string, sink: EventSink): Anthropic.ToolResultBlockParam {
  const content = [
    {
      type: "text" as const,
      text:
        "输出因长度上限被截断,该工具调用未执行。请把内容拆成多次较小的 Write/Edit 分段写入:" +
        "先写文档框架,再逐段补全,每次写入控制在数千字以内。",
    },
  ];
  sink.frame({ type: "tool_result", toolUseId, content, isError: true });
  return { type: "tool_result", tool_use_id: toolUseId, content, is_error: true };
}

// 中性 usage(Go AgentUsage 的 json 形)。Anthropic 字段名 cache_read_input_tokens → cache_read_tokens。
export type CallUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  model: string;
};

function normUsage(u: Anthropic.Usage, model: string): CallUsage {
  const anyU = u as unknown as Record<string, number>;
  return {
    input_tokens: u.input_tokens ?? 0,
    output_tokens: u.output_tokens ?? 0,
    cache_read_tokens: anyU.cache_read_input_tokens ?? 0,
    cache_creation_tokens: anyU.cache_creation_input_tokens ?? 0,
    model,
  };
}

// sumUsage:本轮所有 LLM call 合计 → message_complete.usage(本轮 delta)。
export function sumUsage(calls: CallUsage[]): CallUsage {
  const t: CallUsage = { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0, model: "" };
  for (const c of calls) {
    t.input_tokens += c.input_tokens || 0;
    t.output_tokens += c.output_tokens || 0;
    t.cache_read_tokens += c.cache_read_tokens || 0;
    t.cache_creation_tokens += c.cache_creation_tokens || 0;
    if (c.model) t.model = c.model;
  }
  return t;
}

// addUsage:把一次 turn 的合计累加进会话累计(WS 层维护 session_total)。
export function addUsage(acc: CallUsage, d: CallUsage): CallUsage {
  return {
    input_tokens: acc.input_tokens + (d.input_tokens || 0),
    output_tokens: acc.output_tokens + (d.output_tokens || 0),
    cache_read_tokens: acc.cache_read_tokens + (d.cache_read_tokens || 0),
    cache_creation_tokens: acc.cache_creation_tokens + (d.cache_creation_tokens || 0),
    model: d.model || acc.model,
  };
}

// 导出供单测。isContextOverflow:上游 context 窗口溢出的错误形态识别(跨 Anthropic / OpenAI 兼容 / 国产端点)。
// 覆盖英文(Anthropic/OpenAI)+ Moonshot「exceeded model token limit: N」+ 国产中文措辞
// (GLM/通义/豆包/MiniMax:输入过长 / 超过长度限制 / 超出上下文 等)—— 否则反应式压缩自愈完全跳过,
// 国产小窗模型撞墙直接报「模型服务响应异常」(2026-07 多厂商审计 P2-2)。
export function isContextOverflow(msg: string): boolean {
  return /prompt is too long|too many tokens|maximum context|context[_ ]?length|context length exceeded|exceeds?.{0,20}context|reduce.{0,12}length|context window|token.{0,6}limit|exceed.{0,20}(?:token|length|limit|context)|输入.{0,8}(?:过长|太长|超.{0,4}限|长度超)|超出.{0,8}(?:上下文|长度|token|字数)|上下文.{0,6}(?:超|过长|限制)|(?:输入|提示词|prompt).{0,12}(?:超过|超出).{0,10}(?:限制|上限|长度|窗口)/i.test(
    msg,
  );
}

// 2026-07 线上审计:上游内容审查拦截的错误形态识别(阿里云 data_inspection_failed 恒 400 及同类
// 中英文审查标记)。命中 → code="content_blocked"(重试无意义,绝不能标成连接问题诱导重试)。
export function isContentBlocked(msg: string): boolean {
  return /data_inspection_failed|inappropriate content|content\s*_?\s*filter|content management policy|敏感(?:词|内容|信息)|内容安全|涉嫌违规|内容.{0,8}(?:违规|不合规|审核未通过)/i.test(
    msg,
  );
}

// 2026-07 审查[7]:从错误对象/错误串里取上游 HTTP 状态码,取不到返回 null(= 纯网络/流层错误)。
// 两种来源:① Anthropic SDK 的 APIError 带数字 status 字段,message 形如 `429 {...}`;
// ② openai 适配层拼的 `openai upstream 429: <body 前 300 字符>`。只认这两种**前缀**位置的状态码,
// 绝不在 body 正文里搜 —— 正文可能回显用户内容(用户粘贴的报错里带 "503" 就会被误判)。
export function upstreamStatus(msg: string, err?: unknown): number | null {
  const s = (err as { status?: unknown } | null | undefined)?.status;
  if (typeof s === "number" && s >= 100 && s <= 599) return s;
  const m = /\bupstream (\d{3}):/.exec(msg) ?? /^\s*(\d{3})[\s:]/.exec(msg);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 100 && n <= 599 ? n : null;
}

// 2026-07 线上审计:瞬态流错误的形态识别(流式 JSON 损坏 / socket 意外断开 / 网关过载)
// —— 传输层特征,当轮一次带退避重放通常即恢复;识别面刻意收窄,4xx 业务错误绝不落入。
// 2026-07 审查[7]:改为「结构化信号优先」。有状态码时只按状态码判(429/5xx 瞬态,4xx 一律不是,
// 重试无意义还白烧一次);无状态码时才做自由文本兜底,且只匹配**首行前 200 字符**里的明确传输层特征
// —— 旧版在响应体前 300 字符里搜 `\b503\b` / `too busy`,把 `max_tokens must be <= 503`、
// 用户粘贴的报错回显都判成瞬态,同时漏掉 502/504/429 与适配层自产的三类真瞬态串。
export function isTransientStreamError(msg: string, err?: unknown): boolean {
  const status = upstreamStatus(msg, err);
  if (status !== null) return status === 429 || status >= 500;
  const head = (msg.split("\n")[0] ?? "").slice(0, 200);
  return /JSON Parse error|Unexpected end of JSON|socket.{0,60}(?:closed|reset|hang\s?up)|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|connection error|request timed out|fetch failed|connection cut by relay|ended without finish_reason|upstream (?:stream idle|time-to-first-byte) timeout|tool arguments truncated by upstream/i.test(
    head,
  );
}
