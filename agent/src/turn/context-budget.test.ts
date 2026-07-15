import { test, expect, describe } from "bun:test";
import { estimateTokens, pruneOldToolResults, keepRecentByTokenBudget, turnStarts } from "./context-budget.ts";
import type Anthropic from "@anthropic-ai/sdk";

function mk(n: number, toolResultLen = 0): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ role: "user", content: `问题 ${i}` });
    if (toolResultLen > 0) {
      out.push({ role: "assistant", content: [{ type: "tool_use", id: `t${i}`, name: "search", input: { q: i } }] as never });
      out.push({ role: "user", content: [{ type: "tool_result", tool_use_id: `t${i}`, content: "R".repeat(toolResultLen) }] as never });
    }
    out.push({ role: "assistant", content: `回答 ${i}` });
  }
  return out;
}

describe("context-budget", () => {
  test("estimateTokens 随内容增长;image 块计固定量", () => {
    expect(estimateTokens([{ role: "user", content: "a".repeat(260) }])).toBe(100);
    const img: Anthropic.MessageParam = { role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: "x" } }] as never };
    expect(estimateTokens([img])).toBe(1600);
  });

  test("pruneOldToolResults 截早期 tool_result、保留最近回合原文", () => {
    const msgs = mk(10, 5000); // 10 回合,每回合一个 5000 字 tool_result
    const { messages, pruned } = pruneOldToolResults(msgs, 3, 200);
    expect(pruned).toBeGreaterThan(0);
    // 最近 3 回合的 tool_result 保持原文(5000 字);较早的被截到 ~200+提示
    const beforeTok = estimateTokens(msgs);
    const afterTok = estimateTokens(messages);
    expect(afterTok).toBeLessThan(beforeTok);
  });

  test("keepRecentByTokenBudget 按预算保留最近回合(结构从回合起点切,首条 user)", () => {
    const msgs = mk(30); // 30 回合小内容
    const kept = keepRecentByTokenBudget(msgs, 40, 4, 60); // 40 tok 预算 < 30 回合总量,强制裁
    expect(kept[0]!.role).toBe("user");
    expect(turnStarts(kept).length).toBeLessThan(turnStarts(msgs).length);
    expect(turnStarts(kept).length).toBeGreaterThanOrEqual(4); // minTurns
  });

  test("回合数 <= minTurns 原样返回", () => {
    const msgs = mk(3);
    expect(keepRecentByTokenBudget(msgs, 10, 4, 60)).toBe(msgs);
  });
});
