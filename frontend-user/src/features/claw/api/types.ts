/**
 * 智能助手 (Claw) — WS 消息协议 + DTO 类型。
 *
 * 复用了 agent /api/docs 中描述的 WS 消息协议子集。跟 smart-search 的差异:
 *   - ClientMessage 多了 attachments 字段 (Anthropic vision 走 base64 image; 文件走 textContent)
 *   - 不假设强格式约束 (smart-search 是结构化论文搜索, Claw 是通用对话)
 */

// ─── 附件 ────────────────────────────────────────────────────────────────

/**
 * Backend /claw/upload 返回的附件 DTO (方案 B)。
 *
 * backend 已把原始文件推到 agent 的会话隔离 cwd, 这里只拿到落盘路径 path 和会话 id。
 * 发送时把 path 放进 user_message.attachments[].path, agent 用 Read 工具原生分析
 * (图片走 vision, PDF 走文档理解, 文本直接读) —— backend 不再抽文本 / 不再回传 base64。
 */
export interface AttachmentDTO {
  /** 文件落点所属的 agent 会话 (新对话首次上传会创建并回传, 前端需 adopt) */
  sessionId: string;
  type: 'image' | 'file';
  name: string;
  mimeType: string;
  size: number;
  /** agent 容器内绝对路径 (会话隔离 cwd 下), 发送时透传到 attachments[].path */
  path: string;
  /** 仅前端本地: 图片预览用的 object URL (不来自后端, 提交后释放) */
  previewUrl?: string;
}

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
  // 切换当前 WS 连接的 model (per-session, 不写盘)。
  // providerId=null = 用 admin 当前激活的 provider; modelId = agent 的 model id。
  | { type: 'set_runtime_config'; providerId: string | null; modelId: string };

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
  | { type: 'error'; message: string }
  | { type: 'thinking'; text: string }
  | {
      type: 'status';
      state: 'idle' | 'thinking' | 'tool_executing' | 'streaming' | 'permission_pending';
      verb?: string;
      elapsed?: number;
      tokens?: number;
    }
  | { type: 'pong' }
  // 多窗口接管: 后端 displacement 路径下发, 表示当前 WS 被另一 tab 顶掉了。
  // socket 不再自动重连; UI 弹 banner 提示用户手动 "切回这里" (takeOver)。
  //
  // reason 字段是结构化原因码 (跟后端 agentbridge.DisplacedReason 对齐):
  //   - 'session_taken_over' (默认): 同账号别处打开
  //   - 'token_revoked' (预留): 管理员强制下线
  //   - 'quota_exhausted' (预留): 配额耗尽中断
  //   - 'server_shutdown' (预留): 服务端 graceful shutdown
  // message 是后端给的兜底中文 (前端不识别 reason 时直接显示)。
  | {
      type: 'displaced';
      reason?: 'session_taken_over' | 'token_revoked' | 'quota_exhausted' | 'server_shutdown';
      message: string;
    }
  // agent 在首轮回答后会异步起 title gen, 完成后 push 这个事件。
  // ClawPage 收到 → invalidate ['claw', 'sessions'] 让 sidebar 拿到新 title。
  | { type: 'session_title_updated'; sessionId: string; title: string }
  // 断线续流: 重连后 agent 整段回放当前 in-flight 轮 (见 agent ws/events.ts)。
  //   resync_start → (可选)resync_user → 缓冲事件 → resync_end。
  | { type: 'resync_start' }
  | { type: 'resync_user'; content: string }
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
