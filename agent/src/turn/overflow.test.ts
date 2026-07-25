import { test, expect, describe } from "bun:test";
import { isContextOverflow } from "./turnLoop.ts";

describe("isContextOverflow", () => {
  test("命中各家 context 溢出错误形态", () => {
    for (const m of [
      "prompt is too long: 205000 tokens > 200000",           // Anthropic
      "This model's maximum context length is 128000 tokens", // OpenAI
      "context_length_exceeded",                              // OpenAI code
      "the input exceeds the maximum context window",         // 泛
      "请 reduce the length of the messages",                  // 泛
      "exceeded model token limit: 131072",                   // Moonshot / Kimi(无 context 字样)
      "invalid_request_error: exceed the token limit",         // 泛 OpenAI 兼容
      "输入内容过长,请缩短后重试",                            // 智谱 GLM
      "输入长度超过限制",                                       // 通义 / 豆包
      "prompt 超过最大长度限制",                                // 泛国产
      "已超出上下文长度",                                       // 泛国产
    ]) expect(isContextOverflow(m)).toBe(true);
  });
  test("普通错误不误判", () => {
    for (const m of ["rate limit exceeded", "401 unauthorized", "network timeout", "invalid api key", "余额不足", "触发内容安全"])
      expect(isContextOverflow(m)).toBe(false);
  });
});
