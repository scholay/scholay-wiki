/**
 * 智能助手 — 把 WS 事件流 / agent transcript 折叠成 Turn[] 给 UI 渲染。
 *
 * 跟 smart-search 的同名 fold 相比, 这里更通用:
 *   - 不做论文卡解析 (那是 search 专属)
 *   - 接受任意 MCP / Bash 等工具的结果, UI 把 result 当 JSON / text 折叠展示
 *
 * **数据模型 (Turn / Block / hasVisibleAssistantContent) 已经搬到 `@/shared/types/chat`**,
 * smart-search / claw 共用同一份。本文件只 re-export 同名 type 保持现有 import 路径不破坏,
 * 加 fold 算法。
 */

import {
  replayHistoryAsTurns as sharedReplayHistoryAsTurns,
  parseUserEntryWithAttachments,
} from '@/shared/lib/agent-history';
import type { ClawHistoryEntry, ServerMessage } from '../../api/types';

export type {
  TextBlock,
  ToolBlock,
  AssistantBlock,
  Turn,
} from '@/shared/types/chat';
export { hasVisibleAssistantContent } from '@/shared/types/chat';

// fold 算法本身需要 Turn / ToolBlock 类型, 这里用 type-only import
import type {
  TextBlock,
  ToolBlock,
  Turn,
} from '@/shared/types/chat';
import { markPendingToolsAborted } from '@/shared/types/chat';

// ─── 实时 WS 事件流 → Turn[] ──────────────────────────────────────────────

export function foldMessagesIntoTurns(
  messages: ServerMessage[],
  pendingTurns: Pick<Turn, 'id' | 'userText' | 'userAttachments' | 'paused' | 'blocked'>[],
): Turn[] {
  const turns: Turn[] = pendingTurns.map((p) => ({
    id: p.id,
    userText: p.userText,
    userAttachments: p.userAttachments,
    blocks: [],
    complete: false,
    // 点过 stop 的那轮 —— 本地标记透传到 Turn, 末尾渲染「已暂停」
    paused: p.paused,
    // 命中额度未发送的那轮 —— 透传到 Turn, 末尾渲染「未发送 · 重新发送」
    blocked: p.blocked,
  }));
  if (turns.length === 0) return turns;

  let turnIdx = 0;
  let currentTextBlock: TextBlock | null = null;

  // tool block 按 toolUseId 建索引 —— 之前每来一条 tool_use_complete / tool_result 都做
  // turns×blocks 嵌套线性扫描 (O(M×B)), 长会话里和外层"每帧重折叠"叠成 O(N³)。改成 Map.O(1)。
  // 刻意全局作用域(不按 turn 清):与原 findToolBlock 跨所有 turn 扫描的语义一致 ——
  // toolUseId 由 agent 生成、全局唯一, 不会跨 turn 撞键; 结果回挂到正确 turn 的 block。
  const toolBlockByUseId = new Map<string, ToolBlock>();
  const findToolBlock = (toolUseId: string): ToolBlock | undefined =>
    toolBlockByUseId.get(toolUseId);

  for (const msg of messages) {
    const current = turns[turnIdx];
    if (!current) break;
    switch (msg.type) {
      case 'content_start':
        currentTextBlock = null;
        if (msg.blockType === 'text') {
          currentTextBlock = {
            kind: 'text',
            id: `text-${current.blocks.length}`,
            text: '',
          };
          current.blocks.push(currentTextBlock);
        } else if (msg.blockType === 'tool_use' && msg.toolUseId) {
          const tb: ToolBlock = {
            kind: 'tool',
            id: `tool-${msg.toolUseId}`,
            toolName: msg.toolName ?? '',
            toolUseId: msg.toolUseId,
          };
          current.blocks.push(tb);
          toolBlockByUseId.set(msg.toolUseId, tb);
        }
        break;
      case 'content_delta':
        if (currentTextBlock && typeof msg.text === 'string') {
          currentTextBlock.text += msg.text;
        }
        break;
      case 'tool_use_complete': {
        const block = findToolBlock(msg.toolUseId);
        if (block) {
          block.toolName = msg.toolName;
          block.input = msg.input;
        }
        break;
      }
      case 'tool_result': {
        const block = findToolBlock(msg.toolUseId);
        if (block) {
          block.result = msg.content;
          block.isError = msg.isError;
        }
        break;
      }
      case 'status':
        current.placeholder = {
          ...(current.placeholder ?? {}),
          state: msg.state,
          verb: msg.verb,
        };
        break;
      case 'thinking':
        if (typeof msg.text === 'string' && msg.text.length > 0) {
          current.thinkingText = (current.thinkingText ?? '') + msg.text;
        }
        break;
      case 'message_complete':
        // 暂停打断时在途 tool_use 不会再有 tool_result —— 标"已中止"避免永久转圈
        markPendingToolsAborted(current, !!current.paused);
        current.complete = true;
        current.placeholder = undefined;
        currentTextBlock = null;
        turnIdx++;
        break;
      case 'error':
        markPendingToolsAborted(current, !!current.paused);
        current.errorMessage = msg.message;
        current.complete = true;
        current.placeholder = undefined;
        currentTextBlock = null;
        turnIdx++;
        break;
      case 'connected':
      case 'pong':
        break;
    }
  }
  return turns;
}

// ─── transcript history → Turn[] ─────────────────────────────────────────

// user 正文抽取 + agentbridge 前缀剥离 + `@"path"` 附件前缀/内联 image 还原 全部收口到
// @/shared/lib/agent-history(parseUserEntryWithAttachments)—— admin 会话监控渲染 claw
// transcript 也复用同一份, 保证「管理端看到的 = 用户看到的」。

/** 智能助手历史回放 = shared 核心 + 附件还原解析(shared 同款)。 */
export function replayHistoryAsTurns(entries: ClawHistoryEntry[] | null | undefined): Turn[] {
  return sharedReplayHistoryAsTurns(entries, { parseUserEntry: parseUserEntryWithAttachments });
}
