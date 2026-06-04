/**
 * Prism (智能写作) — agent-native 用户 WS 消息协议类型。
 * 复用 agent WS 协议子集(同 claw/smart-search,各 feature 一份)。prism 不带附件。
 */

export type PrismClientMessage =
  | { type: 'user_message'; content: string }
  | { type: 'stop_generation' }
  | { type: 'ping' };

export type PrismServerMessage =
  | { type: 'connected'; sessionId: string }
  | { type: 'content_start'; blockType: 'text' | 'tool_use'; toolName?: string; toolUseId?: string }
  | { type: 'content_delta'; text?: string; toolInput?: string }
  | { type: 'tool_use_complete'; toolName: string; toolUseId: string; input: unknown }
  | { type: 'tool_result'; toolUseId: string; content: unknown; isError: boolean }
  | { type: 'message_complete' }
  | { type: 'error'; message: string; code?: string }
  | { type: 'thinking'; text: string }
  | { type: 'status'; state: 'idle' | 'thinking' | 'tool_executing' | 'streaming' | 'permission_pending'; verb?: string }
  | { type: 'pong' }
  | { type: 'displaced'; reason?: string; message: string }
  | { type: 'session_title_updated'; sessionId: string; title: string }
  | { type: 'resync_start' }
  | { type: 'resync_user'; content: string }
  | { type: 'resync_end' };

export type PrismWSState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | 'error' | 'displaced';

/** tool_use_complete.input 里 Edit/Write 工具的入参(用于取 file_path 判断改了哪个文件)。 */
export interface ToolFileInput {
  file_path?: string;
  old_string?: string;
  new_string?: string;
  content?: string;
}
