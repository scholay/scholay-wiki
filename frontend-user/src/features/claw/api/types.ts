/**
 * 智能助手 (Claw) — WS 消息协议 + DTO 类型。
 *
 * 复用了 agent /api/docs 中描述的 WS 消息协议子集。跟 smart-search 的差异:
 *   - ClientMessage 多了 attachments 字段 (Anthropic vision 走 base64 image; 文件走 textContent)
 *   - 不假设强格式约束 (smart-search 是结构化论文搜索, Claw 是通用对话)
 *
 * error / displaced / resync_user 三个「控制/元帧」直接复用 shared/lib/agent-stream 的共享 arm,
 * 不再各 feature 抄一份(架构报告 M4 —— 这三处此前已漂移)。
 */

import type {
  AgentErrorFrame,
  AgentDisplacedFrame,
  AgentResyncUserFrame,
} from '@/shared/lib/agent-stream';

// ─── 附件 ────────────────────────────────────────────────────────────────

// 附件/引用 DTO 已上提 @/shared/types/chat(2026-07 三 feature 输入框统一;后端泛化为
// internal/agentattach)。此处 re-export 保持 claw 内既有 import 路径不动。
export type { AttachmentDTO, ReferenceItemDTO, ReferenceResultDTO } from '@/shared/types/chat';

// ─── WS 消息协议 ─────────────────────────────────────────────────────────

/**
 * 客户端→服务端。content 是文本部分; attachments 只带 path (文件已由 backend 推到
 * 会话隔离 cwd)。agent 的 materializeAttachments 用 @"path" 引用它们 → Read 工具原生分析。
 * 图片和文件走同一条 path 通道, 不再有 base64 / textContent 区分。
 */
export type ClientMessage =
  | {
      type: 'user_message';
      content: string;
      attachments?: { type: 'image' | 'file'; name?: string; mimeType?: string; path: string }[];
    }
  | { type: 'stop_generation' }
  | { type: 'ping' }
  // 切换会话模型(P2:backend hub 权威校验 → 落 agent_sessions.pinned_model → 重组帧转发)。
  // modelId = 目录 model id;useDefault=true(或 modelId 空)= unpin 回 feature 默认绑定。
  | { type: 'set_runtime_config'; providerId: string | null; modelId: string; useDefault?: boolean };

export type ServerMessage =
  | { type: 'connected'; sessionId: string }
  | {
      type: 'content_start';
      blockType: 'text' | 'tool_use';
      toolName?: string;
      toolUseId?: string;
    }
  | { type: 'content_delta'; text?: string; toolInput?: string }
  | { type: 'tool_use_complete'; toolName: string; toolUseId: string; input: unknown }
  | { type: 'tool_result'; toolUseId: string; content: unknown; isError: boolean }
  | { type: 'message_complete' }
  | AgentErrorFrame
  | { type: 'thinking'; text: string }
  | {
      type: 'status';
      state: 'idle' | 'thinking' | 'tool_executing' | 'streaming' | 'permission_pending';
      verb?: string;
      elapsed?: number;
      tokens?: number;
    }
  | { type: 'pong' }
  // 多窗口接管: 后端 displacement 路径下发, 当前 WS 被另一 tab 顶掉。socket 不再自动重连;
  // UI 弹 banner 提示手动 "切回这里" (takeOver)。形态(含 reason 4 值枚举)见 AgentDisplacedFrame。
  | AgentDisplacedFrame
  // agent 在首轮回答后会异步起 title gen, 完成后 push 这个事件。
  // ClawPage 收到 → invalidate ['claw', 'sessions'] 让 sidebar 拿到新 title。
  | { type: 'session_title_updated'; sessionId: string; title: string }
  // 断线续流: 重连后 agent 整段回放当前 in-flight 轮 (见 agent ws/events.ts)。
  //   resync_start → (可选)resync_user → 缓冲事件 → resync_end。
  | { type: 'resync_start' }
  | AgentResyncUserFrame
  | { type: 'resync_end' };

export type ClawWSState =
  | 'idle'
  | 'connecting'
  | 'open'
  | 'reconnecting'
  | 'closed'
  | 'error'
  /** 被另一窗口接管, 等用户点 takeOver 重新建联 */
  | 'displaced';

// ─── transcript history entry (agent jsonl 回放) ─────────────────────────

export interface ClawHistoryEntry {
  id: string;
  type: 'user' | 'assistant' | 'system' | 'tool_use' | 'tool_result';
  /** Anthropic content array; UI 自己做 narrow 解释 */
  content: unknown;
  timestamp: string;
  model?: string;
  isSidechain?: boolean;
  /**
   * 这条消息所在的轮被用户暂停打断 —— 服务端把被隐藏的「[Request interrupted by user]」
   * 标记折算成此 flag (见 agent sessionService.shouldHideTranscriptEntry)。回放据此显示「已暂停」。
   */
  interrupted?: boolean;
}

export interface ClawContextSnapshot {
  sessionId: string;
  totalTokens: number;
  maxTokens: number;
  percentage: number;
  model: string;
}
