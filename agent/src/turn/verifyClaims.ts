// 诚实性核验器(2026-07 审计 P0-1/P0-2/P1-6):纯函数,零 IO。
//
// 三类机械校验,全部以「宣称 vs 本会话可证事实」为判据:
//   1) 引用:正文出现的 DOI 必须存在于证据语料(全会话 user 侧消息 = 用户文本 + 全部 tool_result
//      + 用户粘贴内容)。刻意排除 assistant 消息:旧轮编造的 DOI 不能给本轮自洗白(审计:被戳穿
//      后当轮零检索再犯)。
//   2) 交付:正文宣称「已生成/可下载文件」时,本轮必须真的产出 artifact 或会话内发生过 out/ 写入。
//   3) 通读:正文宣称「已通读/完整精读」时,不得存在零 Read、或本轮读到截断/乱码标记的事实。
//
// 命中 → turnLoop 在终帧前注入一条纠偏指令(【系统纠偏】前缀,backend journal parity 豁免契约)
// 并 continue 一轮:模型要么用工具补齐事实,要么显式更正。误报的代价 = 一轮"经核实无误"自愈。

import type Anthropic from "@anthropic-ai/sdk";
import type { ArtifactDecl } from "./artifacts.ts";

// 统一纠偏前缀(冻结契约):执行器注入的所有纠偏 user 消息以此开头;
// backend eventlog_validate 的用户轮 parity 据此豁免。改动必须两侧同步。
export const CORRECTIVE_PREFIX = "【系统纠偏】";

export interface ClaimFindings {
  unverifiedDois: string[];
  deliveryMismatch: boolean;
  fullReadMismatch: boolean;
}

export function hasFindings(f: ClaimFindings): boolean {
  return f.unverifiedDois.length > 0 || f.deliveryMismatch || f.fullReadMismatch;
}

// ---- 1) DOI 抽取与证据语料 ----
// 字符类排除:空白/引号/尖括号/成对括号/逗号分号 + 反引号 + 星号(markdown 强调)+ 全角标点
// + CJK(中文正文紧贴 DOI)。回放暴露:旧正则把 `10.xxx/yyy` 后的反引号/星号/中文一并吞进 DOI,
// 导致真实 DOI 在证据语料里匹配不上 → 误报编造。u 标志按 code point 迭代。
const DOI_RE =
  /\b10\.\d{4,9}\/[^\s"'`*<>()\[\]{},;，。、；：（）【】「」《》…一-鿿＀-￯]+/gu;

export function extractDois(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(DOI_RE)) {
    // 尾部标点二次剥离(半角+全角+星号+反引号),防 DOI 结尾恰是允许字符但实为句读的情况。
    const cleaned = m[0].replace(/[.,;:)\]}>»】。、）*`＊·]+$/u, "").toLowerCase();
    if (cleaned.length > 8) out.add(cleaned); // "10.xxxx/" 退化碎片(斜杠后被立即截断)不计
  }
  return [...out];
}

// 证据语料 = 全会话 user 角色消息(用户文本 + 全部 tool_result 块)。tool_result 都躺在 user
// 消息里(SDK 规则),一次过滤同时覆盖:检索返回的真实 DOI、Read 出的用户上传文件内容、
// 用户正文粘贴的 DOI —— 三大误报源被机械吸收。
export function buildEvidenceCorpus(messages: Anthropic.MessageParam[]): string {
  const parts: string[] = [];
  for (const m of messages) {
    if (m.role !== "user") continue;
    if (typeof m.content === "string") {
      parts.push(m.content);
      continue;
    }
    for (const b of m.content) {
      const blk = b as { type?: string; text?: string; content?: unknown };
      if (blk.type === "text" && typeof blk.text === "string") {
        // 排除本核验器自己注入的【系统纠偏】指令:它逐字含被标记的编造 DOI,若纳入证据语料会
        // 变成"自洗白"通道 —— 下一轮复读同一 DOI 时 corpus.includes() 命中 → 漏判(审计 [1]/[7])。
        // 与 backend eventlog_validate 的 correctiveUserPrefix parity 豁免同源、同前缀。
        if (blk.text.trimStart().startsWith(CORRECTIVE_PREFIX)) continue;
        parts.push(blk.text);
      } else if (blk.type === "tool_result") {
        try {
          parts.push(JSON.stringify(blk.content ?? ""));
        } catch {
          /* noop */
        }
      }
    }
  }
  return parts.join("\n").toLowerCase();
}

export function auditCitations(finalText: string, corpus: string): string[] {
  return extractDois(finalText).filter((d) => !corpus.includes(d));
}

// ---- 2) 交付宣称 ----
const DELIVERY_POS = [
  /已(?:为[你您])?(?:成功)?(?:生成|导出|保存|写入|制作|整理)(?:了|好)?[^。\n]{0,40}?(?:文件|文档|表格|报告|综述|讲稿|清单|PPT|docx?|xlsx?|pdf|csv|zip|md|html)/i,
  /可(?:在)?(?:下方|点击)?(?:查看或)?下载/,
  /下载卡片/,
  /见下方(?:卡片|附件|文件)/,
  /(?:file|document) (?:has been|is now|was) (?:generated|created|saved|exported)/i,
  /ready (?:for|to) download/i,
];
// 宣称前的否定/虚拟语境豁免:「未能生成」「如果需要我可以生成」「导出失败」等不算交付宣称。
// 注意:第一枝不能用裸「不」——否则「不少/不断/不仅/不错/不同」等常见非否定复合词会误豁免掉
// 真实的编造交付宣称(审计 [8])。改用显式否定复合词,不要求否定词紧贴交付动词。
const NEG_BEFORE =
  /(不能|不会|不再|不便|不予|不宜|不打算|无需|毋需|没(?:有|能)?|无法|未能?|失败|抱歉|若|如果|将会?|即将|正在|准备|可以为|需要时)[^。\n]{0,10}$/;

export function claimsDelivery(text: string): boolean {
  for (const re of DELIVERY_POS) {
    const m = re.exec(text);
    if (m && !NEG_BEFORE.test(text.slice(Math.max(0, m.index - 14), m.index))) return true;
  }
  return false;
}

// 会话内是否发生过**成功的**写交付区(防「引用上一轮已生成文件」误报)。
// 铁律:只数 tool_result 存在且非 is_error 的写入。仅凭 tool_use 名字判成功会让一次失败的
// ExportDocument/Write 永久免疫后续所有 delivery 核验(审计 [9]:导出失败却称"已导出 PDF")。
// 当前轮的写入以 artifacts(FS-diff)为准,本函数只负责"往轮已成功"的补偿,其 tool_result 必已到齐。
export function sessionHasOutWrite(messages: Anthropic.MessageParam[]): boolean {
  const candidateIds = new Set<string>();
  for (const m of messages) {
    if (m.role !== "assistant" || typeof m.content === "string") continue;
    for (const b of m.content) {
      const blk = b as { type?: string; id?: string; name?: string; input?: Record<string, unknown> };
      if (blk.type !== "tool_use" || !blk.id) continue;
      const name = blk.name ?? "";
      const fp = String(blk.input?.file_path ?? blk.input?.path ?? "");
      const isOutWrite = (name === "Write" || name === "Edit") && /(^|\/)out\//.test(fp);
      if (isOutWrite || name === "ExportDocument") candidateIds.add(blk.id); // ExportDocument 目标缺省即 out/
    }
  }
  if (candidateIds.size === 0) return false;
  for (const m of messages) {
    if (m.role !== "user" || typeof m.content === "string") continue;
    for (const b of m.content) {
      const blk = b as { type?: string; tool_use_id?: string; is_error?: boolean };
      if (
        blk.type === "tool_result" &&
        blk.tool_use_id &&
        candidateIds.has(blk.tool_use_id) &&
        !blk.is_error
      ) {
        return true;
      }
    }
  }
  return false;
}

// ---- 3) 通读宣称 ----
const FULLREAD_RE =
  /(已?通读(?:了)?全文|完整精读|逐页(?:阅读|精读)|(?:仔细|完整)阅读了?全文|read the (?:entire|full|whole) (?:paper|document|text))/i;
// registry.ts 的截断标注 + Read 乱码横幅(P0-F)= 机械锚点:出现即证明读取不完整。
const PARTIAL_MARKERS = ["[内容过长已截断", "[... truncated", "[系统提示: 该文件内容疑似"];

export function auditFullRead(
  finalText: string,
  turnMsgs: Anthropic.MessageParam[],
  allMsgs: Anthropic.MessageParam[],
): boolean {
  if (!FULLREAD_RE.test(finalText)) return false;
  const everRead = allMsgs.some(
    (m) =>
      m.role === "assistant" &&
      Array.isArray(m.content) &&
      m.content.some((b) => {
        const blk = b as { type?: string; name?: string };
        return blk.type === "tool_use" && (blk.name === "Read" || blk.name === "ReadDocument");
      }),
  );
  if (!everRead) return true; // 全会话零 Read 却称「已通读」= 铁证
  for (const m of turnMsgs) {
    if (m.role !== "user" || typeof m.content === "string") continue;
    for (const b of m.content) {
      const blk = b as { type?: string; content?: unknown };
      if (blk.type === "tool_result") {
        let s = "";
        try {
          s = JSON.stringify(blk.content ?? "");
        } catch {
          continue;
        }
        if (PARTIAL_MARKERS.some((k) => s.includes(k))) return true;
      }
    }
  }
  return false;
}

// ---- 4) 汇总 + 纠偏指令 ----
// HonestyChecks:按位开关(prism 预备件)——feature 可只启用部分核验维度。缺省全开。
// 背景:prism 交付走项目文件而非 ./out/(delivery 判据会误报)、LaTeX 工作流的引用形态特殊,
// 评估期可先只开 citations;控制面经 CreateOptions.honestyChecks 下发,与 honestyGuard 同链路。
export interface HonestyChecks {
  citations?: boolean;
  delivery?: boolean;
  fullread?: boolean;
}

export function auditClaims(
  finalText: string,
  allMsgs: Anthropic.MessageParam[],
  turnMsgs: Anthropic.MessageParam[],
  artifacts: ArtifactDecl[],
  checks?: HonestyChecks,
): ClaimFindings {
  const on = (v: boolean | undefined) => v !== false; // 缺省 = 开
  return {
    unverifiedDois: on(checks?.citations)
      ? auditCitations(finalText, buildEvidenceCorpus(allMsgs)).slice(0, 20)
      : [],
    deliveryMismatch:
      on(checks?.delivery) && claimsDelivery(finalText) && artifacts.length === 0 && !sessionHasOutWrite(allMsgs),
    fullReadMismatch: on(checks?.fullread) && auditFullRead(finalText, turnMsgs, allMsgs),
  };
}

export function buildCorrectiveDirective(f: ClaimFindings): string {
  const items: string[] = [];
  if (f.unverifiedDois.length) {
    items.push(
      `- 以下 DOI 未出现在本会话任何工具返回或用户材料中(疑似凭训练记忆编造):${f.unverifiedDois.join(" , ")}`,
    );
  }
  if (f.deliveryMismatch) items.push("- 正文宣称已生成/可下载文件,但本轮没有任何文件写入交付区。");
  if (f.fullReadMismatch) items.push("- 正文宣称已通读/完整精读,但实际阅读不完整(未读、被截断或内容乱码)。");
  return (
    `${CORRECTIVE_PREFIX}(此消息来自平台自动核验器,不是用户,也不会展示给用户)\n本轮回复未通过诚实性核验:\n${items.join("\n")}\n\n` +
    "立即执行,逐条二选一:\n" +
    "(a) 用工具把事实补齐:用 get_paper_by_doi / search_papers 逐条验证引用;把宣称的文件真正用 Write 写入 ./out/;把没读完的用 Read/ReadDocument 读完。\n" +
    "(b) 无法做到的,输出一段以「更正:」开头的简短声明,明确告诉用户哪些条目未经检索验证、哪个文件实际尚未生成、实际只读了哪些部分。\n" +
    "禁止:辩解、复读原文、再次宣称未发生的事。完成后自然结束。"
  );
}
