import { test, expect, describe } from "bun:test";
import { compactMessages } from "./compact.ts";
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
