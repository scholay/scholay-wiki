// 供给面校验(2026-08-14):行为单测 + 一条跨包/请求侧的结构约束。
//
// 线上事故(2026-08-13,user 873):turnLoop 的 wind-down 把 activeTools 收成 [] 之后,
// 模型仍在调 Bash/Edit/Write/MCP,又跑了 21 轮,单轮实花是预算的 8.2 倍,余额从 +662.86
// 打穿到 -3430.83。直接原因在 OpenAI 兼容道:toOpenAITools([]) 依 OpenAI 规范回 undefined
// (空数组非法)→ 请求里没有 tools 字段;而模型带着历史里 20 多对 tool_call/tool_result 的
// 惯性照样吐 tool_calls,adapter 无条件采信并合成 stop_reason="tool_use" → 工具循环继续。

import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { dropUnofferedToolUses } from "./turnLoop.ts";

const text = (t: string) => ({ type: "text", text: t }) as unknown as Anthropic.ContentBlock;
const tool = (name: string) =>
  ({ type: "tool_use", id: "tu_" + name, name, input: {} }) as unknown as Anthropic.ContentBlock;

describe("供给面校验:丢弃未提供的工具调用", () => {
  test("广告面为空(wind-down 后)→ 全部工具调用被丢弃,stop_reason 改回 end_turn", () => {
    // 这就是 873 那一轮的形态:activeTools 已清空,模型仍吐 Bash/Edit/MCP。
    const r = dropUnofferedToolUses(
      [text("我继续处理。"), tool("Bash"), tool("Edit"), tool("mcp__minicod__search_papers")],
      [],
      "tool_use",
    );
    expect(r.dropped).toEqual(["Bash", "Edit", "mcp__minicod__search_papers"]);
    expect(r.content).toHaveLength(1); // 只剩文本
    expect(
      r.stopReason,
      "\nstop_reason 没被改回 end_turn。\n" +
        "adapter 是按「有 tool_calls 就判 tool_use」合成的 —— 不改写就会进工具轮却无工具可跑,\n" +
        "空转到 round_cap,与修复前的成本形态完全一样(线上那一轮正是这样跑满 24 轮的)。\n",
    ).toBe("end_turn");
  });

  test("部分非法:合法的留下,stop_reason 保持 tool_use(本轮仍要跑工具)", () => {
    const r = dropUnofferedToolUses(
      [tool("Read"), tool("mcp__minicod__compare_journals")],
      ["Read", "Write"],
      "tool_use",
    );
    expect(r.dropped).toEqual(["mcp__minicod__compare_journals"]);
    expect(r.content).toHaveLength(1);
    expect(
      r.stopReason,
      "\n还剩合法工具时不该改 stop_reason —— 那会让本该执行的工具被跳过。\n",
    ).toBe("tool_use");
  });

  test("全部合法 → 原样返回(同一个数组引用,零拷贝、零副作用)", () => {
    const content = [text("好的"), tool("Read")];
    const r = dropUnofferedToolUses(content, ["Read"], "tool_use");
    expect(r.dropped).toEqual([]);
    expect(r.content).toBe(content); // 未改动路径不重建数组
    expect(r.stopReason).toBe("tool_use");
  });

  test("没有工具调用的普通轮 → 不受影响", () => {
    const content = [text("答案是……")];
    const r = dropUnofferedToolUses(content, [], "end_turn");
    expect(r.dropped).toEqual([]);
    expect(r.content).toBe(content);
    expect(r.stopReason).toBe("end_turn");
  });

  test("延迟披露的 MCP 工具不在广告面里 → 必须被丢弃(只能走 ToolInvoke)", () => {
    // 若这里放行,就等于「不在 tools[] 里也能直接调」,与本守卫互相拆台;
    // 且 ToolInvoke 的可调性校验会被绕过。权限边界由 featurePolicy 管,不在这里放宽。
    const r = dropUnofferedToolUses([tool("mcp__minicod__search_universities")], ["ToolSearch", "ToolInvoke"], "tool_use");
    expect(r.dropped).toEqual(["mcp__minicod__search_universities"]);
    expect(r.stopReason).toBe("end_turn");
  });

  test("max_tokens 截断轮:丢光工具后仍改 end_turn(不冒充截断恢复)", () => {
    const r = dropUnofferedToolUses([tool("Write")], [], "max_tokens");
    expect(r.dropped).toEqual(["Write"]);
    expect(r.stopReason).toBe("end_turn");
  });
});

describe("供给面校验:结构约束", () => {
  const SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "turnLoop.ts"), "utf8");

  test("丢弃发生在 messages.push 之前(悬挂 tool_use 绝不能进 history)", () => {
    const guard = SRC.indexOf("dropUnofferedToolUses(msg.content");
    const push = SRC.indexOf('messages.push({ role: "assistant", content: msg.content })');
    expect(guard).toBeGreaterThan(-1);
    expect(push).toBeGreaterThan(-1);
    expect(
      guard < push,
      "\n供给面校验跑到 messages.push 之后了。\n" +
        "被丢弃的 tool_use 会留在 history 里成为永远等不到 tool_result 的悬挂块,\n" +
        "下一轮请求在 Anthropic 形上必然 400,在 OpenAI 形上会让模型更确信那个工具存在。\n",
    ).toBe(true);
  });

  test("判据取自 activeTools —— 唯一随 wind-down 收窄的集合", () => {
    expect(
      SRC.includes("dropUnofferedToolUses(msg.content, activeTools.map((t) => t.name)"),
      "\n供给面判据不再取自 activeTools。\n" +
        "换成 turnTools / allTools 会让 wind-down 后的工具调用重新畅通无阻 —— 正是事故的形状。\n",
    ).toBe(true);
  });

  test("校验在响应侧:请求体不得出现 tool_choice", () => {
    // ① 主力 provider 实测静默无视 tool_choice(harness/toolChoiceProbe);
    // ② 改请求体会作废上游前缀缓存,而该路径冷调用成本占比已达 51%~71%。
    const i = SRC.indexOf("const stream = client.messages.stream(");
    expect(i).toBeGreaterThan(-1);
    expect(SRC.slice(i, i + 300).includes("tool_choice")).toBe(false);
  });
});
