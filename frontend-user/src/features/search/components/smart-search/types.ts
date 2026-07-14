import {
  parseUserEntryWithAttachments,
  replayHistoryAsTurns as sharedReplayHistoryAsTurns,
} from '@/shared/lib/agent-history';
import type {
  ServerMessage,
  SmartSearchHistoryEntry,
} from '../../api/smart-search';

/**
 * UI 层把扁平的 server 事件流归并成"轮"(turn):
 *   一个用户提问 + 该提问触发的全部 assistant 文本/工具调用块。
 *
 * **数据模型 (Turn / Block / TurnPlaceholder / hasVisibleAssistantContent) 已经搬到
 * `@/shared/types/chat`**, smart-search / claw / 未来 chat feature 共用。这里 re-export
 * 同名 type 保持现有引用路径不破坏。
 *
 * 块(Block)的粒度:
 *   - text:一段连续的 assistant 文本(由 content_start text + 多个 content_delta 拼成)
 *   - tool:一次工具调用(从 content_start tool_use 开始,到 tool_result 配对)
 */

export type {
  TextBlock,
  ToolBlock,
  AssistantBlock,
  TurnPlaceholder,
  Turn,
} from '@/shared/types/chat';
export { hasVisibleAssistantContent } from '@/shared/types/chat';

// 本文件后续逻辑用到 Turn / TextBlock / ToolBlock 时仍走 type-only import 拿过来用。
// 不直接 alias 导出后再 import, 避免 TS isolatedModules 在某些版本里抱怨。
// AssistantBlock 只在 export 那一行透出, 本文件内部不直接用 — 不放进 import 避免
// noUnusedLocals 报错。
import type {
  TextBlock,
  ToolBlock,
  Turn,
} from '@/shared/types/chat';
import { markPendingToolsAborted } from '@/shared/types/chat';

/**
 * 把 server 事件流折叠成 turns。每次 messages 更新就跑一遍(O(N))。
 * UI 通过 pendingUserText 在 send 时即时插入用户气泡 —— 避免等服务端
 * echo 才显示对话。
 *
 * 多轮关键: message_complete (或 error) 是 turn 边界标记,
 * 收到后 current 指针前进到下一个 pendingTurn。否则后续 turn 会"吃掉"
 * 前一 turn 的事件,导致 turn1 变空白、turn2 出现 turn1 的旧内容。
 *
 * tool_use_complete / tool_result 通过 toolUseId 全局查找(不限当前 turn),
 * 这样工具结果回来时即便 current 已经前进,也能挂回正确的 turn。
 */
export function foldMessagesIntoTurns(
  messages: ServerMessage[],
  pendingTurns: Pick<Turn, 'id' | 'userText' | 'paused' | 'blocked'>[]
): Turn[] {
  const turns: Turn[] = pendingTurns.map((p) => ({
    id: p.id,
    userText: p.userText,
    blocks: [],
    complete: false,
    // 点过 stop 的那轮 —— 本地标记透传到 Turn, 末尾渲染「已暂停」
    paused: p.paused,
    // 命中每日额度、未发送的那轮 —— 透传到 Turn, busy 判定排除它 + 末尾渲染「未发送」
    blocked: p.blocked,
  }));

  if (turns.length === 0) return turns;

  let turnIdx = 0;
  let currentTextBlock: TextBlock | null = null;
  let currentToolBlock: ToolBlock | null = null;

  // tool block 按 toolUseId 建索引,避免每条 tool_use_complete / tool_result 都做
  // turns×blocks 嵌套线性扫描 (O(M×B)),长会话叠上外层"每帧重折叠"会退化成 O(N³)。
  const toolBlockByUseId = new Map<string, ToolBlock>();
  const findToolBlock = (toolUseId: string): ToolBlock | undefined =>
    toolBlockByUseId.get(toolUseId);

  for (const msg of messages) {
    const current = turns[turnIdx];
    if (!current) break;

    switch (msg.type) {
      case 'content_start': {
        currentTextBlock = null;
        currentToolBlock = null;
        if (msg.blockType === 'text') {
          currentTextBlock = {
            kind: 'text',
            id: `text-${current.blocks.length}-${msg.toolUseId ?? ''}`,
            text: '',
          };
          current.blocks.push(currentTextBlock);
        } else if (msg.blockType === 'tool_use' && msg.toolUseId) {
          currentToolBlock = {
            kind: 'tool',
            id: `tool-${msg.toolUseId}`,
            toolName: msg.toolName ?? '',
            toolUseId: msg.toolUseId,
          };
          current.blocks.push(currentToolBlock);
          toolBlockByUseId.set(msg.toolUseId, currentToolBlock);
        }
        break;
      }
      case 'content_delta': {
        if (currentTextBlock && typeof msg.text === 'string') {
          currentTextBlock.text += msg.text;
        }
        // toolInput 增量不渲染 —— 等 tool_use_complete 拿到完整 input
        break;
      }
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
      case 'status': {
        // status 仅在当前轮未完成时驱动占位符;完成后不再更新避免覆盖。
        current.placeholder = {
          ...(current.placeholder ?? {}),
          state: msg.state,
          verb: msg.verb,
        };
        break;
      }
      case 'thinking': {
        // 累积模型推理草稿,由 UI 折叠展示(默认收起)。
        if (typeof msg.text === 'string' && msg.text.length > 0) {
          current.thinkingText = (current.thinkingText ?? '') + msg.text;
        }
        break;
      }
      case 'message_complete': {
        // 暂停打断时在途 tool_use 不会再有 tool_result —— 把它们标"已中止"避免永久转圈
        markPendingToolsAborted(current, !!current.paused);
        current.complete = true;
        current.placeholder = undefined;
        currentTextBlock = null;
        currentToolBlock = null;
        turnIdx++;
        break;
      }
      case 'error': {
        markPendingToolsAborted(current, !!current.paused);
        current.errorMessage = msg.message;
        current.complete = true;
        current.placeholder = undefined;
        currentTextBlock = null;
        currentToolBlock = null;
        turnIdx++;
        break;
      }
      // 以下事件本前端不消费,但在 union 里声明以保 switch 穷尽:
      //   - connected: 仅用于调试日志
      //   - system_notification / session_title_updated / pong: 与对话回放无关
      case 'connected':
      case 'system_notification':
      case 'session_title_updated':
      case 'pong':
        break;
    }
  }

  return turns;
}

// ────────────────────────────────────────────────────────────────────────────
// 论文工具结果解析 已提升到 @/shared/lib/minicod-papers(admin 会话监控复用)。
// 这里保留 re-export 维持既有 import 路径(PaperListScroller / AssistantTurn)。
// ────────────────────────────────────────────────────────────────────────────
export { parsePapersFromToolResult, MINICOD_TOOL_PREFIX } from '@/shared/lib/minicod-papers';

// ────────────────────────────────────────────────────────────────────────────
// 历史会话回放
//
// 用户回到智能搜索页时, 通过 GET /smart-search/session/messages 拉到 agent transcript
// 的全部 entries (Anthropic 协议形态), 折成跟实时 WS 流 (foldMessagesIntoTurns) 同构的 Turn[]。
// 折叠算法收口到 @/shared/lib/agent-history (三个 feature 共用), 这里只做委托。
// ────────────────────────────────────────────────────────────────────────────

/**
 * 把 agent transcript 折成 Turn[] —— 走 shared 的唯一实现。2026-07 输入框统一起智能搜索
 * 支持上传:用带附件解析的 parseUserEntryWithAttachments(剥 @"path" 前缀 → 附件 chip;
 * 引用块由 shared 回放通用解析)。
 */
export function replayHistoryAsTurns(
  entries: SmartSearchHistoryEntry[] | null | undefined,
): Turn[] {
  return sharedReplayHistoryAsTurns(entries, { parseUserEntry: parseUserEntryWithAttachments });
}
