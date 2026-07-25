// DSML/内部协议标记的流式泄漏熔断(2026-07 审计 P0-5:deepseek 把 <｜｜DSML｜｜tool_calls>
// 原文吐进用户可见正文,7 会话、6/7 在末轮 = 终稿损坏)。
//
// 机制:两条 delta 通路(text/thinking)在 turnLoop 汇合点各挂一个 ProtocolLeakGuard;
// delta 分帧会把 marker 切碎,故持 holdback 尾巴跨帧匹配。命中即「熔断」:该 content 块
// 余下文本全部吞掉(**绝不下发给前端/journal**),置 tripped 由 turnLoop 做轮级裁决
// (history 消毒 + 有界重试或如实报错)。误伤面 = 正文真的在讨论这些特殊 token(极小众,
// 且只截断讨论文本、不炸轮)。

const MARKERS = [
  "<｜DSML｜",
  "<｜｜DSML｜｜",
  "<|DSML|",
  "<|｜DSML｜|",
  "<｜tool▁calls▁begin｜",
  "<｜tool▁call▁begin｜",
  "<｜tool_calls_begin｜",
  "<|tool▁calls▁begin|",
  "<|tool▁call▁begin|",
  "<|tool_calls_begin|",
];
const MAX_HOLD = Math.max(...MARKERS.map((m) => m.length)) - 1;

function firstMarkerIndex(s: string): number {
  let min = -1;
  for (const m of MARKERS) {
    const i = s.indexOf(m);
    if (i >= 0 && (min < 0 || i < min)) min = i;
  }
  return min;
}

// buf 尾部「可能是某 marker 前缀」的最长后缀(至多 maxLen):跨帧匹配的 holdback。
function longestMarkerPrefixSuffix(buf: string, maxLen: number): string {
  const upper = Math.min(maxLen, buf.length);
  for (let len = upper; len > 0; len--) {
    const tail = buf.slice(buf.length - len);
    for (const m of MARKERS) {
      if (m.length > len && m.startsWith(tail)) return tail;
    }
  }
  return "";
}

export class ProtocolLeakGuard {
  private tail = "";
  tripped = false;
  passedChars = 0; // 熔断前已放行的干净字符数(turnLoop 重试决策用)

  // 返回可安全下发的部分;tripped 后恒返 ""(余下全吞)。
  feed(text: string): string {
    if (this.tripped) return "";
    const buf = this.tail + text;
    const hit = firstMarkerIndex(buf);
    if (hit >= 0) {
      this.tripped = true;
      const clean = buf.slice(0, hit);
      this.tail = "";
      this.passedChars += clean.length;
      return clean;
    }
    const keep = longestMarkerPrefixSuffix(buf, MAX_HOLD);
    this.tail = keep;
    const out = buf.slice(0, buf.length - keep.length);
    this.passedChars += out.length;
    return out;
  }

  // 块/流结束时放出无害尾巴(未构成完整 marker 的前缀是正常文本)。
  flush(): string {
    if (this.tripped) return "";
    const t = this.tail;
    this.tail = "";
    this.passedChars += t.length;
    return t;
  }
}

// history 消毒:marker 起一刀切 —— 其后是协议载荷,不是给人看的,也绝不回喂下一 round/seed。
export function stripProtocolMarkers(text: string): string {
  const i = firstMarkerIndex(text);
  return i >= 0 ? text.slice(0, i) : text;
}

export function containsProtocolMarker(text: string): boolean {
  return firstMarkerIndex(text) >= 0;
}
