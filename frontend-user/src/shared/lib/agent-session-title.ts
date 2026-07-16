// agent 会话「标题生成中」判定 —— claw / smart-search 侧边栏会话列表共用。
//
// agent 在用户首条 user_message 之后异步起 title gen,几秒内通过 WS session_title_updated 推回真实
// title;此前 title 是占位串。列表据此显示「生成标题中…」spinner,而不是把占位原文塞给用户。
//
// 铁律(业界共识 + 本项目历史事故):永久 spinner 是反模式。title gen 有**确定性截止边界**——超过
// TITLE_GEN_WINDOW_MS 占位标题还没变真 = 生成必然已失败(agent 静默失败历史行 / 极端超时),之后
// 落到稳定标签「未命名对话」,所有卡死行下次渲染即自愈。窗口内仍显 spinner(新会话体验不变)。
// 这份逻辑此前在 ClawSessionList + MobileClawDrawer 各抄一份,现收口到 shared,smart-search 也复用。

/** agent 默认 title(英文 "Untitled Session" / 中文兜底 "新会话" / 空)——视作「标题还没生成完」。 */
export const PLACEHOLDER_TITLES = new Set(['', 'Untitled Session', '新会话']);

/** 标题生成窗口(ms):超过它占位标题还没变真 = 生成已失败,不再显示 spinner。 */
export const TITLE_GEN_WINDOW_MS = 90_000;

export function isTitleStillLoading(title: string): boolean {
  return PLACEHOLDER_TITLES.has(title.trim());
}

export interface SessionTitleState {
  /** 面向用户展示的标题:「生成标题中…」/ 真实标题 /「未命名对话」。 */
  displayTitle: string;
  /** 是否处于生成中(显示 spinner + 斜体灰)。 */
  loading: boolean;
}

/**
 * 计算某会话行的标题展示态。
 *
 * @param title       会话原始 title(agent 端)
 * @param createdAt   会话创建时间 ISO 串(判窗口用;空/非法则不设窗口上限,永远算窗口内)
 * @param messageCount 会话消息数
 * @param active      是否为当前活跃会话
 *
 * loading 判定:占位 title && 窗口内 &&(有消息 || 当前活跃)。
 *   - active:lazy 创建后首条消息刚发出,messageCount 可能还没刷到 >0,但这条正是用户在对话的会话,
 *     标题必在生成中 → 立刻 loading,而不是显示「未命名对话」。
 *   - messageCount>0:兜底任何「有内容但 title 没回来」的会话。
 */
export function computeSessionTitle(
  title: string | undefined,
  createdAt: string | undefined,
  messageCount: number,
  active: boolean,
): SessionTitleState {
  const rawTitle = title?.trim() ?? '';
  const createdMs = createdAt ? Date.parse(createdAt) : NaN;
  const withinWindow = Number.isNaN(createdMs) || Date.now() - createdMs < TITLE_GEN_WINDOW_MS;
  const loading = isTitleStillLoading(rawTitle) && withinWindow && (messageCount > 0 || active);
  return {
    displayTitle: loading ? '生成标题中…' : rawTitle || '未命名对话',
    loading,
  };
}
