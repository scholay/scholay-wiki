// OpenAI 出口适配器单测(F3):请求翻译 + SSE 流式状态机 + finalMessage 组装。
// 跑法:cd agent && bun test src/openai/
import { describe, expect, test, afterEach } from "bun:test";
import { toOpenAIMessages, openAIAdapterClient, chatCompletionsURL } from "./adapter.ts";
import type { ProviderConfig } from "../config/providerStore.ts";

const P: ProviderConfig = {
  id: "prov_t", presetId: "custom", name: "t", apiKey: "sk-t",
  baseUrl: "https://up.example.com", apiFormat: "openai", authStrategy: "auth_token",
  models: { main: "", haiku: "", sonnet: "", opus: "" },
};

describe("chatCompletionsURL", () => {
  test("各厂商版本段:/v1 与 /v4 都只补 /chat/completions,裸 host 补 /v1", () => {
    // DashScope(qwen):以 /v1 结尾
    expect(chatCompletionsURL("https://dashscope.aliyuncs.com/compatible-mode/v1")).toBe(
      "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    );
    // 智谱 GLM:以 /v4 结尾 —— 不能被拼成 /v4/v1/chat/completions(2026-07 线上 404 事故)
    expect(chatCompletionsURL("https://open.bigmodel.cn/api/paas/v4")).toBe(
      "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    );
    // MiniMax / Kimi:以 /v1 结尾
    expect(chatCompletionsURL("https://api.minimaxi.com/v1")).toBe("https://api.minimaxi.com/v1/chat/completions");
    // 裸 host(无版本段)→ 补 /v1/chat/completions
    expect(chatCompletionsURL("https://api.example.com")).toBe("https://api.example.com/v1/chat/completions");
    // 已是完整路径 → 原样;尾部多余斜杠先清
    expect(chatCompletionsURL("https://x.com/api/paas/v4/chat/completions")).toBe(
      "https://x.com/api/paas/v4/chat/completions",
    );
    expect(chatCompletionsURL("https://api.minimaxi.com/v1/")).toBe("https://api.minimaxi.com/v1/chat/completions");
  });
});

describe("toOpenAIMessages", () => {
  test("system/thinking 剥离/tool_use→tool_calls/tool_result→role:tool", () => {
    const out = toOpenAIMessages("SYS", [
      { role: "user", content: "hi" },
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "内心戏", signature: "sig" },
          { type: "text", text: "我来查" },
          { type: "tool_use", id: "tu1", name: "search", input: { q: "llm" } },
        ] as never,
      },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "tu1", content: [{ type: "text", text: "结果A" }], is_error: false },
          { type: "text", text: "继续" },
        ] as never,
      },
    ]);
    expect(out[0]).toEqual({ role: "system", content: "SYS" });
    expect(out[1]).toEqual({ role: "user", content: "hi" });
    const asst = out[2] as any;
    expect(asst.content).toBe("我来查");
    expect(asst.tool_calls[0].function).toEqual({ name: "search", arguments: '{"q":"llm"}' });
    expect(JSON.stringify(asst)).not.toContain("内心戏"); // thinking 剥离
    expect(out[3]).toEqual({ role: "tool", tool_call_id: "tu1", content: "结果A" });
    expect(out[4]).toEqual({ role: "user", content: "继续" });
  });

  test("is_error 前缀", () => {
    const out = toOpenAIMessages(undefined, [
      { role: "user", content: [{ type: "tool_result", tool_use_id: "x", content: "boom", is_error: true }] as never },
    ]);
    expect((out[0] as any).content).toBe("[error] boom");
  });
});

function sse(lines: unknown[]): Response {
  const body = lines.map((l) => `data: ${typeof l === "string" ? l : JSON.stringify(l)}\n\n`).join("");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

describe("image 块翻译(P2 图片通道)", () => {
  test("user 消息含 image 块 → OpenAI 多模态 content 数组(text + image_url data URI)", () => {
    const msgs = toOpenAIMessages(undefined, [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } },
          { type: "text", text: '@"/x/a.png" 看看这张图' },
        ] as never,
      },
    ]);
    expect(msgs).toHaveLength(1);
    const parts = msgs[0].content as { type: string; text?: string; image_url?: { url: string } }[];
    expect(Array.isArray(parts)).toBe(true);
    expect(parts[0]).toEqual({ type: "text", text: '@"/x/a.png" 看看这张图' });
    expect(parts[1].type).toBe("image_url");
    expect(parts[1].image_url!.url).toBe("data:image/png;base64,AAAA");
  });

  test("纯文本 user 消息保持 string content(不无谓升级数组形)", () => {
    const msgs = toOpenAIMessages(undefined, [{ role: "user", content: [{ type: "text", text: "hi" }] as never }]);
    expect(msgs[0].content).toBe("hi");
  });
});

describe("stream 状态机", () => {
  test("文本+reasoning+并行 tool_calls 分片+usage → 事件与 finalMessage", async () => {
    globalThis.fetch = (async () =>
      sse([
        { choices: [{ delta: { reasoning_content: "想一下" } }] },
        { choices: [{ delta: { content: "好的" } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, id: "c0", function: { name: "a", arguments: '{"x"' } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 1, id: "c1", function: { name: "b", arguments: '{"y":2}' } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: ":1}" } }] } }] },
        { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
        { choices: [], usage: { prompt_tokens: 100, completion_tokens: 7, prompt_tokens_details: { cached_tokens: 60 } } },
        "[DONE]",
      ])) as never;

    const client = openAIAdapterClient(P) as any;
    const stream = client.messages.stream({ model: "m", max_tokens: 10, messages: [{ role: "user", content: "q" }] });
    const evs: any[] = [];
    for await (const ev of stream) evs.push(ev);

    // thinking / text / 两个 tool 块都开了;tool 分片按块 index 归位;结束有 stop。
    expect(evs.find((e) => e.content_block?.type === "thinking")).toBeTruthy();
    expect(evs.filter((e) => e.content_block?.type === "tool_use").length).toBe(2);
    const stops = evs.filter((e) => e.type === "content_block_stop").length;
    expect(stops).toBe(2);

    const msg = await stream.finalMessage();
    expect(msg.stop_reason).toBe("tool_use");
    const tools = (msg.content as any[]).filter((b) => b.type === "tool_use");
    expect(tools[0].input).toEqual({ x: 1 }); // 交错分片正确聚合
    expect(tools[1].input).toEqual({ y: 2 });
    expect((msg.content as any[])[0]).toEqual({ type: "text", text: "好的" });
    expect(JSON.stringify(msg.content)).not.toContain("想一下"); // final 不含 thinking
    // usage 归一:input = prompt−cached
    expect(msg.usage.input_tokens).toBe(40);
    expect((msg.usage as any).cache_read_input_tokens).toBe(60);
    expect((msg.usage as any).cache_creation_input_tokens).toBe(0);
  });

  // 2026-08-02 计费审计 P0-6:本用例原来断言的是「全 0 不炸」,而全 0 恰恰是缺陷本身 ——
  // 全 0 → session_total 不前进 → backend 的 accrueTurnUsage(delta<=0 return)与
  // llmusage.Record(TotalTokens==0 return)双双兜掉 → 该轮在账本上根本不存在,整条不实现
  // stream_options.include_usage 的端点长期 100% 免费。现在断言的是「回落到估算值」。
  test("上游无 usage → 回落估算值(不再是全 0);纯文本 stop→end_turn", async () => {
    globalThis.fetch = (async () =>
      sse([{ choices: [{ delta: { content: "hi" } }] }, { choices: [{ delta: {}, finish_reason: "stop" }] }, "[DONE]"])) as never;
    const client = openAIAdapterClient(P) as any;
    const stream = client.messages.stream({ model: "m", max_tokens: 10, messages: [{ role: "user", content: "q" }] });
    for await (const _ of stream) { /* drain */ }
    const msg = await stream.finalMessage();
    expect(msg.stop_reason).toBe("end_turn");
    // 估算值必须为正:账本上「这一轮存在」是硬要求,精确度是次要的。
    expect(msg.usage.input_tokens).toBeGreaterThan(0);
    expect(msg.usage.output_tokens).toBeGreaterThan(0);
  });

  // 抢救链路的回归闸(P0-6):适配器必须产 message_start / message_delta,否则 turnLoop 的
  // partialUsage 恒 null,用户 stop 与瞬态重放两处 usage 抢救对所有 openai 格式 provider 全是空操作
  // ——「大 prompt 发出即 stop」就成了可反复利用的绕配额通道。
  test("产 message_start(估算)与 message_delta(真实 usage),供 turnLoop 抢救被中断轮", async () => {
    globalThis.fetch = (async () =>
      sse([
        { choices: [{ delta: { content: "hi" } }] },
        { choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 7 } },
        "[DONE]",
      ])) as never;
    const client = openAIAdapterClient(P) as any;
    const stream = client.messages.stream({ model: "m", max_tokens: 10, messages: [{ role: "user", content: "q" }] });
    const seen: any[] = [];
    for await (const ev of stream) seen.push(ev);
    const start = seen.find((e) => e.type === "message_start");
    expect(start).toBeDefined();
    expect(start.message.usage.input_tokens).toBeGreaterThan(0); // 开流即有底,abort 也抢得到
    const delta = seen.find((e) => e.type === "message_delta");
    expect(delta).toBeDefined();
    expect(delta.usage.input_tokens).toBe(100); // 真实值到达后覆盖估算
    expect(delta.usage.output_tokens).toBe(7);
  });

  test("非流式 create:内容与 usage 归一", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({
        id: "x", choices: [{ message: { content: "标题" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 3 },
      }), { status: 200 })) as never;
    const client = openAIAdapterClient(P) as any;
    const msg = await client.messages.create({ model: "m", max_tokens: 10, messages: [{ role: "user", content: "q" }] });
    expect((msg.content as any[])[0].text).toBe("标题");
    expect(msg.usage.output_tokens).toBe(3);
  });
});