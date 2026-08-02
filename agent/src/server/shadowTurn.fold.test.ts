// 冷重播历史折叠(2026-08 证据账本 P0 · 根因修复)的回归测试。
//
// 被测的是**根因那一行**:旧版 `blocks.filter(b => b.type === "text")` 把 100% 的
// tool_use/tool_result 丢弃且零标记 —— 会话闲置 30 分钟或容器重启后重灌,模型只剩自己
// 「我检索了 16 篇」的散文而看不到任何证据。这里钉死四条不变量:
//   ① 工具调用不再消失,折成一行(工具名 + 关键入参 + 结果规模);
//   ② E-id 只来自 tool_result 自带的 evidence_id 图章,取不到就不标(不推断、不编);
//   ③ 失败的工具结果折成「失败」,绝不折成成功;
//   ④ tool_result 消息本身不产出新消息 —— 否则凭空多出「回合起点」,打乱 window/compact 的回合计数。

import { test, expect, describe } from "bun:test";
import { convertFlatToAnthropic, type FlatMessage } from "./shadowTurn.ts";
import { isTurnStart } from "../turn/window.ts";
import { describeToolCall, summarizeToolOutcome } from "../turn/compact.ts";

function textOf(msgs: ReturnType<typeof convertFlatToAnthropic>): string {
  return msgs
    .flatMap((m) => (Array.isArray(m.content) ? (m.content as Array<{ text?: string }>) : []))
    .map((b) => b.text ?? "")
    .join("\n");
}

const searchCall: FlatMessage = {
  type: "tool_use",
  content: [{ type: "tool_use", id: "tu1", name: "search_papers", input: { query: "ADHD fMRI", limit: 20 } }],
};
const searchResult = (ids: number[]): FlatMessage => ({
  type: "tool_result",
  content: [
    {
      type: "tool_result",
      tool_use_id: "tu1",
      content: [
        {
          type: "text",
          text: JSON.stringify({
            items: ids.map((n) => ({ paperId: `p${n}`, title: `T${n}`, evidence_id: `E${n}` })),
            _evidence: { query_id: "q1", new: ids.length, dup: 0, ledger_total: ids.length },
          }),
        },
      ],
    },
  ],
});

describe("convertFlatToAnthropic(冷重播折叠)", () => {
  test("工具调用不再被丢弃:折成一行摘要 + E-id 区间", () => {
    const flat: FlatMessage[] = [
      { type: "user", content: [{ type: "text", text: "帮我查 ADHD 的 fMRI 研究" }] },
      searchCall,
      searchResult([1, 2, 3, 4]),
      { type: "assistant", content: [{ type: "text", text: "我检索了 4 篇。" }] },
    ];
    const t = textOf(convertFlatToAnthropic(flat));
    expect(t).toContain("【已调用 search_papers");
    expect(t).toContain('query="ADHD fMRI"');
    expect(t).toContain("命中 4 条");
    expect(t).toContain("已入证据账本 E1–E4"); // 连续编号压成区间
    expect(t).toContain("我检索了 4 篇。"); // 原有散文不受影响
  });

  test("E-id 只认 tool_result 自带的图章:老会话(无 evidence_id)不标 E-id", () => {
    const legacy: FlatMessage = {
      type: "tool_result",
      content: [
        { type: "tool_result", tool_use_id: "tu1", content: [{ type: "text", text: JSON.stringify({ items: [{ title: "T" }] }) }] },
      ],
    };
    const t = textOf(convertFlatToAnthropic([searchCall, legacy]));
    expect(t).toContain("命中 1 条");
    expect(t).not.toContain("证据账本");
    expect(t).not.toContain("E1");
  });

  test("非连续 E 编号逐条列,不伪造成区间", () => {
    const t = textOf(convertFlatToAnthropic([searchCall, searchResult([3, 9])]));
    expect(t).toContain("已入证据账本 E3、E9");
    expect(t).not.toContain("–");
  });

  test("失败的工具结果折成「失败」,不折成成功", () => {
    const failed: FlatMessage = {
      type: "tool_result",
      content: [
        { type: "tool_result", tool_use_id: "tu1", is_error: true, content: [{ type: "text", text: "upstream 429 rate limited" }] },
      ],
    };
    const t = textOf(convertFlatToAnthropic([searchCall, failed]));
    expect(t).toContain("失败:upstream 429 rate limited");
    expect(t).not.toContain("命中");
  });

  test("结果缺失(窗口切割 / 孤儿 tool_use)如实标注,不猜", () => {
    const t = textOf(convertFlatToAnthropic([searchCall]));
    expect(t).toContain("(结果未记录)");
  });

  test("tool_result 消息不产出新消息 → 回合起点数不变(window/compact 的 keepTurns 口径不被打乱)", () => {
    const flat: FlatMessage[] = [
      { type: "user", content: [{ type: "text", text: "第一轮提问" }] },
      searchCall,
      searchResult([1, 2]),
      { type: "assistant", content: [{ type: "text", text: "回答一" }] },
      { type: "user", content: [{ type: "text", text: "第二轮提问" }] },
      { type: "assistant", content: [{ type: "text", text: "回答二" }] },
    ];
    const out = convertFlatToAnthropic(flat);
    expect(out.filter(isTurnStart).length).toBe(2); // 两条 user 提问,不多不少
    expect(out.every((m) => Array.isArray(m.content))).toBe(true);
    // 角色仍严格交替(user → assistant → user → assistant)
    expect(out.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
  });

  test("thinking 块仍不回喂(不是证据)", () => {
    const flat: FlatMessage[] = [
      { type: "assistant", content: [{ type: "thinking", thinking: "内部推理" }, { type: "text", text: "正文" }] },
    ];
    const t = textOf(convertFlatToAnthropic(flat));
    expect(t).toBe("正文");
  });
});

describe("工具折行的两个零件(compact 导出,两处共用)", () => {
  test("describeToolCall 保留 query(压缩后「上一轮搜了什么」仍可回答)", () => {
    expect(describeToolCall({ query: "ADHD fMRI meta-analysis", limit: 20 })).toContain('query="ADHD fMRI meta-analysis"');
    expect(describeToolCall({ file_path: "/home/bun/sessions/s1/uploads/a.pdf" })).toContain("a.pdf");
  });

  test("describeToolCall 不认识的入参回落到紧凑 JSON 前缀,且有长度帽", () => {
    const s = describeToolCall({ weird: "x".repeat(500) });
    expect(s.length).toBeLessThan(140);
  });

  test("summarizeToolOutcome:数不出条数就报字符数,绝不猜条数", () => {
    expect(summarizeToolOutcome({ content: [{ type: "text", text: "纯文本没有结构" }] })).toContain("字符");
    expect(summarizeToolOutcome({ content: [{ type: "text", text: JSON.stringify([1, 2, 3]) }] })).toBe("命中 3 条");
    expect(summarizeToolOutcome(null)).toBe("(结果未记录)");
  });
});
