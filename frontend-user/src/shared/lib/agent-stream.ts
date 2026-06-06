/**
 * Agent WS 流式消息的通用纯函数 —— 三个 feature(智能搜索 / 智能助手 / 智能写作)的
 * WS hook 都复用同一条 scholar_agent WS 协议,这两个函数原本在各自 socket.ts 里逐字复制了三遍。
 * 收口到 shared/lib(纯 TS 叶子,无依赖),续流截断这类对账逻辑只维护与测一份。
 */

/** agent WS 帧的最小公共形状:三个 feature 的 ServerMessage union 都满足(content_delta 带可选 text)。 */
export interface AgentStreamMessage {
  type: string;
  text?: string;
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
