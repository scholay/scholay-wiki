// P2 图片通道(2026-07 输入框统一):user_message.attachments 里的 image 附件从会话 cwd
// 读出并 base64 内嵌为 Anthropic image 块 —— 模型「看见」图靠这里;文件语义与历史回放 chips
// 仍靠 backend hub 折进 content 的 @"path" 文本标记(两者并存,各司其职)。
//
// 边界:
//   - 路径必须 confine 在本会话 workDir 内(用户可控帧字段,防跨会话读图);
//   - 单图 ≤ 6MB(上传层已限 5MB,这里留余量兜底;Anthropic vision 单图上限);
//   - 读取失败/超限/非图 → 静默跳过(消息退化为纯文本,@"path" 标记仍在,模型可如实说明);
//   - 是否真发给上游由 turnLoop 按当前模型 vision 能力过滤(见 stripImageBlocks)。
import type Anthropic from "@anthropic-ai/sdk";
import { readFile } from "node:fs/promises";
import { confinePath } from "../sandbox/confine.ts";
import { log } from "../obs/log.ts";

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

/** Anthropic image block 允许的 media_type。 */
const IMAGE_MEDIA = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

function mediaTypeFor(mime: string | undefined, path: string): string | null {
  const m = (mime ?? "").toLowerCase().split(";")[0].trim();
  if (IMAGE_MEDIA.has(m)) return m;
  const ext = path.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  const byExt: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
  };
  return byExt[ext] ?? null;
}

interface FrameAttachment {
  type?: unknown;
  mimeType?: unknown;
  path?: unknown;
}

/**
 * 构造 user 消息 content:有可内嵌图片 → [image 块…, text 块];否则原样返回纯文本字符串
 * (与旧行为逐字节一致,窗口裁剪/标题生成等下游对 string 的假设不受影响)。
 */
export async function buildUserContentWithImages(
  workDir: string,
  text: string,
  rawAttachments: unknown,
): Promise<string | Anthropic.ContentBlockParam[]> {
  if (!Array.isArray(rawAttachments) || rawAttachments.length === 0) return text;
  const blocks: Anthropic.ContentBlockParam[] = [];
  for (const raw of rawAttachments as FrameAttachment[]) {
    if (!raw || raw.type !== "image" || typeof raw.path !== "string") continue;
    const media = mediaTypeFor(typeof raw.mimeType === "string" ? raw.mimeType : undefined, raw.path);
    if (!media) continue;
    try {
      const abs = await confinePath(workDir, raw.path); // 防跨会话读图(帧字段用户可控)
      const buf = await readFile(abs);
      if (buf.length === 0 || buf.length > MAX_IMAGE_BYTES) {
        log.warn("attachment image skipped (size)", { path: raw.path, bytes: buf.length });
        continue;
      }
      blocks.push({
        type: "image",
        source: { type: "base64", media_type: media as "image/png", data: buf.toString("base64") },
      });
    } catch (e) {
      log.warn("attachment image skipped (read failed)", {
        path: raw.path, err: String((e as Error)?.message ?? e),
      });
    }
  }
  if (blocks.length === 0) return text;
  blocks.push({ type: "text", text });
  return blocks;
}

/**
 * limitLiveImages:控制随请求外发的历史图块数量 —— base64 图每轮全量重发,长会话里
 * token/payload 成本线性膨胀(5MB 图 ≈ 6.7MB base64;实测还会加剧不稳中转掐大请求)。
 * 从最新消息往回数,保留最近 max 张,更早的换占位文本(history 本体不动,仅请求侧变换;
 * 与 H5 滑窗「裁最老」的精神一致)。max<=0 = 不限制。
 */
export function limitLiveImages(messages: Anthropic.MessageParam[], max: number): Anthropic.MessageParam[] {
  if (max <= 0) return messages;
  let seen = 0;
  let touched = false;
  // 先从后往前数配额,再一次 map 输出(保持原顺序、未触碰消息零拷贝)。
  const overflowIdx = new Set<string>(); // `${msgIdx}:${blockIdx}`
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user" || !Array.isArray(m.content)) continue;
    const blocks = m.content as Anthropic.ContentBlockParam[];
    for (let j = blocks.length - 1; j >= 0; j--) {
      if ((blocks[j] as { type?: string }).type !== "image") continue;
      seen += 1;
      if (seen > max) {
        overflowIdx.add(`${i}:${j}`);
        touched = true;
      }
    }
  }
  if (!touched) return messages;
  return messages.map((m, i) => {
    if (m.role !== "user" || !Array.isArray(m.content)) return m;
    const blocks = m.content as Anthropic.ContentBlockParam[];
    if (!blocks.some((_, j) => overflowIdx.has(`${i}:${j}`))) return m;
    return {
      role: "user" as const,
      content: blocks.map((b, j) =>
        overflowIdx.has(`${i}:${j}`)
          ? ({ type: "text", text: "[历史图片已省略(仅保留最近几张随请求发送),如需分析请重新上传]" } as Anthropic.ContentBlockParam)
          : b,
      ),
    };
  });
}

/**
 * stripImageBlocks:当前模型不支持视觉时,把请求里 user 消息的 image 块换成文本占位
 * (不动会话内存 history —— 之后切回视觉模型仍能「看见」历史图)。
 * 无图消息原样引用(零拷贝),只有含图消息才浅拷贝改写。
 */
export function stripImageBlocks(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  let touched = false;
  const out = messages.map((m) => {
    if (m.role !== "user" || !Array.isArray(m.content)) return m;
    const hasImage = (m.content as Anthropic.ContentBlockParam[]).some((b) => (b as { type?: string }).type === "image");
    if (!hasImage) return m;
    touched = true;
    return {
      role: "user" as const,
      content: (m.content as Anthropic.ContentBlockParam[]).map((b) =>
        (b as { type?: string }).type === "image"
          ? ({ type: "text", text: "[图片附件已省略:当前模型不支持识图,请切换支持视觉的模型后重发]" } as Anthropic.ContentBlockParam)
          : b,
      ),
    };
  });
  return touched ? out : messages;
}
