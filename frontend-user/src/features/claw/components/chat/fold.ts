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
import {
  appendToolInputStream,
  finishToolInputStream,
  markPendingToolsAborted,
} from '@/shared/types/chat';

// ─── 实时 WS 事件流 → Turn[] ──────────────────────────────────────────────

export function foldMessagesIntoTurns(
  messages: ServerMessage[],
  pendingTurns: Pick<
    Turn,
    'id' | 'userText' | 'userAttachments' | 'userReferences' | 'paused' | 'blocked'
  >[],
): Turn[] {
  const turns: Turn[] = pendingTurns.map((p) => ({
    id: p.id,
    userText: p.userText,
    userAttachments: p.userAttachments,
    userReferences: p.userReferences,
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
  // 在途 tool_use 块(content_start 开、tool_use_complete 关)—— toolInput 流式增量挂它身上。
  let currentToolBlock: ToolBlock | null = null;

  // tool block 按 toolUseId 建索引 —— 之前每来一条 tool_use_complete / tool_result 都做
  // turns×blocks 嵌套线性扫描 (O(M×B)), 长会话里和外层"每帧重折叠"叠成 O(N³)。改成 Map.O(1)。
  // 刻意全局作用域(不按 turn 清):与原 findToolBlock 跨所有 turn 扫描的语义一致 ——
  // toolUseId 由 agent 生成、全局唯一, 不会跨 turn 撞键; 结果回挂到正确 turn 的 block。
  const toolBlockByUseId = new Map<string, ToolBlock>();
  const findToolBlock = (toolUseId: string): ToolBlock | undefined =>
    toolBlockByUseId.get(toolUseId);

  for (const msg of messages) {
    // blocked 轮(配额拦下 / 投递失败,消息从未到达服务端)不产生任何流帧 —— 对齐游标跳过它们。
    // 不跳会让后续真实轮的帧错位折进 blocked 轮(例:命中额度被拦后不重发、直接问下一句的场景,
    // 新一轮的回答会挂到 blocked 轮上、自己则永远 complete=false → busy 卡死)。
    while (turns[turnIdx] && turns[turnIdx].blocked) turnIdx++;
    const current = turns[turnIdx];
    if (!current) break;
    switch (msg.type) {
      case 'content_start':
        currentTextBlock = null;
        currentToolBlock = null;
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
          currentToolBlock = tb;
        }
        break;
      case 'content_delta':
        if (currentTextBlock && typeof msg.text === 'string') {
          currentTextBlock.text += msg.text;
        } else if (currentToolBlock && typeof msg.toolInput === 'string' && msg.toolInput) {
          // 构建期流式入参(此前丢弃):挂到在途工具块 → ToolCallBlock 实时预览。
          appendToolInputStream(currentToolBlock, msg.toolInput, msg.toolPath);
        }
        break;
      case 'round_discarded':
        // DSML 作废重打(审计 [10]):只摘掉当前在途的文本块(残缺前缀)。该路径保证无 tool_use,
        // 前缀就在 currentTextBlock;不清整个 current.blocks(会误删本轮更早 round 的工具/文本块)。
        if (currentTextBlock) {
          const idx = current.blocks.lastIndexOf(currentTextBlock);
          if (idx !== -1) current.blocks.splice(idx, 1);
          currentTextBlock = null;
        }
        break;
      case 'tool_use_complete': {
        const block = findToolBlock(msg.toolUseId);
        if (block) {
          block.toolName = msg.toolName;
          block.input = msg.input;
          finishToolInputStream(block);
          if (block === currentToolBlock) currentToolBlock = null;
        }
        break;
      }
      case 'tool_result': {
        const block = findToolBlock(msg.toolUseId);
        if (block) {
          block.result = msg.content;
          block.isError = msg.isError;
          // 双轨制:面向用户的失败摘要(旧 agent 无此字段 → undefined,渲染层前端兜底)。
          block.userMessage = msg.userMessage;
        }
        break;
      }
      case 'artifact': {
        // 产物带外声明 → 绑到当前轮(帧在 message_complete 之前到,故 current 就是本轮)。
        // 同轮同 path 去重(同一文件本轮多次写只算一件成果)。
        const arts = (current.artifacts ??= []);
        if (!arts.some((a) => a.path === msg.path)) {
          arts.push({ name: msg.name, path: msg.path, kind: msg.kind, mime: msg.mime, size: msg.size });
        }
        break;
      }
      case 'research_state':
        // 证据账本带外计数(2026-08 P0-c):引擎在工具咽喉点数出来的,与模型自称的过程无关。
        // 后到覆盖先到(帧是全量快照);wire 的 snake_case 只在这一处转驼峰。
        // 缺字段按 0 处理 —— 「未知」在这里没有意义:引擎发了帧就代表它数过了。
        current.research = {
          queries: msg.queries ?? 0,
          ledgerTotal: msg.ledger_total ?? 0,
          byOrigin: msg.by_origin,
          // 预检索(2026-08 P1):那一枪是**引擎**在模型开口前打的,却计入 queries ——
          // 不透传这个字段,chip 就会把引擎的动作说成模型搜的(它自己制造一条新的谎)。
          prefetch: msg.prefetch,
        };
        break;
      case 'evidence_appended':
        // P0 刻意不消费(见 AgentEvidenceAppendedFrame 注释):它是 P1 的 [[E<n>]] resolve 输入。
        // 显式列出而不是靠 switch 落空,是为了让「这里没做」是一个可读的决定而不是一处遗漏。
        break;
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
        if (typeof msg.text === 'string' && msg.text.length > 0) {
          current.thinkingText = (current.thinkingText ?? '') + msg.text;
        }
        break;
      case 'message_complete':
        // 暂停打断时在途 tool_use 不会再有 tool_result —— 标"已中止"避免永久转圈
        markPendingToolsAborted(current, !!current.paused);
        // claim_audit 轻标注(W2 P1-b):本轮触发过自动纠偏 → MessageTurn 轮尾渲染中性小标注。
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
        // 捕获 errorCode(W5 P0-C3):驱动最后一轮可重试错误的「重试」按钮 + code→文案映射。
        current.errorCode = msg.code;
        current.complete = true;
        current.placeholder = undefined;
        currentTextBlock = null;
        currentToolBlock = null;
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
