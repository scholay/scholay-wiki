/**
 * Prism (智能写作) — agent-native 用户 WS 消息协议类型。
 * 复用 agent WS 协议子集(同 claw/smart-search)。prism 不带附件。
 * error / displaced / resync_user 三个控制/元帧复用 shared/lib/agent-stream 的共享 arm(架构报告 M4)。
 */

import type {
  AgentClaimAudit,
  AgentErrorFrame,
  AgentDisplacedFrame,
  AgentResyncUserFrame,
} from '@/shared/lib/agent-stream';

export type PrismClientMessage =
  // titleSeed:本轮「干净的原始指令」(不含聚焦选区提示),供 agent 用它给项目自动起名,
  // 而非拿巨型 system 前缀起名。仅首轮(项目仍是默认名)实际生效,后端落库幂等。
  | {
      type: 'user_message';
      content: string;
      titleSeed?: string;
      /** 方案 B 附件:文件已由 backend 推进会话 cwd,只透传 path(backend hub 折 @"path" 标记)。 */
      attachments?: { type: 'image' | 'file'; name?: string; mimeType?: string; path: string }[];
      /** 幂等键 + 投递确认配对:hook 层预 mint,后端 hub 写入上游成功后回 user_ack{clientTurnId}。 */
      clientTurnId?: string;
    }
  | { type: 'stop_generation' }
  | { type: 'ping' }
  // 切换会话模型(P2 模型目录化:backend hub 权威校验 → pinned_model → 重组转发)。
  | { type: 'set_runtime_config'; providerId: string | null; modelId: string; useDefault?: boolean };

export type PrismServerMessage =
  | { type: 'connected'; sessionId: string }
  | { type: 'content_start'; blockType: 'text' | 'tool_use'; toolName?: string; toolUseId?: string }
  | { type: 'content_delta'; text?: string; toolInput?: string; toolPath?: string }
  | { type: 'tool_use_complete'; toolName: string; toolUseId: string; input: unknown }
  // userMessage:面向用户的失败摘要(仅 isError 时;agent 双轨制 W5 P0-A)。旧 agent 不发 → 可选。
  | { type: 'tool_result'; toolUseId: string; content: unknown; isError: boolean; userMessage?: string }
  // aborted=true(V3-4.4-2,hub 盖章):本轮转发过 stop —— 半截稿不 autoApply,走确认门。
  // claim_audit:诚实性核验元数据(W2 P1-b,agent 纠偏轮触发时附带)。旧 agent 不发 → 可选。
  | { type: 'message_complete'; aborted?: boolean; claim_audit?: AgentClaimAudit }
  // DSML 作废重打(审计 [10]):撤回本轮已流式发出的残缺前缀,重打的完整答案随后重建。
  | { type: 'round_discarded' }
  | AgentErrorFrame
  | { type: 'thinking'; text: string }
  | { type: 'status'; state: 'idle' | 'thinking' | 'tool_executing' | 'streaming' | 'permission_pending'; verb?: string; elapsed?: number }
  | { type: 'pong' }
  | AgentDisplacedFrame
  | { type: 'session_title_updated'; sessionId: string; title: string }
  | { type: 'resync_start' }
  | AgentResyncUserFrame
  // (重)建连回放段末尾(mirrors backend hub.go resyncEndFrame):inFlight=false =「服务端当前
  // 无在途轮」的权威对账信号(useAgentSocket 转成 resyncIdle 单调计数,消费见 usePrismChat)。
  | { type: 'resync_end'; inFlight?: boolean }
  // 投递确认(mirrors backend hub.go userAckFrame):user_message 已写入上游 agent。
  | { type: 'user_ack'; clientTurnId?: string };

export type PrismWSState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | 'error' | 'displaced';

/**
 * tool_use_complete.input 里 Edit/Write/MultiEdit 工具的入参。
 * 用途:取 file_path 判断改了哪个文件;并据 old_string/new_string/content/edits 在 tool_result
 * 回拉真文件之前**乐观预览**改动到 diff(见 usePrismChat 的 applyToolEditPreview)。
 */
export interface ToolFileInput {
  file_path?: string;
  // Edit
  old_string?: string;
  new_string?: string;
  replace_all?: boolean;
  // Write
  content?: string;
  // MultiEdit
  edits?: { old_string?: string; new_string?: string; replace_all?: boolean }[];
}
