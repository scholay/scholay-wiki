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

import { stripAgentBridgePrefix } from '@/shared/lib/agent-prefix';
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
  pendingTurns: Pick<Turn, 'id' | 'userText' | 'userAttachments' | 'paused'>[],
): Turn[] {
  const turns: Turn[] = pendingTurns.map((p) => ({
    id: p.id,
    userText: p.userText,
    userAttachments: p.userAttachments,
    blocks: [],
    complete: false,
    // 点过 stop 的那轮 —— 本地标记透传到 Turn, 末尾渲染「已暂停」
    paused: p.paused,
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

type AnthropicBlock = {
  type?: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
  source?: { type: string; media_type?: string; data?: string };
};

// agentbridge prefix strip — 用 shared 实现 (同 smart-search), 防止 marker drift。
// 原本这里也有本地 marker "SCHOLAY 智能助手 — 规则结束", backend 改名后未同步导致
// 整段系统提示泄漏到用户对话气泡。统一收口到 @/shared/lib/agent-prefix。
const stripInjectedPromptPrefix = stripAgentBridgePrefix;

function extractUserText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter(
      (b): b is AnthropicBlock =>
        b !== null && typeof b === 'object' && (b as AnthropicBlock).type === 'text',
    )
    .map((b) => (typeof b.text === 'string' ? b.text : ''))
    .join('\n')
    .trim();
}

function extractUserAttachments(content: unknown): Turn['userAttachments'] {
  if (!Array.isArray(content)) return undefined;
  const out: NonNullable<Turn['userAttachments']> = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const b = block as AnthropicBlock;
    if (b.type === 'image') {
      out.push({
        type: 'image',
        name: 'image',
        mimeType: b.source?.media_type ?? 'image/png',
        size: b.source?.data ? Math.floor((b.source.data.length * 3) / 4) : 0,
        // 老格式 transcript 里图片直接内联 base64 —— 拼成 data URL 当缩略图源。
        previewUrl: b.source?.data
          ? `data:${b.source.media_type ?? 'image/png'};base64,${b.source.data}`
          : undefined,
      });
    }
  }
  return out.length > 0 ? out : undefined;
}

// ─── 历史回放: 从 user 文本里恢复附件原名 ──────────────────────────────────
//
// 当前 agent 的 buildUserContent(conversationService.ts) 把附件落成纯文本前缀:
//   `@"/home/bun/sessions/<sid>/<uuid>-screenshot.png" @"/.../<uuid>-paper.pdf" <用户文字>`
// transcript 里没有 image block / base64 —— 只有这段 @"path"。若不处理, 回放时:
//   (1) 整条 @"绝对路径" 会泄漏进用户气泡, 用户看到的就是 UUID 文件名;
//   (2) 附件不会以 chip 形式出现。
// 这里把开头的 @"path" 前缀剥下来, 还原 **去掉 UUID 前缀的原始文件名** 当 chip。

/** agent 存盘时加的 `${crypto.randomUUID()}-` 前缀 (8-4-4-4-12 小写 hex)。 */
const STORED_UUID_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i;
const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|bmp|svg|avif|heic|heif)$/i;
/** 用户没打字、只发附件时 agent 注入的占位句 —— 回放时不该显示给用户。 */
const EMPTY_ATTACHMENT_PLACEHOLDER = 'Please analyze the attached files.';

function attachmentMimeFromName(name: string): string {
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  const map: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
    gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', avif: 'image/avif',
    pdf: 'application/pdf', md: 'text/markdown', txt: 'text/plain', csv: 'text/csv',
    json: 'application/json',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  };
  if (map[ext]) return map[ext];
  return IMAGE_EXT_RE.test(name) ? 'image/*' : 'application/octet-stream';
}

/**
 * 剥离 user 文本开头的 `@"path"` 附件前缀, 返回 { 清理后的正文, 还原的附件 chip }。
 * 没有前缀时原样返回 + 空附件。
 */
function splitAttachmentPrefix(text: string): {
  text: string;
  attachments: NonNullable<Turn['userAttachments']>;
} {
  const attachments: NonNullable<Turn['userAttachments']> = [];
  let rest = text;
  const tokenRe = /^@"([^"]+)"\s*/;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(rest)) !== null) {
    const abs = m[1];
    const base = abs.split('/').pop() ?? abs;
    // 只认真附件: 绝对路径 + basename 带 agent 落盘的 UUID 前缀。否则是用户自己打的
    // @"..." 文本(比如让助手处理一段带引号的内容), 原样留在气泡里, 不当附件剥走。
    if (!abs.startsWith('/') || !STORED_UUID_PREFIX.test(base)) break;
    const name = base.replace(STORED_UUID_PREFIX, '') || base;
    attachments.push({
      type: IMAGE_EXT_RE.test(name) ? 'image' : 'file',
      name,
      mimeType: attachmentMimeFromName(name),
      size: 0,
      path: abs,
    });
    rest = rest.slice(m[0].length);
  }
  // 只发附件、没打字 → 去掉 agent 注入的英文占位句, 留空正文。
  if (attachments.length > 0 && rest.trim() === EMPTY_ATTACHMENT_PLACEHOLDER) {
    rest = '';
  }
  return { text: rest, attachments };
}

function extractToolResults(
  content: unknown,
): { toolUseId: string; content: unknown; isError: boolean }[] {
  if (!Array.isArray(content)) return [];
  const out: { toolUseId: string; content: unknown; isError: boolean }[] = [];
  for (const block of content) {
    if (
      block &&
      typeof block === 'object' &&
      (block as AnthropicBlock).type === 'tool_result'
    ) {
      const b = block as AnthropicBlock;
      if (typeof b.tool_use_id === 'string') {
        out.push({
          toolUseId: b.tool_use_id,
          content: b.content,
          isError: b.is_error === true,
        });
      }
    }
  }
  return out;
}

export function replayHistoryAsTurns(
  entries: ClawHistoryEntry[] | null | undefined,
): Turn[] {
  if (!entries || entries.length === 0) return [];

  const turns: Turn[] = [];
  let current: Turn | null = null;
  let userTurnCount = 0;
  const toolBlockByUseId = new Map<string, ToolBlock>();

  const finishTurn = () => {
    if (current) {
      // 历史里被暂停过的在途 tool 没有 result —— 标"已停止", 回放时不再转圈
      markPendingToolsAborted(current, !!current.paused);
      current.complete = true;
      turns.push(current);
      current = null;
    }
  };
  const ensureCurrentTurn = () => {
    if (!current) {
      userTurnCount += 1;
      current = {
        id: `history-turn-${userTurnCount}-orphan`,
        userText: '',
        blocks: [],
        complete: false,
      };
    }
    return current;
  };
  const pushToolUse = (block: AnthropicBlock) => {
    if (typeof block.id !== 'string') return;
    const turn = ensureCurrentTurn();
    const tb: ToolBlock = {
      kind: 'tool',
      id: `tool-${block.id}`,
      toolName: typeof block.name === 'string' ? block.name : '',
      toolUseId: block.id,
      input: block.input,
    };
    turn.blocks.push(tb);
    toolBlockByUseId.set(block.id, tb);
  };
  const attachToolResult = (block: AnthropicBlock) => {
    if (typeof block.tool_use_id !== 'string') return;
    const tb = toolBlockByUseId.get(block.tool_use_id);
    if (tb) {
      tb.result = block.content;
      tb.isError = block.is_error === true;
    }
  };

  for (const entry of entries) {
    if (entry.isSidechain) continue;
    if (entry.type === 'system') continue;

    // agent 把"被用户打断那条消息"标了 interrupted (synthetic「[Request interrupted by user]」
    // 标记被服务端隐藏, 改挂成 flag) → 当前轮标"已暂停", 重入回放时末尾渲染「已暂停」。
    if (entry.interrupted && current) current.paused = true;

    if (entry.type === 'user') {
      const rawText = extractUserText(entry.content);
      // 先剥 @"path" 附件前缀 (恢复原名 chip), 再剥 agentbridge SystemPrompt 前缀。
      const { text: bodyText, attachments: pathAttachments } = splitAttachmentPrefix(rawText);
      const imageAttachments = extractUserAttachments(entry.content) ?? [];
      // 现行 agent 流程附件走 @path 文本前缀; 老格式才有内联 image block —— 二选一不叠加。
      const attachments = pathAttachments.length > 0 ? pathAttachments : imageAttachments;
      const toolResults = extractToolResults(entry.content);
      for (const tr of toolResults) {
        const tb = toolBlockByUseId.get(tr.toolUseId);
        if (tb) {
          tb.result = tr.content;
          tb.isError = tr.isError;
        }
      }
      if (bodyText || attachments.length > 0) {
        finishTurn();
        userTurnCount += 1;
        current = {
          id: `history-turn-${userTurnCount}`,
          userText: stripInjectedPromptPrefix(bodyText),
          userAttachments: attachments.length > 0 ? attachments : undefined,
          blocks: [],
          complete: false,
        };
      }
      continue;
    }

    if (entry.type === 'tool_use') {
      const blocks = Array.isArray(entry.content) ? (entry.content as AnthropicBlock[]) : [];
      for (const b of blocks) {
        if (b && typeof b === 'object' && b.type === 'tool_use') pushToolUse(b);
      }
      continue;
    }
    if (entry.type === 'tool_result') {
      const blocks = Array.isArray(entry.content) ? (entry.content as AnthropicBlock[]) : [];
      for (const b of blocks) {
        if (b && typeof b === 'object' && b.type === 'tool_result') attachToolResult(b);
      }
      continue;
    }

    if (entry.type === 'assistant') {
      const turn = ensureCurrentTurn();
      const blocks = Array.isArray(entry.content) ? (entry.content as AnthropicBlock[]) : [];
      for (const block of blocks) {
        if (!block || typeof block !== 'object') continue;
        switch (block.type) {
          case 'text':
            if (typeof block.text === 'string' && block.text.length > 0) {
              const last = turn.blocks[turn.blocks.length - 1];
              if (last && last.kind === 'text') {
                last.text += block.text;
              } else {
                turn.blocks.push({
                  kind: 'text',
                  id: `text-${turn.blocks.length}-${turn.id}`,
                  text: block.text,
                });
              }
            }
            break;
          case 'thinking':
            if (typeof block.thinking === 'string' && block.thinking.length > 0) {
              turn.thinkingText = (turn.thinkingText ?? '') + block.thinking;
            }
            break;
          case 'tool_use':
            pushToolUse(block);
            break;
        }
      }
      continue;
    }
  }
  finishTurn();
  return turns;
}
