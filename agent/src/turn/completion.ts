// 一次性 fast-tier 补全(标题生成 / 记忆抽取用)。无工具、无流式。
// prompt 由控制面(Go)给(记忆抽取 spec 是 Go-authored 单一真源);执行器只执行。

import { anthropicClientFromProvider } from "../anthropic/client.ts";
import { resolveTier } from "../config/models.ts";
import type { CallUsage } from "./turnLoop.ts";

// 返回 {text, usage}:这些都是 billable 调用(标题/记忆抽取),usage 必须回传给 Go 计费链(C1)。
export async function fastCompletion(
  system: string,
  user: string,
  maxTokens = 512,
): Promise<{ text: string; usage: CallUsage }> {
  const model = resolveTier("haiku") || resolveTier("main");
  if (!model) throw new Error("no active provider/model");
  const client = anthropicClientFromProvider();
  const msg = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  const text = msg.content
    .map((b) => (b.type === "text" ? (b as { text: string }).text : ""))
    .join("")
    .trim();
  const u = msg.usage as unknown as Record<string, number>;
  const usage: CallUsage = {
    input_tokens: u?.input_tokens ?? 0,
    output_tokens: u?.output_tokens ?? 0,
    cache_read_tokens: u?.cache_read_input_tokens ?? 0,
    cache_creation_tokens: u?.cache_creation_input_tokens ?? 0,
    model,
  };
  return { text, usage };
}
