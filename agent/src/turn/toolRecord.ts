// 「模型把工具调用写成了正文」的检出器 + 存量污染清洗器 + 给模型的一句通道纪律说明。
//
// ══════════════════════════════════════════════════════════════════════════════════
// 🔴 这个文件的由来(2026-08-07 生产取证)与它现在的角色(2026-08-08 结构性根治之后)
//
// 【由来】冷重播(会话闲置 30 分钟被逐出 / 容器重启 / 重连)时,backend 从 journal 重灌 history,
// 旧版 `convertFlatToAnthropic` 把每一个真实 `tool_use` 块折成 assistant 通道的一条**文本**:
//
//     【已调用 Read file_path="scheme_v2.md"】返回 2926 字符
//
// 次日(2026-08-03)线上就出现模型**逐字照抄**这个模板的轮(连字符数这种它无从知晓的数字都编了),
// 该轮 `tool_use` 事件 0 个、`artifact` 0 个、`status=complete`、无 error、无 round_discarded。
// 用户读到一份「我读了文件、我改了、我导出了」的完整叙事,磁盘上什么都没发生。
// 机制是 few-shot:历史里「工具调用」这件事**长得就是正文**,模型照做。这是本仓库自己造的缺陷。
//
// 【现在】根因已在 `server/replayHistory.ts` 被**结构性**消除:历史工具调用还原成真的
// tool_use / tool_result 块,assistant 通道里不再有任何一行描述工具调用的文本 ⇒ 模板源没了。
// 本文件因此**降级为第二道防线**,但绝不能删,理由三条:
//   ① 存量 journal 的 content_delta 里还躺着 18 轮伪造正文,重播时靠 stripRecordEcho 洗掉;
//   ② 整段散文式伪造(turn 2417:8 步工具链 + grep 行号 + 完整 Python 源码)不匹配任何模板,
//      清洗抓不到,只能靠运行时检出 + turnLoop 纠偏;
//   ③ 折叠上线**之前**线上就有模型自发回落文本模式的现象 —— 那不是我们教的,结构化也治不了。
//
// 🔴 副作用是好的:根治之后本检出器的**误报面变成 0** —— 历史里不再有平台生成的记录行,
//    正文里出现记录行**只可能**是模型自己写的。`replayHistory` 的输出上有一条机械断言
//    (detectPhantomToolNarration(assistantText) === 0),它一红就说明有人又把工具描述写回了
//    assistant 通道 —— 那正是这次故障的唯一根因。
// ══════════════════════════════════════════════════════════════════════════════════

/** 2026-08-08 结构性根治前、短暂存在过的第三人称折行前缀。**没有任何生产写入方**,
 *  保留只为检出模型自发写出同形句子(以及万一有人把折叠改回来时的兜底)。 */
export const TOOL_RECORD_PREFIX = "〔平台记录·历史工具调用〕";

/** 折行前缀(2026-08-02~08-08 线上实际跑的模板)。存量 journal 与存量会话上下文里全是它,
 *  模型仍会照抄 —— 检出器与清洗器必须继续认它,**删掉这条等于把存量会话的探针关掉**。 */
export const LEGACY_TOOL_RECORD_PREFIX = "【已调用";

// 给模型的一句话说明:通道纪律。**刻意不含任何模板样例** ——
// 结构性根治之后历史里不再有记录行,再写一句「形如『…』的行是平台档案」等于凭空把模板教进
// system,而 system 是模型读得最重的通道,示范效应比放在 history 里更强(否决清单 ②)。
// 静态串(保 prompt cache),由 turnLoop 并进 baseSystem。
export const toolRecordLine =
  "工具通道纪律:要调用工具**只能**走工具通道(function call)。" +
  "把调用过程、参数或结果写成正文,工具不会被执行,用户会看到一份完全没有发生过的操作记录" +
  " —— 这是最严重的一类错误。在工具真正返回结果之前,不要陈述任何操作已完成。";

// 检出:模型自己在正文里写记录行。两种前缀都认(短命的新模板 + 线上实跑的旧模板)。
// 🔴 这两条正则同时是 stripRecordEcho 的判据 —— 检出与清洗必须同源。
const RECORD_ECHO_RES: ReadonlyArray<RegExp> = [
  new RegExp(TOOL_RECORD_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
  /【已调用\s*[A-Za-z_][A-Za-z0-9_]*/g,
];

export interface PhantomNarration {
  count: number;
  samples: string[]; // 前 3 条命中行(各截 80 字),供日志定位
}

/** 检出「模型把工具调用写成了正文」。**只是检出**:是否伪造还要看本轮是否真的执行过工具 ——
 *  判定留给 turnLoop(`!ranTool`),这里不做上下文假设,便于单测与复用。 */
export function detectPhantomToolNarration(text: string): PhantomNarration {
  if (!text) return { count: 0, samples: [] };
  let count = 0;
  const samples: string[] = [];
  for (const re of RECORD_ECHO_RES) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      count++;
      if (samples.length < 3) {
        const from = Math.max(0, m.index ?? 0);
        samples.push(text.slice(from, from + 80).replace(/\s+/g, " "));
      }
    }
  }
  return { count, samples };
}

/** 存量污染清洗(冷重播遍 1 用):**整行删除**含记录行的行。
 *
 *  为什么是删而不是替换成「[平台已移除一条工具记录]」:那本身又是一条 assistant 通道里的
 *  工具记录描述 = 换个模板继续教(铁律 ①)。这些行描述的动作从未发生过,删掉才是如实。
 *  只删「行」不删整段:同一条 assistant 消息里其余正文(真实回答)必须完整保留。 */
export function stripRecordEcho(text: string): string {
  if (!text) return text;
  if (detectPhantomToolNarration(text).count === 0) return text;
  let out = text;
  // ① 旧模板 `【已调用 X …】`:删**整个闭合区间**,不是删一行 —— turn 2417 里模型把一整段
  //    Python heredoc(含 `<< 'PYEOF'` 与源码 40 行)写在了这对括号内部,只删首行会把源码留下,
  //    而「一段能跑的命令正文」本身就是下一轮的模仿样本。
  //    闭合括号的搜索被两条边界夹住:遇到下一个 `【已调用`(说明本条没闭合,如 2417 首条畸形的
  //    `【已调用 Read">scheme_v2.md" …` 无 `】`)或超过 SPAN_CAP 就退回「删到行尾」。
  const SPAN_CAP = 4000;
  const LEGACY_RE = /【已调用\s*[A-Za-z_][A-Za-z0-9_]*/;
  for (let guard = 0; guard < 500; guard++) {
    const m = LEGACY_RE.exec(out);
    if (!m) break;
    const start = m.index;
    const nextMarker = out.indexOf(LEGACY_TOOL_RECORD_PREFIX, start + 1);
    const close = out.indexOf("】", start);
    // 闭合括号之后**还要删到行尾** —— 旧模板的完整形状是 `【已调用 X args】结果摘要`,
    // 那句「返回 2926 字符」正是模型编出来的产物(它无从知晓字符数),留着等于留半个模板。
    const from =
      close >= 0 && close - start <= SPAN_CAP && (nextMarker < 0 || close < nextMarker) ? close + 1 : start;
    const nl = out.indexOf("\n", from);
    const end = nl < 0 ? out.length : nl;
    out = out.slice(0, start) + out.slice(end);
  }
  // ② 新模板(行式,无闭合括号)。
  out = out
    .split("\n")
    .filter((line) => !line.includes(TOOL_RECORD_PREFIX))
    .join("\n");
  return out
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
