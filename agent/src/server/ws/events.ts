/**
 * WebSocket event type definitions
 *
 * 定义客户端与服务器之间 WebSocket 通信的消息类型。
 */

// ============================================================================
// Client → Server
// ============================================================================

export type ClientMessage =
  | { type: 'prewarm_session' }
  | { type: 'user_message'; content: string; attachments?: AttachmentRef[] }
  | {
      type: 'permission_response'
      requestId: string
      allowed: boolean
      rule?: string
      updatedInput?: Record<string, unknown>
    }
  | {
      type: 'computer_use_permission_response'
      requestId: string
      response: ComputerUsePermissionResponse
    }
  | { type: 'set_permission_mode'; mode: string }
  | { type: 'set_runtime_config'; providerId: string | null; modelId: string }
  | { type: 'stop_generation' }
  | { type: 'ping' }

export type AttachmentRef = {
  type: 'file' | 'image'
  name?: string
  path?: string
  data?: string // base64 for images
  mimeType?: string
}

// ============================================================================
// Server → Client
// ============================================================================

export type ServerMessage =
  | { type: 'connected'; sessionId: string }
  | { type: 'content_start'; blockType: 'text' | 'tool_use'; toolName?: string; toolUseId?: string; parentToolUseId?: string }
  | { type: 'content_delta'; text?: string; toolInput?: string }
  | { type: 'tool_use_complete'; toolName: string; toolUseId: string; input: unknown; parentToolUseId?: string }
  | { type: 'tool_result'; toolUseId: string; content: unknown; isError: boolean; parentToolUseId?: string }
  | {
      type: 'permission_request'
      requestId: string
      toolName: string
      toolUseId?: string
      input: unknown
      description?: string
    }
  | {
      type: 'computer_use_permission_request'
      requestId: string
      request: ComputerUsePermissionRequest
    }
  | { type: 'message_complete'; usage: TokenUsage }
  | { type: 'thinking'; text: string }
  | { type: 'status'; state: ChatState; verb?: string; elapsed?: number; tokens?: number }
  | { type: 'error'; message: string; code: string; retryable?: boolean }
  | { type: 'system_notification'; subtype: string; message?: string; data?: unknown }
  | { type: 'pong' }
  | { type: 'team_update'; teamName: string; members: TeamMemberStatus[] }
  | { type: 'team_created'; teamName: string }
  | { type: 'team_deleted'; teamName: string }
  | { type: 'task_update'; taskId: string; status: string; progress?: string }
  | { type: 'session_title_updated'; sessionId: string; title: string }
  // ─── 断线续流 (resync) ────────────────────────────────────────────────
  // 用户在生成途中断开 WS 又重连时, 服务端把"当前这一轮已产生的事件"整段回放。
  // 协议: resync_start → (可选)resync_user → 缓冲的本轮 ServerMessage 序列 → resync_end。
  // 前端收到 resync_start 先把本轮已渲染的局部清掉 (截到上一条 message_complete),
  // 然后用回放事件从头重建这一轮; resync_user 携带本轮用户消息文本, 用来渲染用户气泡
  // (重连后前端局部 pendingTurns 已随卸载清空, 拿不到用户文本)。
  | { type: 'resync_start' }
  | { type: 'resync_user'; content: string }
  | { type: 'resync_end' }

export type TokenUsage = {
  input_tokens: number
  output_tokens: number
  cache_read_tokens?: number
  cache_creation_tokens?: number
  /** 本轮实际调用的模型 code。后端账本(llm_token_usage.model)据此统计 agent 侧用量;
   *  来源是本轮 assistant / system-init 消息里的 model(result 消息本身不带 model)。 */
  model?: string
}

export type ChatState = 'idle' | 'thinking' | 'tool_executing' | 'streaming' | 'permission_pending'

export type TeamMemberStatus = {
  agentId: string
  role: string
  status: 'running' | 'idle' | 'completed' | 'error'
  currentTask?: string
}

export type ComputerUseGrantFlags = {
  clipboardRead: boolean
  clipboardWrite: boolean
  systemKeyCombos: boolean
}

export type ComputerUseResolvedApp = {
  bundleId: string
  displayName: string
  path?: string
  iconDataUrl?: string
}

export type ComputerUseResolvedAppRequest = {
  requestedName: string
  resolved?: ComputerUseResolvedApp
  isSentinel: boolean
  alreadyGranted: boolean
  proposedTier: 'read' | 'click' | 'full'
}

export type ComputerUsePermissionRequest = {
  requestId: string
  reason: string
  apps: ComputerUseResolvedAppRequest[]
  requestedFlags: Partial<ComputerUseGrantFlags>
  screenshotFiltering: 'native' | 'none'
  tccState?: {
    accessibility: boolean
    screenRecording: boolean
  }
  willHide?: Array<{ bundleId: string; displayName: string }>
  autoUnhideEnabled?: boolean
}

export type ComputerUsePermissionResponse = {
  granted: Array<{
    bundleId: string
    displayName: string
    grantedAt: number
    tier?: 'read' | 'click' | 'full'
  }>
  denied: Array<{
    bundleId: string
    reason: 'user_denied' | 'not_installed'
  }>
  flags: ComputerUseGrantFlags
  userConsented?: boolean
}

// ============================================================================
// Internal types
// ============================================================================

export type WebSocketSession = {
  sessionId: string
  connectedAt: number
  abortController?: AbortController
  isGenerating: boolean
}
