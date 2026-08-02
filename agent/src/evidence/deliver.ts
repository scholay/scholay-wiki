// 交付边界 resolve 闸 · fs 适配层(2026-08 证据账本 P1 / 终稿 §3.1 三段式的第 ③ 段)。
//
// 展开器只有**一份**(render.expandCitations,纯函数、零 I/O)。这里是它与文件系统之间唯一的胶水,
// 三个交付边界共用:
//   · tools/registry.ts  ExportDocument —— pandoc 之前(docx/pdf/pptx…)
//   · tools/registry.ts  BuildDeck      —— 构建产物落 out/ 之前(演示稿)
//   · turn/artifacts.ts  emitArtifacts  —— artifact 帧发出之前(Write/Bash 直接落 out/ 的文本交付物)
//
// 为什么胶水单独一个文件而不是塞进 render.ts:render.ts 自述「纯函数,零 I/O」,那条约束值钱
// (它让展开逻辑可被单测穷举、也让 digest/INDEX/EvidenceGet 四个消费面不必各自 mock fs)。
// 也不塞进 ledger.ts:账本是**写**侧真源,交付是**读**侧,混在一起下一个人就会在写路径里加 resolve。

import { readFile } from "node:fs/promises";
import { loadLedger } from "./ledger.ts";
import { expandCitations, type CitationExpansion } from "./render.ts";

export interface DeliveryResolve extends CitationExpansion {
  /** 账本条数,用于 citationFailureText 的「有效区间」。hits===0 时未读账本,此值为 0 且无意义。 */
  ledgerTotal: number;
}

const NONE: DeliveryResolve = { text: "", hits: 0, used: [], missing: [], changed: false, ledgerTotal: 0 };

/**
 * 文本侧闸。**快路径零 I/O**:绝大多数交付物根本不含句柄,连账本都不读 ——
 * 这条闸挂在每一次导出/构建/发帧上,不能给无引用的交付物加一次全账本读盘。
 */
export async function resolveTextForDelivery(
  workDir: string,
  text: string,
  opts?: { onMissing?: "keep" | "mark" },
): Promise<DeliveryResolve> {
  if (!text.includes("[[")) return { ...NONE, text };
  const ledger = await loadLedger(workDir);
  return { ...expandCitations(text, ledger, opts), ledgerTotal: ledger.length };
}

/**
 * 文件侧闸。读不出来(二进制/权限/已删)返回 null —— 调用方据此**跳过闸**而不是失败:
 * 这个位置读不到文件是别的子系统的错,把它变成"引用有问题"会给出误导性的自救指引。
 */
export async function resolveFileForDelivery(
  workDir: string,
  absPath: string,
  opts?: { onMissing?: "keep" | "mark" },
): Promise<DeliveryResolve | null> {
  let raw: string;
  try {
    raw = await readFile(absPath, "utf8");
  } catch {
    return null;
  }
  return resolveTextForDelivery(workDir, raw, opts);
}
