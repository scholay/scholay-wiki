/**
 * Prism 对话折叠 —— 把 WS socket.messages(实时)或历史 transcript 折成共享 Turn[]
 * (shared/types/chat),交给 shared/components/chat 渲染,视觉与 claw/smart-search 一致。
 *
 * 关键:**每次渲染重折叠整个 socket.messages**(不做增量 patchMsg)—— 这样 useAgentSocket 的
 * appendStreamMessage 把相邻 content_delta 就地合并(数组长度不变)也不会丢片段,根治
 * 「Let现在Now I」那种把每个文本块只截开头的碎片 bug。
 */

import {
  appendToolInputStream,
  finishToolInputStream,
  markPendingToolsAborted,
  type TextBlock,
  type ToolBlock,
  type Turn,
} from '@/shared/types/chat';
import { parseUserEntryWithAttachments, replayHistoryAsTurns } from '@/shared/lib/agent-history';
import type { PrismServerMessage } from '../../api/ws-types';
import type { PrismHistoryMsg } from '../../api/prism';

/** 实时:把 socket.messages + 本地 pendingTurns(用户输入)折成 Turn[]。 */
export function foldPrismMessages(
  messages: PrismServerMessage[],
  pendingTurns: Pick<
    Turn,
    'id' | 'userText' | 'paused' | 'blocked' | 'userAttachments' | 'userReferences'
  >[],
): Turn[] {
  const turns: Turn[] = pendingTurns.map((p) => ({
    id: p.id,
    userText: p.userText,
    // 附件/引用 chip 透传(实时轮由 send 填,blocked 恢复轮由 localStorage 还原)。
    userAttachments: p.userAttachments,
    userReferences: p.userReferences,
    blocks: [],
    // blocked 轮(命中额度未发送)当场终结:agent 永不对它发终帧,留 complete=false 会让
    // StreamingIndicator 永续转 + 下一轮流帧错位折进死轮(见 usePrismChat quota effect 注释)。
    complete: !!p.blocked,
    paused: p.paused,
    blocked: p.blocked,
  }));
  if (turns.length === 0) return turns;

  let turnIdx = 0;
  let currentTextBlock: TextBlock | null = null;
  // 在途 tool_use 块 —— toolInput 流式增量挂它身上(ToolCallBlock 构建态预览,shared 同款)。
  let currentToolBlock: ToolBlock | null = null;
  const toolByUseId = new Map<string, ToolBlock>();

  for (const msg of messages) {
    // blocked 轮不产生任何流帧 —— 对齐游标跳过它们,否则后续真实轮的帧会错位折进
    // blocked 轮(命中额度被拦后不重发、直接问下一句的场景)。同 claw / smart-search fold。
    while (turns[turnIdx] && turns[turnIdx].blocked) turnIdx++;
    const current = turns[turnIdx];
    if (!current) break;
    switch (msg.type) {
      case 'content_start':
        currentTextBlock = null;
        currentToolBlock = null;
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
          currentToolBlock = tb;
        }
        break;
      case 'round_discarded':
        // DSML 作废重打(审计 [10]):只摘掉当前在途文本块(残缺前缀),不清整个 current.blocks。
        if (currentTextBlock) {
          const idx = current.blocks.lastIndexOf(currentTextBlock);
          if (idx !== -1) current.blocks.splice(idx, 1);
          currentTextBlock = null;
        }
        break;
      case 'content_delta':
        if (currentTextBlock && typeof msg.text === 'string') {
          currentTextBlock.text += msg.text;
        } else if (currentToolBlock && typeof msg.toolInput === 'string' && msg.toolInput) {
          // 构建期流式入参:挂到在途工具块 → 对话流 ToolCallBlock 也有实时预览
          // (右侧文档面板的流式预览另走 usePrismChat.currentStreamingWrite,互不影响)。
          appendToolInputStream(currentToolBlock, msg.toolInput, msg.toolPath);
        }
        break;
      case 'tool_use_complete': {
        const b = toolByUseId.get(msg.toolUseId);
        if (b) {
          b.toolName = msg.toolName;
          b.input = msg.input;
          finishToolInputStream(b);
          if (b === currentToolBlock) currentToolBlock = null;
        }
        break;
      }
      case 'tool_result': {
        const b = toolByUseId.get(msg.toolUseId);
        if (b) {
          b.result = msg.content;
          b.isError = msg.isError;
          // 双轨制:面向用户的失败摘要(旧 agent 无此字段 → undefined,渲染层前端兜底)。
          b.userMessage = msg.userMessage;
        }
        break;
      }
      case 'status':
        current.placeholder = {
          ...(current.placeholder ?? {}),
          state: msg.state,
          verb: msg.verb,
          // 等待可感知(W5 P1-D1):不再丢弃 status.elapsed;无新值时保留旧值(帧可能省略)。
          elapsedSeconds:
            typeof msg.elapsed === 'number' ? msg.elapsed : current.placeholder?.elapsedSeconds,
        };
        break;
      case 'thinking':
        if (typeof msg.text === 'string' && msg.text.length > 0)
          current.thinkingText = (current.thinkingText ?? '') + msg.text;
        break;
      case 'message_complete':
        markPendingToolsAborted(current, !!current.paused);
        // claim_audit 轻标注(W2 P1-b):捕获自动纠偏标记(渲染本批仅 claw;字段先同步透传)。
        if (msg.claim_audit?.corrective_fired) current.claimAudited = true;
        current.complete = true;
        current.placeholder = undefined;
        currentTextBlock = null;
        currentToolBlock = null;
        turnIdx++;
        break;
      case 'error':
        markPendingToolsAborted(current, !!current.paused);
        current.errorMessage = msg.message;
        // 捕获 errorCode(W5 P0-C3):供可重试错误判定 / code→文案映射(与 claw fold 同构)。
        current.errorCode = msg.code;
        current.complete = true;
        current.placeholder = undefined;
        currentTextBlock = null;
        currentToolBlock = null;
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
 * 中间诊断文本失去折叠锚点被平铺 —— 已废弃。2026-07 输入框统一起 prism 支持上传:用带附件解析
 * 的 parseUserEntryWithAttachments(剥 @"path" 前缀 → 附件 chip;引用块由 shared 回放通用解析)。
 */
export function foldHistoryToTurns(raw: PrismHistoryMsg[]): Turn[] {
  return replayHistoryAsTurns(raw, { parseUserEntry: parseUserEntryWithAttachments });
}
