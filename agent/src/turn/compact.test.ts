import { test, expect, describe } from "bun:test";
import { compactMessages, reduceForWindow } from "./compact.ts";
import { estimateTokens } from "./context-budget.ts";
import type Anthropic from "@anthropic-ai/sdk";

describe("compactMessages 边界", () => {
  test("回合数 <= keepTurns → 抛错(交调用方回落硬截断,不误压)", async () => {
    const msgs: Anthropic.MessageParam[] = [];
    for (let i = 0; i < 3; i++) {
      msgs.push({ role: "user", content: `q${i}` });
      msgs.push({ role: "assistant", content: `a${i}` });
    }
    // 3 回合 <= keepTurns=25 → 无可压
    await expect(compactMessages(msgs, 25)).rejects.toThrow("nothing to compact");
  });
});

describe("reduceForWindow 入口闸(P0:触发/执行同源)", () => {
  // 构造 30 个回合、消息估算适中的历史。currentTokens 模拟「上游返回的真实占用(含 system+tools+cache)」。
  function history(turns: number, charsPerTurn = 400): Anthropic.MessageParam[] {
    const msgs: Anthropic.MessageParam[] = [];
    for (let i = 0; i < turns; i++) {
      msgs.push({ role: "user", content: `问题 ${i} ` + "x".repeat(charsPerTurn) });
      msgs.push({ role: "assistant", content: `回答 ${i} ` + "y".repeat(charsPerTurn) });
    }
    return msgs;
  }

  test("est 低于 target 但 currentTokens 超标 → 仍然压缩(修复:此前会空转返回 actions=[])", async () => {
    const msgs = history(30, 300);
    const est = estimateTokens(msgs);
    const ctxWindow = 128000;
    // 让 est 明显低于 target(75% = 96000),但真实占用(currentTokens)越过 target —— 模拟
    // 「system+tools+cache 的固定前缀把真实 prompt 顶过窗口,而 estimateTokens 只看得见 messages」。
    expect(est).toBeLessThan((ctxWindow * 75) / 100);
    const r = await reduceForWindow(msgs, ctxWindow, {
      keepTurns: 25,
      targetPct: 75,
      currentTokens: 120000, // 真实占用 120k > target 96k
    });
    // 关键断言:不再空转 —— 至少走到 ③ 层硬窗口,actions 非空且消息被裁短。
    expect(r.actions.length).toBeGreaterThan(0);
    expect(r.messages.length).toBeLessThan(msgs.length);
  });

  test("est 与 currentTokens 都低于 target → 不动(正常会话零影响)", async () => {
    const msgs = history(6, 200);
    const r = await reduceForWindow(msgs, 128000, {
      keepTurns: 25,
      targetPct: 75,
      currentTokens: 5000,
    });
    expect(r.actions).toEqual([]);
    expect(r.messages).toBe(msgs); // 同一引用,零拷贝
  });

  test("缺省 currentTokens → 退回纯 estimateTokens 口径(向后兼容)", async () => {
    const msgs = history(6, 200);
    const r = await reduceForWindow(msgs, 128000, { keepTurns: 25, targetPct: 75 });
    expect(r.actions).toEqual([]);
    expect(r.messages).toBe(msgs);
  });
});
