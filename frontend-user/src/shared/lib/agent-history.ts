/**
 * Agent transcript 历史回放 → 共享 Turn[] 的**唯一**实现。
 *
 * 背景:三个 feature(智能搜索 / 智能助手 / 智能写作)重入时都要把 agent jsonl transcript
 * 折成 Turn[] 渲染。原本各自有一份几乎逐字相同的 replayHistoryAsTurns / foldHistoryToTurns,
 * 其中智能写作那份是**阉割版**:把一轮里所有 assistant 文本用 `\n\n` 拼成一段、且整条丢弃
 * tool / thinking 块。后果是重入后的渲染结构与实时流(foldXxxMessages)不一致 —— 实时被折进
 * 「处理过程」的中间诊断文本,在历史里失去 tool 块锚点后被平铺出来(用户看到的「重入后变了样」)。
 *
 * 收口到这一份纯 TS 叶子(无 React、无 feature 依赖),三处行为一致、只维护与测一份。
 * feature 差异(claw 的附件 chip)通过 {@link ReplayHistoryOptions.parseUserEntry} 注入,
 * 核心折叠逻辑保持 feature 无关。
 *
 * 协议形态(cc-haha agent transcript,实测):
 *   entry.type ∈ {user, assistant, tool_use, tool_result, system}
 *   - tool_use / tool_result 在 cc-haha 是**顶级 entry**(content[0] 是对应 block);
 *     Anthropic 原生协议把它们塞在 user / assistant 的 content[] 里 —— 两种形态都兼容。
 *   - 跳过 system entry 与 isSidechain(subagent 内部对话,跟主线无关)。
 *   - 每个 user entry 都尝试 strip backend 注入的 system prompt prefix(WS 重连会再注入一次,
 *     不能只对第一轮生效)。
 */

import {
  markPendingToolsAborted,
  type ToolBlock,
  type Turn,
  type TurnAttachment,
} from '@/shared/types/chat';
import { stripAgentBridgePrefix } from '@/shared/lib/agent-prefix';

/**
 * 历史 entry 的最小公共形状 —— claw(ClawHistoryEntry)、smart-search
 * (SmartSearchHistoryEntry)、prism(PrismHistoryMsg)三个具体类型都结构兼容(它们都带
 * `type: string` + `content: unknown`,并各自附加 id/timestamp/model 等额外字段)。
 */
export interface AgentHistoryEntry {
  type?: string;
  content?: unknown;
  /** subagent 内部对话 —— 跳过不渲染 */
  isSidechain?: boolean;
  /** 该消息所在的轮被用户打断 —— 末尾渲染「已暂停」 */
  interrupted?: boolean;
}

/** Anthropic content[] 里的块(user / assistant 各种形态共用这一份 narrow)。 */
interface AnthropicBlock {
  type?: string;
  text?: string;
  thinking?: string;
  // tool_use
  id?: string;
  name?: string;
  input?: unknown;
  // tool_result
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}

/** user entry 的解析结果:用户气泡正文 + 可选附件 chip。 */
export interface ParsedUserEntry {
  text: string;
  attachments?: TurnAttachment[];
}

export interface ReplayHistoryOptions {
  /**
   * 自定义 user entry → { 正文, 附件 } 的解析。
   * 默认(smart-search / prism):抽 text 块拼接 + 剥 agentbridge 注入前缀,无附件。
   * claw 传入带 `@"path"` 附件前缀剥离 + 老内联 image block 还原的版本。
   */
  parseUserEntry?: (content: unknown) => ParsedUserEntry;
}

/**
 * 从 content(string | block[])抽纯文本部分(只取 text 块,跳过 tool_result / thinking)。
 * 用于 user 气泡正文。string 形态刻意不 trim(与历史行为一致,user 输入两端空白由上游保证)。
 */
export function extractHistoryText(content: unknown): string {
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

/** 默认 user 解析:抽文本 + 剥注入前缀,无附件。 */
function defaultParseUserEntry(content: unknown): ParsedUserEntry {
  return { text: stripAgentBridgePrefix(extractHistoryText(content)) };
}

/** 从 content 抽所有 tool_result 条目(顶级 tool_result entry 与嵌入 user content[] 两种形态共用)。 */
function extractToolResults(
  content: unknown,
): { toolUseId: string; content: unknown; isError: boolean }[] {
  if (!Array.isArray(content)) return [];
  const out: { toolUseId: string; content: unknown; isError: boolean }[] = [];
  for (const block of content) {
    if (block && typeof block === 'object' && (block as AnthropicBlock).type === 'tool_result') {
      const b = block as AnthropicBlock;
      if (typeof b.tool_use_id === 'string') {
        out.push({ toolUseId: b.tool_use_id, content: b.content, isError: b.is_error === true });
      }
    }
  }
  return out;
}

/**
 * 把 agent transcript 的 entry 序列折成 Turn[]:有序保留每个 text 块、tool 块(配对 tool_result)、
 * thinking 通道 —— 与实时流的 fold 产出**同构**,渲染层据此一致地把中间过程折进「处理过程」、
 * 末尾文本当最终气泡。
 */
export function replayHistoryAsTurns(
  entries: AgentHistoryEntry[] | null | undefined,
  options: ReplayHistoryOptions = {},
): Turn[] {
  if (!entries || entries.length === 0) return [];
  const parseUser = options.parseUserEntry ?? defaultParseUserEntry;

  const turns: Turn[] = [];
  let current: Turn | null = null;
  let userTurnCount = 0;
  // 全局 tool block 索引 —— 让 tool_result 能挂回任意 turn 的 tool block(toolUseId 全局唯一)。
  const toolBlockByUseId = new Map<string, ToolBlock>();

  const finishTurn = () => {
    if (current) {
      // 历史里被暂停过的在途 tool 没有 result —— 标「已停止」,回放时不再转圈。
      markPendingToolsAborted(current, !!current.paused);
      current.complete = true;
      turns.push(current);
      current = null;
    }
  };
  // 没有当前 turn 时兜底起一轮(transcript 罕见以 assistant / tool_use 开头时用)。
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

    // agent 把"被用户打断那条消息"标了 interrupted(synthetic「[Request interrupted by user]」
    // 被服务端隐藏、改挂成 flag)→ 当前轮标「已暂停」,重入回放时末尾渲染「已暂停」。
    if (entry.interrupted && current) current.paused = true;

    if (entry.type === 'user') {
      // 1. 先把嵌入 user content[] 的 tool_result 挂回对应 tool block(协议兼容路径)。
      for (const tr of extractToolResults(entry.content)) {
        const tb = toolBlockByUseId.get(tr.toolUseId);
        if (tb) {
          tb.result = tr.content;
          tb.isError = tr.isError;
        }
      }
      // 2. 解析用户可见正文 + 附件(feature 可定制)。
      const { text, attachments } = parseUser(entry.content);
      // 3. 有用户可见内容才切新轮 —— 纯 tool_result 的 user entry 不开新轮。
      if (text || (attachments && attachments.length > 0)) {
        finishTurn();
        userTurnCount += 1;
        current = {
          id: `history-turn-${userTurnCount}`,
          userText: text,
          userAttachments: attachments && attachments.length > 0 ? attachments : undefined,
          blocks: [],
          complete: false, // 暂 false,finishTurn 翻成 true
        };
      }
      continue;
    }

    if (entry.type === 'tool_use') {
      // 顶级 tool_use entry(cc-haha 拆分形态):content[0] 是 tool_use block。
      const blocks = Array.isArray(entry.content) ? (entry.content as AnthropicBlock[]) : [];
      for (const b of blocks) {
        if (b && typeof b === 'object' && b.type === 'tool_use') pushToolUse(b);
      }
      continue;
    }
    if (entry.type === 'tool_result') {
      // 顶级 tool_result entry(cc-haha 拆分形态):content[0] 是 tool_result block。
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
              // 只合并**相邻** text 块(避免无谓间距);被 tool 块隔开的文本各自独立 —— 这正是
              // 让中间诊断文本与最终回答分属不同 block、从而能折进「处理过程」的关键。
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
            // 兼容路径:老协议把 tool_use 嵌进 assistant content[]。
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
