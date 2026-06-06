/**
 * Prism 对话折叠 —— 把 WS socket.messages(实时)或历史 transcript 折成共享 Turn[]
 * (shared/types/chat),交给 shared/components/chat 渲染,视觉与 claw/smart-search 一致。
 *
 * 关键:**每次渲染重折叠整个 socket.messages**(不做增量 patchMsg)—— 这样 useAgentSocket 的
 * appendStreamMessage 把相邻 content_delta 就地合并(数组长度不变)也不会丢片段,根治
 * 「Let现在Now I」那种把每个文本块只截开头的碎片 bug。
 */

import {
  markPendingToolsAborted,
  type TextBlock,
  type ToolBlock,
  type Turn,
} from '@/shared/types/chat';
import { replayHistoryAsTurns } from '@/shared/lib/agent-history';
import type { PrismServerMessage } from '../../api/ws-types';
import type { PrismHistoryMsg } from '../../api/prism';

/** 实时:把 socket.messages + 本地 pendingTurns(用户输入)折成 Turn[]。 */
export function foldPrismMessages(
  messages: PrismServerMessage[],
  pendingTurns: Pick<Turn, 'id' | 'userText' | 'paused'>[],
): Turn[] {
  const turns: Turn[] = pendingTurns.map((p) => ({
    id: p.id,
    userText: p.userText,
    blocks: [],
    complete: false,
    paused: p.paused,
  }));
  if (turns.length === 0) return turns;

  let turnIdx = 0;
  let currentTextBlock: TextBlock | null = null;
  const toolByUseId = new Map<string, ToolBlock>();

  for (const msg of messages) {
    const current = turns[turnIdx];
    if (!current) break;
    switch (msg.type) {
      case 'content_start':
        currentTextBlock = null;
        if (msg.blockType === 'text') {
          currentTextBlock = { kind: 'text', id: `text-${current.blocks.length}`, text: '' };
          current.blocks.push(currentTextBlock);
        } else if (msg.blockType === 'tool_use' && msg.toolUseId) {
          const tb: ToolBlock = {
            kind: 'tool',
            id: `tool-${msg.toolUseId}`,
            toolName: msg.toolName ?? '',
            toolUseId: msg.toolUseId,
          };
          current.blocks.push(tb);
          toolByUseId.set(msg.toolUseId, tb);
        }
        break;
      case 'content_delta':
        if (currentTextBlock && typeof msg.text === 'string') currentTextBlock.text += msg.text;
        break;
      case 'tool_use_complete': {
        const b = toolByUseId.get(msg.toolUseId);
        if (b) {
          b.toolName = msg.toolName;
          b.input = msg.input;
        }
        break;
      }
      case 'tool_result': {
        const b = toolByUseId.get(msg.toolUseId);
        if (b) {
          b.result = msg.content;
          b.isError = msg.isError;
        }
        break;
      }
      case 'status':
        current.placeholder = { ...(current.placeholder ?? {}), state: msg.state, verb: msg.verb };
        break;
      case 'thinking':
        if (typeof msg.text === 'string' && msg.text.length > 0)
          current.thinkingText = (current.thinkingText ?? '') + msg.text;
        break;
      case 'message_complete':
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
      default:
        break;
    }
  }
  return turns;
}

/**
 * 历史:把 agent transcript 折成 Turn[]。走 shared 的 replayHistoryAsTurns —— 与实时
 * foldPrismMessages 产出**同构**(有序保留每个 text 块 / tool 块 / thinking 通道),重入后
 * 渲染结构与实时一致(中间过程同样折进「处理过程」,末尾文本当最终气泡,不再平铺)。
 *
 * 旧实现把一轮所有 assistant 文本用 `\n\n` 拼成一段、且丢弃 tool/thinking 块,导致重入后
 * 中间诊断文本失去折叠锚点被平铺 —— 已废弃。prism 无附件,用默认 parseUserEntry(抽文本 + 剥前缀)。
 */
export function foldHistoryToTurns(raw: PrismHistoryMsg[]): Turn[] {
  return replayHistoryAsTurns(raw);
}
