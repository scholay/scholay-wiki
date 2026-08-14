// 冷重播**结构还原**的回归测试(2026-08-08 幻影工具链根治)。
//
// 被测的是那条唯一根因:旧版把历史 tool_use 折成 assistant 通道的一行文本
// `【已调用 Read file_path="scheme_v2.md"】返回 2926 字符`,模型照抄它伪造整条工具链。
// 这里钉死的不变量按重要性排:
//   ① 通道不变式 —— 输出的 assistant 通道里**一个字**都不描述工具调用(这条一红 = 根因复活);
//   ② 协议合法性 —— 任意对抗输入都产出可发上游的结构(孤儿/乱序/空 id/未知字段/以 assistant 开头);
//   ③ 存量污染清洗 —— journal 里已有的伪造正文不被原样重播回去;
//   ④ 两条道可翻译 —— Anthropic 原生道与 openai adapter 都能吃这份输出。
//
// fixture 全部是线上原样字节(见 __fixtures__/prodPhantomTurns.ts 头注释)。

import { test, expect, describe } from "bun:test";
import type Anthropic from "@anthropic-ai/sdk";
import {
  convertFlatToAnthropic,
  restoreHistory,
  findPairingViolation,
  type FlatMessage,
} from "./replayHistory.ts";
import { isTurnStart } from "../turn/window.ts";
import { detectPhantomToolNarration } from "../turn/toolRecord.ts";
import { toOpenAIMessages } from "../openai/adapter.ts";
import { T2408_TEXT, T2409_TEXT, T2417_TEXT } from "./__fixtures__/prodPhantomTurns.ts";

type Blk = Record<string, unknown>;

function blocksOf(msgs: Anthropic.MessageParam[]): Blk[] {
  return msgs.flatMap((m) => (Array.isArray(m.content) ? (m.content as unknown as Blk[]) : []));
}
/** 输出里模型能读到的 **assistant 通道**全文 —— 通道不变式的判据面。 */
function assistantText(msgs: Anthropic.MessageParam[]): string {
  return msgs
    .filter((m) => m.role === "assistant")
    .flatMap((m) => (Array.isArray(m.content) ? (m.content as unknown as Blk[]) : []))
    .filter((b) => b.type === "text")
    .map((b) => String(b.text ?? ""))
    .join("\n");
}
function toolUses(msgs: Anthropic.MessageParam[]): Blk[] {
  return blocksOf(msgs).filter((b) => b.type === "tool_use");
}
function toolResults(msgs: Anthropic.MessageParam[]): Blk[] {
  return blocksOf(msgs).filter((b) => b.type === "tool_result");
}
function resultText(b: Blk): string {
  const c = b.content;
  return Array.isArray(c) ? (c as Blk[]).map((x) => String(x.text ?? "")).join("") : String(c ?? "");
}

// ─── 线上原样片段(会话 f3144700 · turn 2361 的一个真实并行批) ───────────────────────
// 三次 search_papers 同批发出(ev_seq 88/90/92,id call_00/call_01/call_02),
// 结果**逆序**回来(ev_seq 96=call_02 → 97=call_01 → 98=call_00)。
// 这正是「按 journal 到达序配对会错配」的生产实证。
const PARALLEL_USES: FlatMessage[] = [
  {
    type: "tool_use",
    content: [
      {
        type: "tool_use",
        id: "call_00_oSAsYaA95cykUxZr0qm59969",
        name: "mcp__minicod__search_papers",
        input: { sort: "relevance", limit: 8, query: "childhood obesity puberty timing", source: "pubmed", year_from: 2018 },
      },
    ],
  },
  {
    type: "tool_use",
    content: [
      {
        type: "tool_use",
        id: "call_01_fjf0Ncl2UCQGEcqqtWJj1814",
        name: "mcp__minicod__search_papers",
        input: { sort: "citations", limit: 8, query: "childhood obesity adiposity puberty onset", source: "semantic", year_from: 2018 },
      },
    ],
  },
  {
    type: "tool_use",
    content: [
      {
        type: "tool_use",
        id: "call_02_CvfjzPoLLxzUmwGkm3B39965",
        name: "mcp__minicod__search_papers",
        input: { limit: 5, query: "metabolically healthy obesity puberty timing children", source: "pubmed", year_from: 2015 },
      },
    ],
  },
];
const RESULT_02: FlatMessage = {
  type: "tool_result",
  content: [
    {
      type: "tool_result",
      tool_use_id: "call_02_CvfjzPoLLxzUmwGkm3B39965",
      isError: false,
      content: [{ type: "text", text: '{\n  "items": [],\n  "total": 0,\n  "limit": 5,\n  "sources_queried": ["pmd"]\n}' }],
    },
  ],
};
const RESULT_01: FlatMessage = {
  type: "tool_result",
  content: [
    {
      type: "tool_result",
      tool_use_id: "call_01_fjf0Ncl2UCQGEcqqtWJj1814",
      content: [
        {
          type: "text",
          text: JSON.stringify({
            items: [
              { paperId: "p1", title: "T1", evidence_id: "E1" },
              { paperId: "p2", title: "T2", evidence_id: "E2" },
            ],
            _evidence: { query_id: "q1", new: 2, dup: 0, ledger_total: 2 },
          }),
        },
      ],
    },
  ],
};
const RESULT_00: FlatMessage = {
  type: "tool_result",
  content: [
    {
      type: "tool_result",
      tool_use_id: "call_00_oSAsYaA95cykUxZr0qm59969",
      content: [{ type: "text", text: JSON.stringify({ items: [{ paperId: "p3", evidence_id: "E3" }] }) }],
      // 🔴 backend FoldToMessages 会塞这个字段(线上 485/12,976 条有它)。
      //    Anthropic 对块内不认识的字段直接 400 —— 今天折成文本所以从没暴露过。
      user_message: "文献检索暂时失败,AI 会调整检索方式重试。",
    },
  ],
};

const ASK: FlatMessage = { type: "user", content: [{ type: "text", text: "帮我查儿童肥胖与青春期启动" }] };
const ANSWER: FlatMessage = { type: "assistant", content: [{ type: "text", text: "我检索了 3 组关键词。" }] };

// ─────────────────────────────────────────────────────────────────────────────────
describe("① 通道不变式(根因判据 —— 这条一红就是幻影工具链复活)", () => {
  test("历史工具调用只出现在 tool_use / tool_result 通道,assistant 通道零工具描述", () => {
    const out = convertFlatToAnthropic([ASK, ...PARALLEL_USES, RESULT_02, RESULT_01, RESULT_00, ANSWER]);
    expect(toolUses(out).length).toBe(3);
    expect(toolResults(out).length).toBe(3);
    // assistant 通道里只有模型自己写过的那句话,没有任何平台生成的记录行。
    expect(assistantText(out)).toBe("我检索了 3 组关键词。");
    expect(detectPhantomToolNarration(assistantText(out)).count).toBe(0);
  });

  test("平台的降级说明只落在 tool_result 通道(模型写不了的通道)", () => {
    const out = convertFlatToAnthropic([ASK, PARALLEL_USES[0]!]); // 孤儿调用
    expect(assistantText(out)).not.toContain("平台");
    expect(resultText(toolResults(out)[0]!)).toContain("[平台·历史记录]");
  });

  test("旧模板的两个字符串在输出里彻底绝迹(它们就是模型照抄的模板)", () => {
    const out = convertFlatToAnthropic([ASK, ...PARALLEL_USES, RESULT_02, RESULT_01, RESULT_00, ANSWER]);
    const all = JSON.stringify(out);
    expect(all).not.toContain("【已调用");
    expect(all).not.toContain("〔平台记录·历史工具调用〕");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────
describe("② 协议合法性(上游 400 在结构上不可能)", () => {
  test("并行批:结果按 tool_use 顺序重排,不按 journal 到达序(线上 turn 2361 逆序回包)", () => {
    const out = convertFlatToAnthropic([ASK, ...PARALLEL_USES, RESULT_02, RESULT_01, RESULT_00]);
    const uses = toolUses(out);
    const res = toolResults(out);
    expect(uses.map((u) => u.id)).toEqual(["tu_1", "tu_2", "tu_3"]);
    expect(res.map((r) => r.tool_use_id)).toEqual(["tu_1", "tu_2", "tu_3"]);
    // tu_3(原 call_02)的结果必须是那条 total:0 的空结果,不能被逆序错配成 call_00 的。
    expect(resultText(res[2]!)).toContain("命中 0 条");
    expect(resultText(res[1]!)).toContain("E1、E2"); // 原 call_01 带 evidence 图章
  });

  test("user_message 等未知字段被白名单剥掉(不剥则上游 400)", () => {
    const out = convertFlatToAnthropic([ASK, PARALLEL_USES[0]!, RESULT_00]);
    for (const r of toolResults(out)) {
      expect(Object.keys(r).sort()).toEqual(["content", "is_error", "tool_use_id", "type"]);
    }
    expect(JSON.stringify(out)).not.toContain("文献检索暂时失败");
  });

  test("D1 孤儿 tool_use:补 is_error 占位,且占位文本不含任何可编造的数字", () => {
    const { messages, stats } = restoreHistory([ASK, PARALLEL_USES[0]!, PARALLEL_USES[1]!, RESULT_01]);
    expect(stats.placeholders).toBe(1);
    const res = toolResults(messages);
    expect(res.length).toBe(2);
    expect(res[0]!.is_error).toBe(true);
    expect(resultText(res[0]!)).toContain("没有被记录");
    expect(resultText(res[0]!)).not.toMatch(/\d+\s*(条|字符|篇)/);
  });

  test("D2 孤儿 tool_result(无对应调用)整块丢弃,绝不凭空造一个 tool_use 当容器", () => {
    const { messages, stats } = restoreHistory([ASK, RESULT_01, ANSWER]);
    expect(stats.orphanResults).toBe(1);
    expect(toolResults(messages).length).toBe(0);
    expect(toolUses(messages).length).toBe(0);
    expect(findPairingViolation(messages)).toBe(-1);
  });

  test("D3 无 name 的 tool_use 丢弃(上游必 400,且无法执行)", () => {
    const bad: FlatMessage = { type: "tool_use", content: [{ type: "tool_use", id: "x", input: {} }] };
    const { messages, stats } = restoreHistory([ASK, bad, ANSWER]);
    expect(stats.namelessCalls).toBe(1);
    expect(toolUses(messages).length).toBe(0);
  });

  test("首条不是 user 时丢弃前导 assistant(Anthropic 硬约束)", () => {
    const out = convertFlatToAnthropic([ANSWER, ASK, ANSWER]);
    expect(out[0]!.role).toBe("user");
  });

  test("id 重铸:空 id / 重复 id / 跨厂商 id 形态全部收敛成 tu_N,两侧同时改写", () => {
    const dupA: FlatMessage = {
      type: "tool_use",
      content: [{ type: "tool_use", id: "", name: "Read", input: { file_path: "a.md" } }],
    };
    const dupB: FlatMessage = {
      type: "tool_use",
      content: [{ type: "tool_use", id: "", name: "Read", input: { file_path: "b.md" } }],
    };
    const out = convertFlatToAnthropic([ASK, dupA, dupB]);
    expect(toolUses(out).map((u) => u.id)).toEqual(["tu_1", "tu_2"]);
    expect(toolResults(out).map((r) => r.tool_use_id)).toEqual(["tu_1", "tu_2"]);
    expect(findPairingViolation(out)).toBe(-1);
  });

  // 属性测试:对抗构造 200 例,输出必须永远合法。方案要求「不存在修不了就回落散文的分支」。
  test("fuzz 200 例对抗输入:输出永远通过 findPairingViolation,且 assistant 通道零工具描述", () => {
    let rng = 20260808;
    const rand = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)]!;
    const ids = ["", "a", "a", "b", "call_00_x", "很长".repeat(20)];
    for (let n = 0; n < 200; n++) {
      const flat: FlatMessage[] = [];
      const len = 1 + Math.floor(rand() * 12);
      for (let i = 0; i < len; i++) {
        const kind = Math.floor(rand() * 6);
        if (kind === 0) flat.push({ type: "user", content: [{ type: "text", text: "问 " + n }] });
        else if (kind === 1) flat.push({ type: "assistant", content: [{ type: "text", text: "答 " + n }] });
        else if (kind === 2)
          flat.push({ type: "tool_use", content: [{ type: "tool_use", id: pick(ids), name: pick(["Read", "Bash", ""]), input: rand() > 0.5 ? { q: "x" } : null }] });
        else if (kind === 3)
          flat.push({ type: "tool_result", content: [{ type: "tool_result", tool_use_id: pick(ids), content: [{ type: "text", text: "r" }], user_message: "脱敏摘要" }] });
        else if (kind === 4) flat.push({ type: "assistant", content: [{ type: "thinking", thinking: "内部推理" }] });
        else flat.push({ type: "error", content: { code: "upstream", message: "boom" } });
      }
      const out = convertFlatToAnthropic(flat);
      expect(findPairingViolation(out), `fuzz #${n}`).toBe(-1);
      expect(detectPhantomToolNarration(assistantText(out)).count, `fuzz #${n}`).toBe(0);
      expect(JSON.stringify(out)).not.toContain("脱敏摘要");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────
describe("③ 存量污染清洗(journal 里已经躺着 18 轮伪造正文)", () => {
  const phantomTurn = (text: string): FlatMessage[] => [
    { type: "user", content: [{ type: "text", text: "把摘要列删掉再导出 Word" }] },
    { type: "assistant", content: [{ type: "text", text }] },
  ];

  test("turn 2417 原文(11 步伪造工具链)重播后记录行归零,真实结论段完整保留", () => {
    const out = convertFlatToAnthropic(phantomTurn(T2417_TEXT));
    const t = assistantText(out);
    expect(detectPhantomToolNarration(T2417_TEXT).count).toBe(11); // 线上原文确实有 11 条
    expect(detectPhantomToolNarration(t).count).toBe(0);
    expect(t).toContain("抱歉，马上处理");
    expect(t).toContain("v3.1 最终版修改摘要"); // 表格等真实正文不被误伤
    expect(t).not.toContain("PYEOF"); // 写在【…】闭合区间内的整段 Python heredoc 一并删掉
  });

  test("turn 2408 / 2409 原文同样被洗掉", () => {
    expect(detectPhantomToolNarration(assistantText(convertFlatToAnthropic(phantomTurn(T2408_TEXT)))).count).toBe(0);
    expect(detectPhantomToolNarration(assistantText(convertFlatToAnthropic(phantomTurn(T2409_TEXT)))).count).toBe(0);
  });

  test("清洗计数进 stats(可在 seed_restore 日志里看到污染面)", () => {
    const { stats } = restoreHistory(phantomTurn(T2417_TEXT));
    expect(stats.recordEchoLines).toBe(1); // 一条 assistant 消息被清洗过
  });

  // 🔴 覆盖不全,如实钉死:清洗只认【已调用 X …】这一个形状。2417 里那些**不在括号里**的
  //    伪造陈述(「查阅了 34 篇文献 / 调用了 11 次检索工具」「让我用 Python 来做这个删除操作」)
  //    不匹配任何模板,会继续作为正文重播 —— 这正是运行时检出器 + turnLoop 纠偏必须保留的原因。
  test("如实边界:散文式伪造的残句清洗抓不到(这是检出器必须保留的原因)", () => {
    const t = assistantText(convertFlatToAnthropic(phantomTurn(T2417_TEXT)));
    expect(t).toContain("查阅了 34 篇文献 / 调用了 11 次检索工具");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────
describe("④ 两条道可翻译 + 与压缩/回合计数的协同", () => {
  test("openai adapter:每条 role:tool 的 tool_call_id 都能在紧邻的前一条 assistant 里找到", () => {
    const out = convertFlatToAnthropic([ASK, ...PARALLEL_USES, RESULT_02, RESULT_01, RESULT_00, ANSWER]);
    const oa = toOpenAIMessages("sys", out);
    let declared = new Set<string>();
    for (const m of oa) {
      if (m.role === "assistant") {
        declared = new Set(((m as { tool_calls?: { id: string }[] }).tool_calls ?? []).map((c) => c.id));
      } else if (m.role === "tool") {
        const id = (m as { tool_call_id?: string }).tool_call_id ?? "";
        expect(declared.has(id), `orphan tool_call_id ${id}`).toBe(true);
      }
    }
    expect(oa.filter((m) => m.role === "tool").length).toBe(3);
  });

  test("回合起点计数不被 tool_result 消息污染(window/compact 的 keepTurns 口径)", () => {
    const out = convertFlatToAnthropic([
      ASK,
      ...PARALLEL_USES,
      RESULT_02,
      RESULT_01,
      RESULT_00,
      ANSWER,
      { type: "user", content: [{ type: "text", text: "第二轮提问" }] },
      ANSWER,
    ]);
    expect(out.filter(isTurnStart).length).toBe(2);
    // 冷路径与热路径同形:tool_result 回合是含 tool_result 块的 user 消息 → 非起点。
    expect(out.some((m) => m.role === "user" && !isTurnStart(m))).toBe(true);
  });

  test("thinking 块仍不回喂(不是证据,且 DeepSeek 回传会 400)", () => {
    const out = convertFlatToAnthropic([
      ASK,
      { type: "assistant", content: [{ type: "thinking", thinking: "内部推理" }, { type: "text", text: "正文" }] },
    ]);
    expect(assistantText(out)).toBe("正文");
    expect(JSON.stringify(out)).not.toContain("内部推理");
  });

  test("error / research_state(content 为 JSON 对象而非块数组)天然跳过", () => {
    const out = convertFlatToAnthropic([ASK, { type: "error", content: { code: "upstream", message: "boom" } }]);
    expect(JSON.stringify(out)).not.toContain("boom");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────
describe("⑤ 预算(结构永远还原,内容按预算降级)", () => {
  const bigSession = (n: number): FlatMessage[] => {
    const flat: FlatMessage[] = [{ type: "user", content: [{ type: "text", text: "开始" }] }];
    for (let i = 0; i < n; i++) {
      flat.push({
        type: "tool_use",
        content: [{ type: "tool_use", id: `c${i}`, name: "mcp__minicod__search_papers", input: { query: "x".repeat(400), limit: 20 } }],
      });
      flat.push({
        type: "tool_result",
        content: [{ type: "tool_result", tool_use_id: `c${i}`, content: [{ type: "text", text: JSON.stringify({ items: new Array(20).fill({ title: "y".repeat(200) }) }) }] }],
      });
    }
    return flat;
  };

  test("小会话(20 次调用):内容降级即可入预算,252 次调用的结构一个不删", () => {
    const { messages, stats } = restoreHistory(bigSession(20));
    expect(toolUses(messages).length).toBe(20);
    expect(stats.budgetDroppedCalls).toBe(0); // 内容压得下来就不动结构
    expect(findPairingViolation(messages)).toBe(-1);
  });

  // 🔴 诚实边界:tool_use/tool_result 的**信封本身**约 210 字符/次不可再压,
  //    线上最坏会话 252 次调用 ⇒ 结构地板 ≈ 53K 字符 > 整个工具面预算。
  //    没有「整对删除」这一级,「预算」在最坏会话上就是个假词(旧折叠同样无界:75.6K 字符)。
  test("线上最坏量级(252 次调用):整对删除兜底,总量真的有界,且输出仍合法", () => {
    const { messages, stats } = restoreHistory(bigSession(252));
    expect(stats.budgetDroppedCalls).toBeGreaterThan(0);
    expect(toolUses(messages).length).toBe(252 - stats.budgetDroppedCalls);
    expect(toolUses(messages).length).toBe(toolResults(messages).length); // 删的是「对」不是单边
    const chars = JSON.stringify(messages).length;
    expect(chars).toBeLessThan(24_000 + 8_000); // 预算 + 信封常数
    expect(findPairingViolation(messages)).toBe(-1);
    // 保留的必须是**最新**那批(与当前提问最相关)。
    const kept = toolUses(messages).length;
    expect(kept).toBeGreaterThan(50);
    // 删除后 assistant 通道依然零工具描述 —— 删掉的调用不会变成一句话。
    expect(detectPhantomToolNarration(assistantText(messages)).count).toBe(0);
  });

  test("默认策略:结果内容是摘要不是原文(全量回喂 = 30 轮窗口 102K token,永远不开)", () => {
    const out = convertFlatToAnthropic(bigSession(2));
    for (const r of toolResults(out)) expect(resultText(r).length).toBeLessThan(400);
    expect(JSON.stringify(out)).not.toContain("y".repeat(200));
  });

  test("预算内的小会话:input 保留、结果带条数与 E-id,信息量不低于旧折行", () => {
    const out = convertFlatToAnthropic([ASK, PARALLEL_USES[1]!, RESULT_01]);
    const u = toolUses(out)[0]!;
    expect((u.input as Blk).query).toContain("childhood obesity");
    expect(resultText(toolResults(out)[0]!)).toContain("命中 2 条");
    expect(resultText(toolResults(out)[0]!)).toContain("E1、E2");
  });
});
