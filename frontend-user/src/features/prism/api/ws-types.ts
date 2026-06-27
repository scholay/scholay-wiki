/**
 * Prism (智能写作) — agent-native 用户 WS 消息协议类型。
 * 复用 agent WS 协议子集(同 claw/smart-search)。prism 不带附件。
 * error / displaced / resync_user 三个控制/元帧复用 shared/lib/agent-stream 的共享 arm(架构报告 M4)。
 */

import type {
  AgentErrorFrame,
  AgentDisplacedFrame,
  AgentResyncUserFrame,
} from '@/shared/lib/agent-stream';

export type PrismClientMessage =
  // titleSeed:本轮「干净的原始指令」(不含聚焦选区提示),供 agent 用它给项目自动起名,
  // 而非拿巨型 system 前缀起名。仅首轮(项目仍是默认名)实际生效,后端落库幂等。
  | { type: 'user_message'; content: string; titleSeed?: string }
  | { type: 'stop_generation' }
  | { type: 'ping' };

export type PrismServerMessage =
  | { type: 'connected'; sessionId: string }
  | { type: 'content_start'; blockType: 'text' | 'tool_use'; toolName?: string; toolUseId?: string }
  | { type: 'content_delta'; text?: string; toolInput?: string }
  | { type: 'tool_use_complete'; toolName: string; toolUseId: string; input: unknown }
  | { type: 'tool_result'; toolUseId: string; content: unknown; isError: boolean }
  | { type: 'message_complete' }
  | AgentErrorFrame
  | { type: 'thinking'; text: string }
  | { type: 'status'; state: 'idle' | 'thinking' | 'tool_executing' | 'streaming' | 'permission_pending'; verb?: string }
  | { type: 'pong' }
  | AgentDisplacedFrame
  | { type: 'session_title_updated'; sessionId: string; title: string }
  | { type: 'resync_start' }
  | AgentResyncUserFrame
  | { type: 'resync_end' };

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
