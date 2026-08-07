// 冷重播:backend journal 的扁平消息流 → Anthropic messages。**结构还原**,不是文本折叠。
//
// ══════════════════════════════════════════════════════════════════════════════════
// 🔴 铁律(设计取证见 docs/research/toolcall-protocol-2026-08/10-phantom-structural.md §4.1)
//
// ① assistant 通道里**永远不出现**「工具调用发生过」的散文。一次历史工具调用只能以 `tool_use`
//    块出现、结果只能以 `tool_result` 块出现。assistant 通道里但凡有一行描述工具调用,
//    就是给模型的照抄模板 —— 这是 2026-08-03~08-07 幻影工具链的**唯一**根因。
// ② 一切降级产物只能落在模型写不了的通道里(`tool_result.content` / user 消息)。
// ③ 结构与内容分离:结构永远还原(廉价、协议要求);内容按预算决定装多少(昂贵、可调)。
//
// 历史(两版都是错的,记下来免得第三次):
//   a30add8d2  `blocks.filter(b => b.type === "text")` —— 工具块 100% 丢弃。
//              自述理由是「tool_result 必须紧跟对应 tool_use,窗口切割/并行调用会切出孤儿 → 400」。
//              线上全量核实:seed 窗口按**整轮**切(eventlog_store.ReadRecentTurns 先取 30 个
//              turn_id 再取该轮全部事件)⇒ 切点恒在轮边界;12,977 次 tool_use 里孤儿 1 个
//              (0.008%,轮被中断);并行批产出的是干净的 TⁿRⁿ。恐惧成立但量级是 1/12977,
//              且可确定性修复(D1 占位)⇒ 本文件让「上游 400」在结构上不可能发生。
//   545c75746  工具块折成 assistant 一行文本 `【已调用 X args】结果`。
//              第二个理由(全量回喂 tool_result 正文 = 30 轮窗口均值 102K token)**是对的**,
//              但它约束的是 content 里装多少字节,与这些字节装在 text 块还是 tool_result 块无关。
//              折叠把两件事混成了一件,于是次日线上就出现模型**逐字照抄**这个模板的轮
//              (tool_use=0 / artifact=0 / status=complete / 零 error / 零 discard,任何指标都看不见)。
//
// 起作用的机制不是「模型看不见就模仿不了」—— warm 会话每一轮都在看 tool_use 块。是**通道归属**:
// 折行写在 assistant 通道 = 「我自己产出过的东西」,模仿它 = 写散文;
// 结构块的调用在 tool_use 通道、结果在 user 通道(模型永远写不了的通道),模仿它 = 发起真调用。
// 同样的字节,换个信封,把有害的 few-shot 变成有益的 few-shot。
// ══════════════════════════════════════════════════════════════════════════════════

import type Anthropic from "@anthropic-ai/sdk";
import { describeToolCall, flattenToolResultText, summarizeToolOutcome } from "../turn/compact.ts";
import { stripRecordEcho } from "../turn/toolRecord.ts";
import { log } from "../obs/log.ts";

// daemon / journal-fold 的扁平消息形(每 block 一条 typed message)。
export interface FlatMessage {
  type: string; // user | assistant | tool_use | tool_result
  content: unknown; // block 数组(text/thinking/tool_use/tool_result)
}

export interface RestoreOptions {
  /** 全局工具面字符预算(input + result content 之和)。超出后从**最老**往最新逐级降级。 */
  toolCharBudget?: number;
  /** 单个 input 字段的字符帽。 */
  inputFieldCap?: number;
  /** 单次调用 input 的总字符帽。 */
  inputCallCap?: number;
}

export const SEED_TOOL_CHAR_BUDGET = 24_000; // ≈9K token
const INPUT_FIELD_CAP = 300;
const INPUT_CALL_CAP = 600;

/** 平台在 tool 通道里说话时的署名。**只允许**出现在 tool_result.content 里(铁律 ②)。 */
const PLATFORM_TAG = "[平台·历史记录]";

/** D1:调用有、结果缺(轮被中断 / journal 写失败)。刻意不含任何可编造的数字。 */
const MISSING_RESULT_TEXT =
  `${PLATFORM_TAG} 这次调用的结果没有被记录(会话重载或上一轮被中断)。` +
  "不要据此推断结果;需要就重新调用。";

/** D4:预算耗尽时结果内容的最简形态。 */
const BUDGET_DROPPED_TEXT = `${PLATFORM_TAG} 更早的工具结果已不在上下文中,需要请重新调用工具读回。`;

type Blk = Record<string, unknown>;
type Role = "user" | "assistant";
type Kind = "text" | "results";
interface Draft {
  role: Role;
  kind: Kind;
  blocks: Blk[];
}

/** 还原过程中的降级计数(只进日志,不进模型上下文)。 */
export interface RestoreStats {
  toolUses: number;
  placeholders: number; // D1
  orphanResults: number; // D2
  namelessCalls: number; // D3
  budgetDegraded: number; // D4
  budgetDroppedCalls: number; // D4 兜底:整对删除
  strippedPairs: number; // D5
  recordEchoLines: number; // §6.1 存量污染清洗
}

// ─────────────────────────────────────────────────────────────────────────────────
// 遍 1:线性还原成草稿。不做任何修复,只保序 + 归通道。
// ─────────────────────────────────────────────────────────────────────────────────
function put(draft: Draft[], role: Role, kind: Kind, blk: Blk): void {
  const last = draft[draft.length - 1];
  if (last && last.role === role && last.kind === kind) {
    last.blocks.push(blk);
    return;
  }
  draft.push({ role, kind, blocks: [blk] });
}

function pass1(flat: FlatMessage[], stats: RestoreStats): Draft[] {
  const draft: Draft[] = [];
  for (const m of flat) {
    // ⚠️ 只认块数组形 content。backend FoldToMessages 的 error / research_state 事件 content 是
    //    **JSON 对象**(非数组)→ 天然跳过,不回喂模型。
    const blocks = Array.isArray(m.content) ? (m.content as Blk[]) : [];
    const textRole: Role = m.type === "assistant" || m.type === "tool_use" ? "assistant" : "user";
    for (const b of blocks) {
      if (!b || typeof b !== "object") continue;
      switch (b.type) {
        case "text": {
          if (typeof b.text !== "string" || !b.text) break;
          // 🔴 存量污染清洗:上一轮的伪造正文就躺在 journal 的 content_delta 里,原样重播 =
          //    继续喂 few-shot(线上 18 轮已在自我强化)。整行删除 —— 替换成「[平台已移除…]」
          //    本身又是一条 assistant 通道里的工具记录描述,等于换个模板继续教。
          const cleaned = stripRecordEcho(b.text);
          if (cleaned.length !== b.text.length) stats.recordEchoLines++;
          if (cleaned.trim()) put(draft, textRole, "text", { type: "text", text: cleaned });
          break;
        }
        case "tool_use":
          put(draft, "assistant", "text", {
            type: "tool_use",
            id: typeof b.id === "string" ? b.id : "",
            name: typeof b.name === "string" ? b.name : "",
            // 协议硬约束:input 必须是 object。缺省/非法一律补 {}(遍 4 会再截断)。
            input: b.input && typeof b.input === "object" && !Array.isArray(b.input) ? (b.input as Blk) : {},
          });
          break;
        case "tool_result":
          // ⚠️ 白名单构造:backend FoldToMessages 会往块里塞 `user_message`(线上 485/12,976 条有它),
          //    Anthropic 对块内不认识的字段直接 400。今天折成文本所以从没暴露过这个雷。
          put(draft, "user", "results", {
            type: "tool_result",
            tool_use_id: typeof b.tool_use_id === "string" ? b.tool_use_id : "",
            is_error: b.is_error === true,
            content: b.content,
          });
          break;
        // thinking:不是证据,且 DeepSeek 等回传会 400,不回喂(与既有行为一致)。
        // artifact / error / research_state:不回喂(与既有行为一致)。
        default:
          break;
      }
    }
  }
  return draft;
}

// ─────────────────────────────────────────────────────────────────────────────────
// 遍 2:配对修复。**全函数** —— 任何输入都产出合法结构,不存在「修不了就回落散文」的分支。
// ─────────────────────────────────────────────────────────────────────────────────
function placeholderResult(id: string): Blk {
  return {
    type: "tool_result",
    tool_use_id: id,
    // is_error 让模型倾向「重做」而不是「编个结果」。
    is_error: true,
    content: [{ type: "text", text: MISSING_RESULT_TEXT }],
  };
}

function pass2(drafts: Draft[], stats: RestoreStats): Draft[] {
  const out: Draft[] = [];
  let i = 0;
  while (i < drafts.length) {
    const d = drafts[i]!;
    if (d.role === "user" && d.kind === "results") {
      // D2:结果有、调用缺。整块丢弃 —— 没有 tool_use 就没有合法容器,凭空造一个 tool_use
      // 等于伪造模型动作(与 turnLoop 预检索刻意不手搓 tool_use 同一条纪律)。
      stats.orphanResults += d.blocks.length;
      i++;
      continue;
    }
    if (d.role === "user") {
      out.push(d);
      i++;
      continue;
    }
    // assistant:先剔除 D3(无 name 的 tool_use —— 没 name 上游必 400,也无法执行)。
    const kept: Blk[] = [];
    for (const b of d.blocks) {
      if (b.type === "tool_use" && !String(b.name ?? "")) {
        stats.namelessCalls++;
        continue;
      }
      kept.push(b);
    }
    i++;
    if (kept.length === 0) continue;
    const toolUses = kept.filter((b) => b.type === "tool_use");
    out.push({ role: "assistant", kind: "text", blocks: kept });
    stats.toolUses += toolUses.length;
    if (toolUses.length === 0) continue;

    // 紧随其后的 results 草稿(若有)被消费掉;否则整批补占位。
    let res: Blk[] = [];
    if (i < drafts.length && drafts[i]!.role === "user" && drafts[i]!.kind === "results") {
      res = drafts[i]!.blocks;
      i++;
    }
    const byId = new Map<string, Blk>();
    for (const r of res) {
      const id = String(r.tool_use_id ?? "");
      if (id && !byId.has(id)) byId.set(id, r);
    }
    // 🔴 结果**按 tool_use 顺序**排,不按 journal 到达序 —— DeepSeek 网关把多结果按前一条
    //    assistant 的 tool_calls 顺序渲染进 <tool_result>,错序即错配。
    const ordered: Blk[] = [];
    for (const tu of toolUses) {
      const id = String(tu.id ?? "");
      const r = id ? byId.get(id) : undefined;
      if (r) {
        byId.delete(id);
        ordered.push(r);
      } else {
        stats.placeholders++;
        ordered.push(placeholderResult(id));
      }
    }
    stats.orphanResults += byId.size; // id 对不上前一条 assistant 的:丢弃
    out.push({ role: "user", kind: "results", blocks: ordered });
  }

  // 首条必须是 user(Anthropic 硬约束)。丢弃前导的 assistant。
  // 注:此处不可能丢掉 results —— results 只在 assistant 之后被产出。
  while (out.length > 0 && out[0]!.role !== "user") out.shift();
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────────
// 遍 3:id 重铸(tu_1..tu_n,两侧同时改写)。
// 线上 id 是 DeepSeek 网关给的 call_<24hex>;跨道跨厂商无统一规范,且会话中途可能切模型 /
// failover。重铸是零成本的抗风险动作,顺带消掉「空 id」「重复 id」两类隐患。
// 遍 2 已保证结果与调用**位置对齐、数量相等**,故这里按位赋值即可(不依赖旧 id)。
// ─────────────────────────────────────────────────────────────────────────────────
function pass3(drafts: Draft[]): void {
  let n = 0;
  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i]!;
    if (d.role !== "assistant") continue;
    const toolUses = d.blocks.filter((b) => b.type === "tool_use");
    if (toolUses.length === 0) continue;
    const ids = toolUses.map(() => `tu_${++n}`);
    toolUses.forEach((b, k) => (b.id = ids[k]));
    const next = drafts[i + 1];
    if (next && next.role === "user" && next.kind === "results") {
      next.blocks.forEach((b, k) => {
        if (k < ids.length) b.tool_use_id = ids[k];
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────────
// 遍 4:预算。默认策略 = 结构全还原 + 内容仍是摘要(今天的字节,换个信封)。
// ─────────────────────────────────────────────────────────────────────────────────

// E-id 直接从 tool_result **正文**里取:账本 annotate() 入账时已把 evidence_id 逐条盖进这条
// tool_result,journal 存的就是盖过章的那一份 ⇒「这次调用入账了哪些 E」是记录自带的事实,
// 不需要跨表匹配或推断(推出来的 E-id 就是新的一种编造)。用正则而非 JSON.parse:结果可能被
// capToolResult 截成非法 JSON,截断了就少认几个,不会整条失效。
const EVIDENCE_ID_RE = /"evidence_id"\s*:\s*"(E\d+)"/g;

function extractEvidenceIds(content: unknown): string[] {
  const text = flattenToolResultText(content);
  const seen = new Set<string>();
  for (const m of text.matchAll(EVIDENCE_ID_RE)) seen.add(m[1]!);
  return [...seen];
}

/** 连续的 E 编号压成区间(E1–E16),否则逐条列(多于 8 条只列前 8 + 总数)。 */
function renderIds(ids: string[]): string {
  if (ids.length === 0) return "";
  const nums = ids.map((id) => Number(/^E(\d+)$/.exec(id)?.[1] ?? NaN));
  if (nums.length > 2 && nums.every((n) => Number.isFinite(n))) {
    const sorted = [...nums].sort((a, b) => a - b);
    if (sorted.every((n, i) => i === 0 || n === sorted[i - 1]! + 1)) {
      return `E${sorted[0]}–E${sorted[sorted.length - 1]}`;
    }
  }
  return ids.length <= 8 ? ids.join("、") : ids.slice(0, 8).join("、") + `…(共 ${ids.length} 条)`;
}

/** 把一条真实 tool_result 的 content 换成摘要(默认策略:不回喂原文)。 */
function digestResult(blk: Blk): string {
  const raw = blk.content;
  const outcome = summarizeToolOutcome({ content: raw, is_error: blk.is_error === true });
  const ids = extractEvidenceIds(raw);
  const tail = ids.length > 0 ? `;已入证据账本 ${renderIds(ids)}` : "";
  return `${PLATFORM_TAG} ${outcome}${tail}。原文已不在上下文中,需要请用 EvidenceGet / Read 读回。`;
}

function truncInput(input: Blk, fieldCap: number, callCap: number): Blk {
  const out: Blk = {};
  let used = 0;
  for (const [k, v] of Object.entries(input)) {
    if (used >= callCap) break;
    let nv: unknown = v;
    if (typeof v === "string") {
      const cap = Math.min(fieldCap, callCap - used);
      nv = v.length > cap ? v.slice(0, cap) + "…[已截断]" : v;
    } else {
      // 非字符串值原样保留(number/bool/小对象);超大结构走 JSON 长度记账,过大则丢字段。
      let len = 0;
      try {
        len = JSON.stringify(v).length;
      } catch {
        continue;
      }
      if (len > callCap - used) continue;
    }
    out[k] = nv;
    try {
      used += JSON.stringify(nv).length + k.length + 4;
    } catch {
      used += fieldCap;
    }
  }
  return out;
}

function blkChars(b: Blk): number {
  try {
    return JSON.stringify(b).length;
  } catch {
    return 0;
  }
}

interface Call {
  use: Blk;
  result: Blk;
  useIn: Draft;
  resIn: Draft;
  level: number;
}

function pass4(drafts: Draft[], opts: Required<RestoreOptions>, stats: RestoreStats): void {
  const calls: Call[] = [];
  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i]!;
    if (d.role !== "assistant") continue;
    const toolUses = d.blocks.filter((b) => b.type === "tool_use");
    if (toolUses.length === 0) continue;
    const next = drafts[i + 1];
    const resIn = next && next.role === "user" && next.kind === "results" ? next : undefined;
    const res = resIn ? resIn.blocks : [];
    toolUses.forEach((use, k) => {
      const result = res[k];
      if (result && resIn) calls.push({ use, result, useIn: d, resIn, level: 0 });
    });
  }

  // level 0:input 逐字段截断;result content 换摘要(占位结果保持原文)。
  for (const c of calls) {
    c.use.input = truncInput((c.use.input as Blk) ?? {}, opts.inputFieldCap, opts.inputCallCap);
    const isPlaceholder =
      Array.isArray(c.result.content) &&
      (c.result.content as Blk[])[0]?.text === MISSING_RESULT_TEXT;
    if (!isPlaceholder) {
      c.result.content = [{ type: "text", text: digestResult(c.result) }];
    }
  }

  // ⚠️ level 4 会把整对从草稿里摘掉;记账必须同步排除(level>=4 记 0),否则 total 永不下降,
  //    循环会一路把**所有**调用删光(实测:252 次调用全被删,kept=0)。
  const total = () => calls.reduce((s, c) => (c.level >= 4 ? s : s + blkChars(c.use) + blkChars(c.result)), 0);
  if (total() <= opts.toolCharBudget) return;

  // 从**最老**往最新逐级降级。按块降级而不是按字符裁:Anthropic 的结构约束落在块上,
  // 裁字符可能裁出非法 JSON / 破坏配对,裁块永远是合法的(与 context-budget.pruneOldToolResults
  // 「截 tool_result 正文但保留块结构」同一条纪律)。
  for (let level = 1; level <= 4; level++) {
    for (const c of calls) {
      if (total() <= opts.toolCharBudget) return;
      if (c.level >= level) continue;
      c.level = level;
      stats.budgetDegraded++;
      if (level === 1) {
        // input 降到「一个字段、120 字符」的信息量(≈ 旧折行 describeToolCall 的产物)。
        const digest = describeToolCall(c.use.input, 120);
        const first = Object.entries((c.use.input as Blk) ?? {})[0];
        c.use.input = first && digest ? { [first[0]]: String(first[1]).slice(0, 120) } : {};
      } else if (level === 2) {
        c.result.content = [{ type: "text", text: BUDGET_DROPPED_TEXT }];
      } else if (level === 3) {
        c.use.input = {};
      } else {
        // ⚠️ level 4:**整对**删除(tool_use + 它的 tool_result 一起)。
        //
        // 这是唯一会删掉结构的一级,写清楚为什么必须有它:tool_use/tool_result 的**信封本身**
        //(type/id/name + type/tool_use_id/is_error/一句降级文本)约 210 字符/次,不可再压。
        // 线上最坏的会话在 30 轮 seed 窗口里有 252 次调用 ⇒ 结构地板 ≈ 53K 字符 ≈ 20K token,
        // 已经超过整个工具面预算。level 1-3 只能压内容,压不动地板 ⇒ 没有 level 4 的话
        // 「预算」这个词在最坏会话上是假的(旧折叠同样无界:252 次 × ~300 字符 = 75.6K)。
        //
        // 删「一对」而不是「降级成文字」:整对删除后结构仍然合法(D5 同款动作),
        // 而任何形式的文字化都会把模板还给模型 —— 那正是本次故障的根因(铁律 ①)。
        // 从**最老**往新删,保住与当前提问最相关的那批调用。
        const iu = c.useIn.blocks.indexOf(c.use);
        if (iu >= 0) c.useIn.blocks.splice(iu, 1);
        const ir = c.resIn.blocks.indexOf(c.result);
        if (ir >= 0) c.resIn.blocks.splice(ir, 1);
        stats.budgetDroppedCalls++;
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────────
// 自检:便宜且总跑。不通过 → D5(剥掉出问题的相邻对的工具块),**绝不**退化成散文。
// ─────────────────────────────────────────────────────────────────────────────────
const TOOL_USE_KEYS = new Set(["type", "id", "name", "input"]);
const TOOL_RESULT_KEYS = new Set(["type", "tool_use_id", "is_error", "content"]);

/** 返回第一处违规的 assistant 下标;-1 = 合法。 */
export function findPairingViolation(msgs: Anthropic.MessageParam[]): number {
  if (msgs.length === 0) return -1;
  if (msgs[0]!.role !== "user") return 0;
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i]!;
    const blocks = Array.isArray(m.content) ? (m.content as unknown as Blk[]) : [];
    if (m.role === "assistant") {
      const uses = blocks.filter((b) => b.type === "tool_use");
      for (const u of uses) {
        if (!u.id || !u.name || !u.input || typeof u.input !== "object") return i;
        for (const k of Object.keys(u)) if (!TOOL_USE_KEYS.has(k)) return i;
      }
      if (uses.length === 0) continue;
      const next = msgs[i + 1];
      const nb = next && Array.isArray(next.content) ? (next.content as unknown as Blk[]) : [];
      if (!next || next.role !== "user") return i;
      const results = nb.filter((b) => b.type === "tool_result");
      if (results.length !== uses.length) return i;
      // tool_result 必须在 user content 的最前面,且按 tool_use 顺序一一对上。
      for (let k = 0; k < results.length; k++) {
        if (nb[k] !== results[k]) return i;
        if (results[k]!.tool_use_id !== uses[k]!.id) return i;
        for (const key of Object.keys(results[k]!)) if (!TOOL_RESULT_KEYS.has(key)) return i;
      }
    } else {
      // user 里出现 tool_result,但前一条不是带 tool_use 的 assistant → 非法。
      if (!blocks.some((b) => b.type === "tool_result")) continue;
      const prev = msgs[i - 1];
      const pb = prev && Array.isArray(prev.content) ? (prev.content as unknown as Blk[]) : [];
      if (!prev || prev.role !== "assistant" || !pb.some((b) => b.type === "tool_use")) return i;
    }
  }
  return -1;
}

function stripToolsAt(msgs: Anthropic.MessageParam[], idx: number): Anthropic.MessageParam[] {
  const out = msgs.slice();
  const at = out[idx];
  if (at && Array.isArray(at.content)) {
    const kept = (at.content as unknown as Blk[]).filter((b) => b.type !== "tool_use" && b.type !== "tool_result");
    if (kept.length === 0) out.splice(idx, 1);
    else out[idx] = { role: at.role, content: kept as unknown as Anthropic.MessageParam["content"] };
  }
  // 紧随的 results 消息一并剥掉(它失去了容器)。
  const nxt = out[idx + 1];
  if (nxt && nxt.role === "user" && Array.isArray(nxt.content)) {
    const kept = (nxt.content as unknown as Blk[]).filter((b) => b.type !== "tool_result");
    if (kept.length === 0) out.splice(idx + 1, 1);
    else out[idx + 1] = { role: "user", content: kept as unknown as Anthropic.MessageParam["content"] };
  }
  return out;
}

// normalize:草稿 → messages。丢空草稿(遍 4 的整对删除会掏空一些),再合并相邻同 role 的消息。
// 合并时 **tool_result 块一律排在最前** —— Anthropic 要求 tool_result 位于 user content 的开头。
function normalize(drafts: Draft[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const d of drafts) {
    if (d.blocks.length === 0) continue;
    const last = out[out.length - 1];
    if (last && last.role === d.role && Array.isArray(last.content)) {
      const merged = [...(last.content as unknown as Blk[]), ...d.blocks];
      merged.sort((a, b) => Number(b.type === "tool_result") - Number(a.type === "tool_result"));
      out[out.length - 1] = { role: d.role, content: merged as unknown as Anthropic.MessageParam["content"] };
      continue;
    }
    out.push({ role: d.role, content: d.blocks as unknown as Anthropic.MessageParam["content"] });
  }
  while (out.length > 0 && out[0]!.role !== "user") out.shift();
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────────
// 主入口
// ─────────────────────────────────────────────────────────────────────────────────
export function restoreHistory(
  flat: FlatMessage[],
  opts: RestoreOptions = {},
): { messages: Anthropic.MessageParam[]; stats: RestoreStats } {
  const stats: RestoreStats = {
    toolUses: 0,
    placeholders: 0,
    orphanResults: 0,
    namelessCalls: 0,
    budgetDegraded: 0,
    budgetDroppedCalls: 0,
    strippedPairs: 0,
    recordEchoLines: 0,
  };
  const resolved: Required<RestoreOptions> = {
    toolCharBudget: opts.toolCharBudget ?? SEED_TOOL_CHAR_BUDGET,
    inputFieldCap: opts.inputFieldCap ?? INPUT_FIELD_CAP,
    inputCallCap: opts.inputCallCap ?? INPUT_CALL_CAP,
  };

  const drafts = pass2(pass1(flat, stats), stats);
  pass3(drafts);
  pass4(drafts, resolved, stats);

  let messages: Anthropic.MessageParam[] = normalize(drafts);

  // 自检 + D5。有界循环:每轮至少剥掉一处工具块,故必然收敛。
  for (let guard = 0; guard < drafts.length + 2; guard++) {
    const bad = findPairingViolation(messages);
    if (bad < 0) break;
    stats.strippedPairs++;
    log.error("seed_restore: pairing violation (D5 strip)", { index: bad, total: messages.length });
    const before = messages.length;
    messages = stripToolsAt(messages, bad);
    if (messages.length === before && bad === 0 && messages[0]?.role !== "user") messages.shift();
  }
  // 最后一次仍不合法(不应发生)→ 整体剥掉工具块,退化成 2026-08-02 之前的「无工具历史」。
  // **明确拒绝**「退化成散文」这个选项。
  if (findPairingViolation(messages) >= 0) {
    log.error("seed_restore: unrecoverable, stripping all tool blocks", { total: messages.length });
    messages = messages
      .map((m) => ({
        role: m.role,
        content: (Array.isArray(m.content) ? (m.content as unknown as Blk[]) : []).filter(
          (b) => b.type !== "tool_use" && b.type !== "tool_result",
        ) as unknown as Anthropic.MessageParam["content"],
      }))
      .filter((m) => Array.isArray(m.content) && (m.content as unknown[]).length > 0);
    while (messages.length > 0 && messages[0]!.role !== "user") messages.shift();
  }

  return { messages, stats };
}

/** 生产入口(ws.ts seed_history)。保持旧签名,内部走结构还原。 */
export function convertFlatToAnthropic(flat: FlatMessage[], opts?: RestoreOptions): Anthropic.MessageParam[] {
  const { messages, stats } = restoreHistory(flat, opts);
  if (stats.toolUses > 0 || stats.recordEchoLines > 0) {
    log.info("seed_restore", { messages: messages.length, ...stats });
  }
  return messages;
}
