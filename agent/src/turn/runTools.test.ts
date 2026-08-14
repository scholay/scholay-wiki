// 2026-07 审查([16]/[21]):permission_response.userMessage 曾在解析层被丢掉 —— 模型对「幻想的
// 工具名」只收到与真越权同文的 permission denied,误判为权限问题而放弃。本测试锁住:控制面给了
// userMessage 就用它(回喂模型的 content + 前端摘要),没给则保持原文案。

import { test, expect } from "bun:test";
import { runTools } from "./runTools.ts";
import type { EventSink, TurnInput } from "./types.ts";

function makeInput(): TurnInput {
  return {
    sessionId: "t",
    workDir: "/tmp",
    allowBash: false,
    disallowedTools: [],
    messages: [],
  } as unknown as TurnInput;
}

function makeSink(decision: boolean | { allowed: boolean; userMessage?: string }) {
  const frames: Record<string, unknown>[] = [];
  const sink: EventSink = {
    frame: (f) => frames.push(f),
    error: () => {},
    requestPermission: () => Promise.resolve(decision),
  };
  return { sink, frames };
}

const toolUse = [{ id: "tu1", name: "SearchPapers", input: {} }];

test("拒绝时用控制面给的 userMessage(模型 content + 前端摘要)", async () => {
  const { sink, frames } = makeSink({ allowed: false, userMessage: "不存在名为 SearchPapers 的工具,请改用可用工具。" });
  const out = await runTools(toolUse, makeInput(), sink);
  expect(out[0]!.is_error).toBe(true);
  expect(JSON.stringify(out[0]!.content)).toContain("不存在名为 SearchPapers 的工具");
  expect(frames[0]!.userMessage).toBe("不存在名为 SearchPapers 的工具,请改用可用工具。");
});

test("控制面没给 userMessage 时保持原文案", async () => {
  const { sink, frames } = makeSink({ allowed: false });
  const out = await runTools(toolUse, makeInput(), sink);
  expect(JSON.stringify(out[0]!.content)).toContain("permission denied: SearchPapers");
  expect(frames[0]!.userMessage).toBe("该操作未获授权,已跳过。");
});

test("旧形态 boolean 回执仍兼容", async () => {
  const { sink, frames } = makeSink(false);
  const out = await runTools(toolUse, makeInput(), sink);
  expect(JSON.stringify(out[0]!.content)).toContain("permission denied: SearchPapers");
  expect(frames[0]!.userMessage).toBe("该操作未获授权,已跳过。");
});
