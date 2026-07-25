/**
 * Agent WS 流式消息的通用纯函数 —— 三个 feature(智能搜索 / 智能助手 / 智能写作)的
 * WS hook 都复用同一条 scholar_agent WS 协议,这两个函数原本在各自 socket.ts 里逐字复制了三遍。
 * 收口到 shared/lib(纯 TS 叶子,无依赖),续流截断这类对账逻辑只维护与测一份。
 */

/** agent WS 帧的最小公共形状:三个 feature 的 ServerMessage union 都满足(content_delta 带可选 text)。 */
export interface AgentStreamMessage {
  type: string;
  text?: string;
  /** content_delta 上的工具入参流(P1-1 逐 token 流式:Write.content 的明文增量)。 */
  toolInput?: string;
  /** 该 toolInput 流所写的目标文件(供前端校验是不是活动文件,避免非活动文件污染活动预览)。 */
  toolPath?: string;
}

// ── 共享「控制/元帧」契约(架构报告 M4 / Theme 3)──────────────────────────
// agent WS 协议真源在 agent/src/server/ws/events.ts;三个 feature(claw/smart-search/prism)
// 此前各自把 error / displaced / resync_user 这几个 arm 又抄了一份,且已漂移:claw 与
// smart-search 的 error 漏了 code+retryable、smart-search 的 displaced 漏了 reason、prism 的
// displaced.reason 退化成 string。这些 arm 收口到此一处,各 feature union 直接复用,从此「一处改、
// 三处一致」;useAgentSocket 也据此**带类型**读字段,取代散落的 (evt as {..}) 裸 cast。

/** 被另一窗口接管的结构化原因 —— 与后端 agentbridge.DisplacedReason 对齐。
 *  当前后端只下发 'session_taken_over',其余为预留(forward-compat),前端不据其分支。 */
export type AgentDisplacedReason =
  | 'session_taken_over'
  | 'token_revoked'
  | 'quota_exhausted'
  | 'server_shutdown';

/**
 * message_complete 帧可选的诚实性核验元数据(W2 P1-b;agent turnLoop sendComplete 附带,
 * mirrors agent/src/turn/turnLoop.ts claim_audit)。仅纠偏轮真实发生时出现;旧 agent /
 * 历史回放无此字段 → undefined,渲染层优雅降级(不出标注)。
 */
export interface AgentClaimAudit {
  dois_unverified?: number;
  delivery_mismatch?: boolean;
  fullread_mismatch?: boolean;
  /** 本轮触发过自动纠偏(模型已在同轮内补验证/更正)→ 前端渲染中性小标注。 */
  corrective_fired?: boolean;
}

/** error 帧(events.ts 真源形态)。code 驱动额度判定(isQuotaSignal),retryable 当前未消费但保留以对齐真源。 */
export interface AgentErrorFrame {
  type: 'error';
  message: string;
  code?: string;
  retryable?: boolean;
}

/** displaced 帧:message 是兜底中文,reason 是结构化原因。 */
export interface AgentDisplacedFrame {
  type: 'displaced';
  message: string;
  reason?: AgentDisplacedReason;
}

/** 断线续流:agent 回放当前 in-flight 轮的用户文本。 */
export interface AgentResyncUserFrame {
  type: 'resync_user';
  content: string;
}

/**
 * 多端实时同步:**别的端**在同一 session 发了一句话时,后端扇出 Hub 合成此帧广播给本端
 * (agent 不回吐用户消息,本端自己发的也不回声)。消费方据此往会话追加一条用户气泡。
 * 这是 backend Hub 合成的帧,不在 agent WS 协议(events.ts)里。
 */
export interface AgentUserEchoFrame {
  type: 'user_echo';
  content: string;
}

/** 把任意流帧窄化成 error 帧(非 error 返回 null)。单点、带类型,取代散落的 `(evt as {code?})`。 */
export function asAgentErrorFrame(e: AgentStreamMessage): AgentErrorFrame | null {
  return e.type === 'error' ? (e as AgentErrorFrame) : null;
}

/** 把任意流帧窄化成 displaced 帧(非 displaced 返回 null)。 */
export function asAgentDisplacedFrame(e: AgentStreamMessage): AgentDisplacedFrame | null {
  return e.type === 'displaced' ? (e as AgentDisplacedFrame) : null;
}

/** 把任意流帧窄化成 resync_user 帧(非 resync_user 返回 null)。 */
export function asAgentResyncUserFrame(e: AgentStreamMessage): AgentResyncUserFrame | null {
  return e.type === 'resync_user' ? (e as AgentResyncUserFrame) : null;
}

/** 把任意流帧窄化成 user_echo 帧(非 user_echo 返回 null)。 */
export function asAgentUserEchoFrame(e: AgentStreamMessage): AgentUserEchoFrame | null {
  return e.type === 'user_echo' ? (e as AgentUserEchoFrame) : null;
}

/**
 * 合并相邻文本 content_delta —— 流式逐 token 推送会把 messages[] 撑到 O(token 数),
 * 而上层每帧对整个数组全量重折叠 ⇒ O(N²)(外加每帧 [...prev, evt] 的 O(N) 拷贝)。
 * 文本块的 delta 本就会被 fold 拼成一段,提前合并完全等价,却让数组长度退回 O(块数),
 * 折叠与拷贝都降一个数量级。只合并都带 string text 的相邻 delta:带 toolInput 的 delta
 * (工具入参流)fold 不消费,不参与合并以免误并入文本块。
 */
export function appendStreamMessage<T extends AgentStreamMessage>(prev: T[], evt: T): T[] {
  if (evt.type === 'content_delta' && typeof evt.text === 'string') {
    const last = prev[prev.length - 1];
    if (last && last.type === 'content_delta' && typeof last.text === 'string') {
      return [...prev.slice(0, -1), { ...last, text: last.text + evt.text } as T];
    }
  }
  // 合并相邻 thinking 帧(性能审计 发现1):一轮思考逐 token 推送可达上百帧,不合并则 socket.messages 撑成
  // O(帧数)、上层每帧对整个数组全量重折叠 ⇒ 会话内 O(N²)(越想越卡)。与 fold 的 `thinkingText += msg.text`
  // 完全等价(fold 本就把连续 thinking 拼成一段),提前合并无损。claw/smart-search/prism/admin 监控四处共用,一处修全受益。
  if (evt.type === 'thinking' && typeof evt.text === 'string') {
    const last = prev[prev.length - 1];
    if (last && last.type === 'thinking' && typeof last.text === 'string') {
      return [...prev.slice(0, -1), { ...last, text: last.text + evt.text } as T];
    }
  }
  // P1-1:同样合并相邻的 toolInput content_delta(Write.content 流式逐 token 会推成百上千帧,
  //   不合并则 socket.messages 撑成 O(token)、上层每帧全量重折叠 ⇒ O(N²))。只并「都带 toolInput、
  //   不带 text」的相邻 delta,不与文本流互相误并。
  if (evt.type === 'content_delta' && typeof evt.toolInput === 'string' && typeof evt.text !== 'string') {
    const last = prev[prev.length - 1];
    if (
      last &&
      last.type === 'content_delta' &&
      typeof last.toolInput === 'string' &&
      typeof last.text !== 'string'
    ) {
      // 保留 toolPath(增量帧后续才带到,或首帧带、后续省;取任一非空)。
      return [
        ...prev.slice(0, -1),
        { ...last, toolInput: last.toolInput + evt.toolInput, toolPath: last.toolPath ?? evt.toolPath } as T,
      ];
    }
  }
  return [...prev, evt];
}

/**
 * 断线续流:收到 resync_start 时把本地"当前未完成轮"的残留事件截掉 —— 截到最后一条
 * 轮终结事件(message_complete / error)之后。之后 agent 回放的事件会从头重建这一轮,
 * 不截会与回放重复。没有任何完成轮时返回空数组。
 */
export function truncateToLastComplete<T extends AgentStreamMessage>(prev: T[]): T[] {
  for (let i = prev.length - 1; i >= 0; i--) {
    const t = prev[i].type;
    if (t === 'message_complete' || t === 'error') return prev.slice(0, i + 1);
  }
  return [];
}
