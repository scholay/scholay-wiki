// 上游「工具调用协议标记」泄漏进用户可见正文的流式熔断
// (2026-07 审计 P0-5:deepseek 把 <｜｜DSML｜｜tool_calls> 原文吐进正文,7 会话、6/7 在末轮 = 终稿损坏)。
//
// 机制:两条 delta 通路(text/thinking)在 turnLoop 汇合点各挂一个 ProtocolLeakGuard;
// delta 分帧会把 marker 切碎,故持 holdback 尾巴跨帧匹配。命中即「熔断」:该 content 块
// 余下文本全部吞掉(**绝不下发给前端/journal**),置 tripped 由 turnLoop 做轮级裁决
// (history 消毒 + 有界重试或如实报错)。
//
// ══════════════════════════════════════════════════════════════════════════════════
// 🔴 2026-08-07 线上取证的教训:**判据不能是字面量名单 —— 人肉穷举必然漏。**
//
// 旧实现是一张 10 条的 `MARKERS` 字面量数组。它在两个维度上同时漏,而且漏得很安静:
//   ① **闭标签**。名单十条全部以 `<` 开头,`</｜｜DSML｜｜invoke>` 里 `<` 与 `｜` 之间多一个 `/`
//      ⇒ `indexOf` 必不命中。护栏上线(2026-07-26)后开标签泄漏归零,而 08-04~08-07
//      **每天恰好还有 1 条**漏网,全部是纯闭标签形态。生产原文:
//        `</parameter>\n</invoke>\n</｜｜DSML｜｜tool_calls`            (2026-08-04)
//        `\")\nPYEOF\n</parameter>\n</invoke>\n</｜｜DSML｜｜tool_calls>` (2026-08-05)
//        `｜｜DSML｜｜parameter>\n</｜｜DSML｜｜invoke>\n</｜｜DSML｜｜tool_calls>` (2026-08-07,截图那一轮)
//   ② **跨帧切点**。`longestMarkerPrefixSuffix` 只 hold「是某条字面量前缀」的尾巴:文本以 `<` 结尾
//      时 `<` 被扣住,下一帧来了 `/` 之后 `</` 不再是任何条目的前缀 ⇒ 连同其后**整段放行**。
//      turn 2408 的切点(`…决策。"</` | `｜｜DSML｜｜parameter>…`)就是这个机制的现场。
//
// 这两个漏洞的共同性质:名单每条都是「某次线上事故的化石」,而模型/网关吐出的形态是一个**变体族**
// (开/闭 × 全角竖线/ASCII 竖线 × 单/双 × DSML/旧特殊 token × 竖线整体退化)。
// 只要判据是枚举,下一个变体就一定在名单外,而且**没有任何红灯**会告诉我们漏了 ——
// 泄漏轮 status=complete、零 error、零 round_discarded,只有用户看到乱码。
//
// 所以现在的判据是**形状**(下面 FAMILIES 的正则族)+ **形状化的 holdback**
// (从最后一个 `<` 起、仍可能长成 marker 的尾巴一律扣住,而不是查表)。
// 新增变体时优先改形状;确实需要新家族时**连同一条线上原文回归用例一起加**(guards.test.ts)。
// ══════════════════════════════════════════════════════════════════════════════════

export type MarkerFamily =
  | "barred_token" // <｜DSML｜ / <｜｜DSML｜｜ / </｜｜DSML｜｜ / <｜tool▁calls▁begin｜ / <|endoftext|
  | "dsml_name" // 竖线整体退化:<DSML… / <||DSML|| / </DSML
  | "deepseek_tool_token" // V3·R1 特殊 token 家族(竖线缺失也认):tool▁calls▁begin / tool▁sep …
  | "toolcall_xml" // 工具调用 XML 语法层(竖线全丢时只剩这层):</invoke> </parameter> <invoke name=
  | "glm_native"; // GLM 原生标记:<tool_call> <arg_key> <arg_value>

// 形状族。判据只描述**结构**,不枚举具体字面量:
//   `<` 或 `</`  +  竖线族 [｜|](U+FF5C 全角 / ASCII,0~2 个)  +  token 名  +  收尾竖线/XML 尖括号。
// 顺序即同位置命中的优先级(仅影响日志里报哪个 family,不影响是否熔断)。
const FAMILIES: ReadonlyArray<{ family: MarkerFamily; re: RegExp }> = [
  // ① 竖线包裹的特殊 token —— 覆盖 DSML 全部形态与任何 <｜…｜> 哨兵(含 <|endoftext|>)。
  //    刻意要求「竖线 → 名字 → 竖线」三段:F# 的 `x <| f`、parser 的 `<|>`、Dirac 的 `<a|b>`
  //    都不构成这个形状,故不误伤。
  { family: "barred_token", re: /<\/?[｜|]{1,2}[A-Za-z0-9_▁\-]{2,48}[｜|]{1,2}/ },
  // ② 竖线**整体退化**(HF discussions/209 记录的 ASCII 退化与压缩形态的极端情形)时,
  //    名字本身仍在。要求前面必有 `<`/`</`,故正文里讨论 "DSML" 这个词不会误伤。
  { family: "dsml_name", re: /<\/?[｜|]{0,2}\s?DSML/i },
  // ②' 连 `<` 都不在的 DSML 片段(delta 恰好切在 `<` 之后 / history 消毒时只拿到半截)。
  //     线上 turn 2408 的第二帧原文就是 `｜｜DSML｜｜parameter>…` —— 开头没有 `<`。
  //     判据是「竖线包住 DSML 这个词」,正文里几乎不可能自然出现。
  { family: "dsml_name", re: /[｜|]{1,2}DSML[｜|]{1,2}/i },
  // ③ DeepSeek V3/R1 的旧特殊 token 家族(`▁` = U+2581 SentencePiece 空格符);竖线丢失也认。
  { family: "deepseek_tool_token", re: /<\/?[｜|]{0,2}tool[▁_\- ](?:calls?|sep|outputs?|responses?)/i },
  // ④ 工具调用 XML 语法层。DSML 的元素名(invoke/parameter/tool_calls)与 Claude 风格 function_calls
  //    共用这一层;线上 08-04/08-05 两条泄漏的**开头**正是裸 `</parameter>` `</invoke>`(竖线只在
  //    最后一行才出现),不收这一层就要先放行两行垃圾才熔断。
  //    刻意**不收**裸开标签 `<parameter name=`:log4j/Axis 等配置 XML 真的长这样(误伤面),
  //    而真泄漏里它前面必有 DSML 竖线或 `<invoke`,由 ①②④ 的其它分支先命中。
  {
    family: "toolcall_xml",
    re: /<\/(?:function_calls|antml:invoke|antml:parameter|invoke|parameter|tool_calls)>|<(?:function_calls|tool_calls)>|<(?:antml:)?invoke\s+name\s*=|<function_[a-z]*invoke\s/i,
  },
  // ⑤ GLM 原生标记(≠ DSML,见 docs/research/toolcall-protocol-2026-08/03-vendor-specs.md §3.2)。
  //    线上 GLM 尚未泄漏过(88 轮样本),但样本量给不出「不会漏」的结论,按形状先收着。
  { family: "glm_native", re: /<\/?(?:tool_call|arg_key|arg_value)>/i },
];

export interface MarkerHit {
  index: number; // 在被扫描串里的起始下标
  marker: string; // 命中的原文片段
  family: MarkerFamily;
}

/** 找出最靠前的一处协议标记(跨全部形状族);无则 null。 */
export function findProtocolMarker(s: string): MarkerHit | null {
  let best: MarkerHit | null = null;
  for (const f of FAMILIES) {
    const m = f.re.exec(s);
    if (!m) continue;
    if (!best || m.index < best.index) best = { index: m.index, marker: m[0], family: f.family };
  }
  return best;
}

// holdback 上限:最长的可能 marker 头(<｜tool▁calls▁begin｜ = 20 字符)留足余量。
// 扣住的字符只是**延迟**下发,flush() 必放回,不会丢。
const MAX_HOLD = 56;
// 可扣住的尾巴形状:以 `<` 或竖线开头,其后只含 marker 里可能出现的字符。
// 空格、中文、标点、`>` 任一出现即判定「这不是 marker 的开头」→ 立刻放行:
// 正文里的 `a < b`、markdown 表格行 `| 1 | 2 |`、`</div>` 都因此不会被整段扣住。
const HOLDABLE_TAIL_RE = /^[<｜|][A-Za-z0-9_\-/:▁｜|="]*$/;

/** buf 尾部「还可能长成 marker」的后缀(至多 MAX_HOLD):跨帧匹配的 holdback。
 *
 *  🔴 与旧实现的关键差别:判据是**形状**而不是「是不是某条字面量的前缀」。
 *  旧实现只扣「是某条 MARKER 前缀」的尾巴 ⇒ 文本以 `<` 结尾时扣住 `<`,下一帧来了 `/` 之后
 *  `</` 不再是任何条目的前缀,于是连同其后**整段放行** —— 闭标签 100% 漏就是这么来的
 *  (turn 2408 的切点 `…决策。"</` | `｜｜DSML｜｜parameter>…` 是现场)。
 *
 *  取窗口内**最靠前**的可扣候选(而不是最后一个):`…｜｜DS` 这种半截标记要整段扣住,
 *  只扣 `｜DS` 会把第一个竖线放跑。 */
function holdbackSuffix(buf: string): string {
  const from = Math.max(0, buf.length - MAX_HOLD);
  for (let i = from; i < buf.length; i++) {
    const c = buf[i]!;
    if (c !== "<" && c !== "｜" && c !== "|") continue;
    const tail = buf.slice(i);
    if (HOLDABLE_TAIL_RE.test(tail)) return tail;
  }
  return "";
}

export class ProtocolLeakGuard {
  private tail = "";
  tripped = false;
  passedChars = 0; // 熔断前已放行的干净字符数(turnLoop 重试决策用)
  hit: MarkerHit | null = null; // 命中详情(可观测性:round_discarded / 日志据此说明**为什么**)

  // 返回可安全下发的部分;tripped 后恒返 ""(余下全吞)。
  feed(text: string): string {
    if (this.tripped) return "";
    const buf = this.tail + text;
    const hit = findProtocolMarker(buf);
    if (hit) {
      this.tripped = true;
      this.hit = hit;
      const clean = buf.slice(0, hit.index);
      this.tail = "";
      this.passedChars += clean.length;
      return clean;
    }
    const keep = holdbackSuffix(buf);
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
  const hit = findProtocolMarker(text);
  return hit ? text.slice(0, hit.index) : text;
}

export function containsProtocolMarker(text: string): boolean {
  return findProtocolMarker(text) !== null;
}

// ── 可观测性 ─────────────────────────────────────────────────────────────────────
// 2026-08-07 取证发现:`round_discarded` 帧的 payload **只有 `type` 一个键,零原因信息**
// (线上 39 条全部如此),归因只能靠「同轮碰巧还有一个 error 帧」去 join。
// 于是「为什么这一轮被作废」在日志和 journal 里都答不上来 —— 下面这个结构就是给它补上的。
//
// marker_hex 不是洁癖:线上标记的 `｜` 是 U+FF5C(全角),终端与截图里看起来和 ASCII `|` 一模一样,
// 上一轮排查正是因此得出「名单漏了 ASCII 双竖线」这个错误结论(实测 ASCII 形态出现 0 次)。
// 报字节,别报字形。
export interface LeakDiagnostics {
  channel: "text" | "thinking" | "both";
  family: MarkerFamily;
  marker: string;
  markerHex: string; // 命中片段的 UTF-16 码位(前 12 个),形如 "3c 2f ff5c ff5c 44 53 4d 4c"
  passedChars: number; // 熔断前已放行给用户的干净字符数
}

function hexOf(s: string): string {
  return [...s]
    .slice(0, 12)
    .map((c) => c.codePointAt(0)!.toString(16))
    .join(" ");
}

/** 汇总两条通路的熔断详情;都没命中返回 null。 */
export function describeLeak(text: ProtocolLeakGuard, thinking: ProtocolLeakGuard): LeakDiagnostics | null {
  const t = text.tripped ? text.hit : null;
  const k = thinking.tripped ? thinking.hit : null;
  const hit = t ?? k;
  if (!hit) return null;
  return {
    channel: t && k ? "both" : t ? "text" : "thinking",
    family: hit.family,
    marker: hit.marker,
    markerHex: hexOf(hit.marker),
    passedChars: text.passedChars,
  };
}
