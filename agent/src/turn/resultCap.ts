// tool_result 单条体积上限(2026-07 审计:spam 论文单条 abstract 6.7 万字符回喂下一 round
// 全量请求,撞中转 ~100KB+ 掐大请求 → 整轮 failed)。落在 runTools 的合流点:MCP(minicod
// sanitizer 之后的兜底)与 builtin 一处截断,三个下游同时受益 —— 回喂 messages(下一 round
// 请求体)、WS tool_result 帧(前端)、journal tee(持久化)。截断带显式标注:模型知道数据
// 被截,不会把截断当完整(顺带压「假装读全了」面)。env 双旋钮可调;BLOCK_MAX=0 整体关闭。

// 单块/合计上限(export:sanitizeMinicod 据 TOTAL_MAX 推导自身 TOTAL_CAP,避免两常数漂移)。
export const PER_BLOCK_MAX = Number(process.env.EXECUTOR_TOOL_RESULT_BLOCK_MAX || 20_000); // 单 text 块
export const TOTAL_MAX = Number(process.env.EXECUTOR_TOOL_RESULT_TOTAL_MAX || 60_000); // 单 tool_result 合计

// 刻意整文件读取的工具:自身已在工具内 self-bound(Read=MAX_READ_BYTES 256K / ReadDocument=
// MAX_DOC_CHARS 400K),不是 spam 向量,绝不能共用 MCP/Bash 的 20K 紧上限 —— 否则模型被要求
// 「通读」却只拿到 1/6,且二进制文档无分页回补路径(审计 [6])。给它们各自 self-bound 值做
// 天花板:对正常读取近乎 no-op,仅兜住病态 >自身上限 的极端体积。
const WHOLE_READ_CEILING: Record<string, number> = { Read: 256_000, ReadDocument: 400_000 };

function capText(t: string, max: number): string {
  return t.length <= max
    ? t
    : t.slice(0, max) + `\n\n[内容过长已截断:原始 ${t.length} 字符,以上为前 ${max} 字符]`;
}

// 是否为完整 JSON 文本块。minicod sanitizer 出口已把体积压到 ≤TOTAL_CAP(≤TOTAL_MAX)且结构
// 完整;此处识别出来后整块放行,绝不钝切成非法 JSON —— 否则前端论文卡 JSON.parse 失败集体消失、
// _sanitizer.coverage_note(对外 CNKI 披露)丢失、模型收到坏 JSON(审计 [3]/[5])。
function isCompleteJson(t: string): boolean {
  const s = t.trimStart();
  if (s[0] !== "{" && s[0] !== "[") return false;
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
}

export function capToolResult(content: unknown, toolName?: string): unknown {
  if (PER_BLOCK_MAX <= 0) return content;
  const wholeCeil = toolName ? WHOLE_READ_CEILING[toolName] : undefined;
  const perBlock = wholeCeil ?? PER_BLOCK_MAX;
  const total = wholeCeil ?? TOTAL_MAX;

  if (typeof content === "string") return capText(content, Math.min(perBlock, total));
  if (!Array.isArray(content)) return content;
  let budget = total;
  const out: unknown[] = [];
  for (let i = 0; i < content.length; i++) {
    const b = content[i] as { type?: string; text?: string };
    if (b?.type !== "text" || typeof b.text !== "string") {
      out.push(b);
      continue;
    }
    if (budget <= 0) {
      out.push({ type: "text", text: `[结果过大,后续 ${content.length - i} 个结果块已省略]` });
      break;
    }
    // 完整 JSON 且在合计预算内 → 整块放行(不钝切)。上游 sanitizer 已保证体积有界,这里只兜底。
    if (b.text.length <= budget && isCompleteJson(b.text)) {
      budget -= b.text.length;
      out.push(b);
      continue;
    }
    const capped = capText(b.text, Math.min(perBlock, budget));
    budget -= capped.length;
    out.push(capped === b.text ? b : { type: "text", text: capped });
  }
  return out;
}
