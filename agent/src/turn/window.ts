// H5:长会话上下文只增不减 → 最终撞上游 context 窗口 → 报笼统 "upstream stream failed" 且会话卡死。
// 这里做**有界滑动窗口**:近上限时丢弃最老的若干回合,只留最近 N 个回合。硬截断(非摘要式
// compaction),但远好于撞墙崩溃;仅近上限才触发,正常会话零影响。真·摘要压缩是更大的后续项。
//
// 结构安全铁律(Anthropic 强约束):① 首条消息必须是 user;② 每个 tool_result 必须紧跟含对应
// tool_use 的 assistant 消息。故只在「回合起点」切:回合起点 = user 消息且**不含 tool_result 块**
// (runTurn 回填的 tool_result 消息 content 是含 tool_result 块的数组 → 非起点)。对两种历史形状都成立:
//   - 活会话:user 起点是 string content;tool_result 回合是 [tool_result...] 数组;
//   - seed 回来的历史(convertFlatToAnthropic 只留 text、丢工具块):每条 user 都是 [text...] 无 tool_result → 都是起点。
// 在起点切 → 首条恒为 user、且 tool 配对完整落在两个相邻起点之间、绝不被切断。

import type Anthropic from "@anthropic-ai/sdk";

export function isTurnStart(m: Anthropic.MessageParam): boolean {
  if (m.role !== "user") return false;
  if (typeof m.content === "string") return true;
  if (Array.isArray(m.content)) {
    return !m.content.some((b) => (b as { type?: string })?.type === "tool_result");
  }
  return true;
}

// windowMessages:保留最近 keepTurns 个回合(在回合起点切)。回合数 ≤ keepTurns 时原样返回。
export function windowMessages(
  messages: Anthropic.MessageParam[],
  keepTurns: number,
): Anthropic.MessageParam[] {
  if (keepTurns <= 0) return messages;
  const starts: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (isTurnStart(messages[i]!)) starts.push(i);
  }
  if (starts.length <= keepTurns) return messages;
  return messages.slice(starts[starts.length - keepTurns]!);
}
