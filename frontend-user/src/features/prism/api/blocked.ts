// ─── 未发送(命中额度被拦)消息的持久化(prism)─────────────────────────────
//
// 命中额度时,那条 user_message 被后端**在转发给 agent 之前**拒绝(根本没发出去)。按
// 「项目 + 对话」存进 localStorage —— 无论用户怎么解额度(就地经费重置 / 跳支付宝充会员后
// 整页返回 / 在另一台设备充值后回来),重新进入该对话都能看到「未发送」卡片并一键重发,
// 不必重打。方案与 claw 的 'scholay:claw:blocked-message' 同构,另立 prism key。
//
// key 口径:`${projectId}:${sessionId ?? 'latest'}` —— prism 的 sessionId 允许为 null
// (跟随后端「最近活跃」对话,兼容存量单会话),此时用 'latest' 占位;显式选中对话后
// 以对话 id 为准。文件附件已上传在会话隔离 cwd(按 path 引用),只持久化元数据即可重发。

import type { AttachmentDTO, ReferenceItemDTO } from '@/shared/types/chat';

const BLOCKED_MSG_KEY = 'scholay:prism:blocked-message';

export interface PrismBlockedMessage {
  text: string;
  /** 含 agent cwd path,重发时直接复用(文件仍在会话 cwd);previewUrl(本地 blob)不持久化。 */
  attachments: AttachmentDTO[];
  /** 引用文献(资料已物化进会话 cwd 的 references/,重发时只需重附引用块)。 */
  references?: ReferenceItemDTO[];
}

interface BlockedMap {
  [key: string]: PrismBlockedMessage;
}

function storageKey(projectId: number, sessionId: string | null | undefined): string {
  return `${projectId}:${sessionId ?? 'latest'}`;
}

function readBlockedMap(): BlockedMap {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(BLOCKED_MSG_KEY);
    return raw ? (JSON.parse(raw) as BlockedMap) : {};
  } catch {
    return {};
  }
}

function writeBlockedMap(map: BlockedMap) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(BLOCKED_MSG_KEY, JSON.stringify(map));
  } catch {
    // localStorage 满 / 隐私模式 → silently skip(重发能力降级为"要重打",不报错)
  }
}

/** 读某「项目+对话」的「未发送」消息;没有返回 undefined。 */
export function getPrismBlockedMessage(
  projectId: number,
  sessionId: string | null | undefined,
): PrismBlockedMessage | undefined {
  return readBlockedMap()[storageKey(projectId, sessionId)];
}

/** 存某「项目+对话」的「未发送」消息(命中额度时);剥离 attachments 上不可持久化的本地 previewUrl。 */
export function setPrismBlockedMessage(
  projectId: number,
  sessionId: string | null | undefined,
  msg: PrismBlockedMessage,
) {
  const map = readBlockedMap();
  map[storageKey(projectId, sessionId)] = {
    text: msg.text,
    attachments: msg.attachments.map((a) => ({ ...a, previewUrl: undefined })),
    references: msg.references,
  };
  writeBlockedMap(map);
}

/** 清某「项目+对话」的「未发送」消息(成功重发 / 用户忽略后)。 */
export function clearPrismBlockedMessage(
  projectId: number,
  sessionId: string | null | undefined,
) {
  const map = readBlockedMap();
  const key = storageKey(projectId, sessionId);
  if (map[key]) {
    delete map[key];
    writeBlockedMap(map);
  }
}
