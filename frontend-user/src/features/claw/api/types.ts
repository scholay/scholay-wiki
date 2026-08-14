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
  AgentClaimAudit,
  AgentErrorFrame,
  AgentDisplacedFrame,
  AgentEvidenceAppendedFrame,
  AgentResearchStateFrame,
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
      /** 幂等键 + 投递确认配对:hook 层预 mint,后端 hub 写入上游成功后回 user_ack{clientTurnId}。 */
      clientTurnId?: string;
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
  // toolInput/toolPath:Write 入参明文的逐 token 流(agent turnLoop P1-1)。fold 挂到在途
  // ToolBlock → ToolCallBlock「构建中」态实时预览(此前 claw 丢弃,仅 prism 消费)。
  | { type: 'content_delta'; text?: string; toolInput?: string; toolPath?: string }
  | { type: 'tool_use_complete'; toolName: string; toolUseId: string; input: unknown }
  // userMessage:面向用户的失败摘要(仅 isError 时;agent 双轨制 W5 P0-A)。旧 agent 不发 → 可选。
  | { type: 'tool_result'; toolUseId: string; content: unknown; isError: boolean; userMessage?: string }
  // 产物带外声明:执行器每轮 diff ./out/ 后发,fold 绑到当前轮 → 就近产物卡(见 shared TurnArtifact)。
  | { type: 'artifact'; name: string; path: string; kind: 'file' | 'dir'; mime: string; size: number }
  // claim_audit:诚实性核验元数据(W2 P1-b,agent 纠偏轮触发时附带)。旧 agent 不发 → 可选。
  | { type: 'message_complete'; claim_audit?: AgentClaimAudit }
  // DSML 作废重打(审计 [10]):撤回本轮已流式发出的残缺前缀,重打的完整答案随后重建。
  | { type: 'round_discarded' }
  // 证据账本(2026-08 P0-c):引擎口径的取证过程计数 → 轮尾 ResearchStateChip 带外展示。
  // evidence_appended 是 P1 的输入,P0 收到即忽略(fold 有显式 no-op case,不是漏了)。
  | AgentResearchStateFrame
  | AgentEvidenceAppendedFrame
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
  // 断线续流: (重)建连后 backend hub 整段回放当前 in-flight 轮(mirrors backend hub.go resync*Frame)。
  //   resync_start → (可选)resync_user → 缓冲事件 → resync_end{inFlight}。
  //   inFlight=false = 服务端当前无在途轮的权威对账信号(useAgentSocket 转成 resyncIdle 单调计数)。
  | { type: 'resync_start' }
  | AgentResyncUserFrame
  | { type: 'resync_end'; inFlight?: boolean }
  // 投递确认(mirrors backend hub.go userAckFrame):user_message 已写入上游 agent。
  | { type: 'user_ack'; clientTurnId?: string };

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
  // 'artifact' 是后端 FoldToMessages 把 EvArtifact 折出的合成 entry(content = 产物字段);
  // 回放时 shared replayHistoryAsTurns 据此把产物绑回对应轮(见 TurnArtifact)。
  // 'error' 是失败轮终态合成 entry(EvError 折出,W3 P1-A 冻结契约:content = {code, message}),
  // 回放成与实时 error 终帧同构的 TurnErrorNotice;旧后端无此 entry → 分支不进。
  // 'research_state' 是取证过程计数的合成 entry(EvEvidence 里该轮**最后一条**全量快照,
  // content = [原帧],snake_case)。与 'artifact' 同范式:带外声明 → 合成 entry → 绑回对应轮
  // (Turn.research),让刷新/重入后的历史轮也能还原 ResearchStateChip。
  type:
    | 'user'
    | 'assistant'
    | 'system'
    | 'tool_use'
    | 'tool_result'
    | 'artifact'
    | 'error'
    | 'research_state';
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
