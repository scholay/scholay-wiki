import { test, expect, describe } from "bun:test";
import { isContextOverflow, isContentBlocked, isTransientStreamError } from "./turnLoop.ts";

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

// 2026-07 线上审计:内容审查拦截须独立 code=content_blocked(恒 400,重试无意义),
// 不能落 upstream 被前端译成「连接中断,请重试」。
describe("isContentBlocked", () => {
  test("命中各家内容审查错误形态", () => {
    for (const m of [
      'openai upstream 400: {"error":{"code":"data_inspection_failed","message":"Output data may contain inappropriate content."}}', // 阿里云
      "Input data may contain inappropriate content.",
      "the response was filtered due to content_filter policy", // Azure/OpenAI
      "输入包含敏感内容,已被拦截",
      "触发内容安全策略",
      "内容涉嫌违规,请调整后重试",
    ]) expect(isContentBlocked(m)).toBe(true);
  });
  test("普通错误不误判", () => {
    for (const m of ["rate limit exceeded", "prompt is too long", "openai upstream 503: overloaded", "invalid api key", "network timeout"])
      expect(isContentBlocked(m)).toBe(false);
  });
});

// 2026-07 线上审计:瞬态流错误(流式 JSON 损坏 / socket 断开 / 网关过载)当轮一次重放;
// 识别面收窄,业务性 4xx 绝不落入(否则会白烧一次重试)。
// 2026-07 审查[7]:结构化信号优先(状态码),自由文本只在无状态码时兜底且只看首行前 200 字符。
describe("isTransientStreamError", () => {
  test("命中传输层瞬态特征(无状态码)", () => {
    for (const m of [
      "JSON Parse error: Unexpected identifier \"data\"", // deepseek 流式 JSON 损坏(Bun/JSC 措辞)
      "The socket connection was closed unexpectedly",
      "read ECONNRESET",
      "Connection error.", // Anthropic SDK APIConnectionError
      "Request timed out.", // Anthropic SDK APIConnectionTimeoutError
      // 适配层自产的三类真瞬态串(旧正则全漏)
      "upstream stream ended without finish_reason (connection cut by relay)",
      "upstream stream idle timeout (no bytes for 90000ms)",
      "upstream time-to-first-byte timeout (60000ms)",
      "tool arguments truncated by upstream: Write",
    ]) expect(isTransientStreamError(m)).toBe(true);
  });
  test("状态码 429/5xx 判瞬态(含旧正则漏掉的 502/504/429)", () => {
    for (const m of [
      "openai upstream 503: no available upstream",
      'openai upstream 503: {"error":{"message":"Server is too busy now, please try again later"}}', // deepseek 过载
      "openai upstream 502: <html>Bad Gateway</html>",
      "openai upstream 504: gateway timeout",
      'openai upstream 429: {"error":{"message":"rate limit reached"}}',
      "429 rate_limit_error: number of requests has exceeded your rate limit", // Anthropic SDK 形态
      "529 overloaded_error",
    ]) expect(isTransientStreamError(m)).toBe(true);
    // 结构化信号:错误对象带 status 时优先于文本(Anthropic SDK 的 APIError)
    expect(isTransientStreamError("upstream failure", { status: 503 })).toBe(true);
    expect(isTransientStreamError("JSON Parse error: boom", { status: 400 })).toBe(false);
  });
  test("非瞬态错误不误判(400/401/审查/溢出)", () => {
    for (const m of [
      "openai upstream 400: invalid request",
      "401 unauthorized",
      'openai upstream 400: {"error":{"code":"data_inspection_failed"}}',
      "prompt is too long: 205000 tokens > 200000",
      "invalid api key",
    ]) expect(isTransientStreamError(m)).toBe(false);
  });
  // 审查[7] 回归:上游响应体里的数字/被回显的用户内容,不得把 4xx 抬成瞬态
  test("响应体正文与回显的用户内容不误判", () => {
    for (const m of [
      'openai upstream 400: {"error":{"message":"max_tokens must be <= 503"}}',
      "400 Bad Request: invalid params, total_tokens: 503",
      'openai upstream 400: {"error":{"message":"organization org-503 is not allowed"}}',
      'openai upstream 400: {"error":{"message":"Invalid value for messages[0].content: 帮我看看这个报错 JSON Parse error: Unexpected identifier"}}',
      'openai upstream 403: {"error":{"message":"服务器 too busy 是什么意思"}}',
    ]) expect(isTransientStreamError(m)).toBe(false);
  });
});
