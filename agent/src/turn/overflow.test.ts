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
    ]) expect(isContextOverflow(m)).toBe(true);
  });
  test("普通错误不误判", () => {
    for (const m of ["rate limit exceeded", "401 unauthorized", "network timeout", "invalid api key"])
      expect(isContextOverflow(m)).toBe(false);
  });
});
