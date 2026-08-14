/**
 * 跨 tab agent-session 通知 — 用 BroadcastChannel 让同源 tab 之间互相感知
 * "另一个 tab 已经 reset/拿到新 sessionId 了, 你的 cache 该刷一刷"。
 *
 * 设计:
 *   - 一个 feature 对应一个 channel name (smart-search / claw / ...)
 *   - 发件方调 notifySessionChanged() 在 reset 成功后广播
 *   - 收件方走 useSessionBroadcast() 订阅 → 收到就 invalidateQueries
 *
 * 为什么用 BroadcastChannel 而不是 storage event:
 *   BroadcastChannel 是 same-origin 同源 tab 之间的直推消息, 无需绕 localStorage,
 *   也不会跟应用其它 localStorage 写改混在一起触发冗余监听。
 *   兼容性: Safari 15.4+, 现代 Chrome/Firefox/Edge 都支持; SSR / unit test 环境
 *   可能没有 globalThis.BroadcastChannel, 此时 hook 安全 noop。
 *
 * 不在这里做:
 *   - 不广播 WS 流式消息 (跨 tab 同步 turns 是方案 C 范畴, 见并发审计)
 *   - 不替代后端 displacement (两个机制独立工作: 后端踢老 WS, 这里同步 query cache)
 */

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/** 频道命名 — 跟 feature key 一一对应。改名会让旧版 tab 跟新版 tab 互相收不到消息。 */
type FeatureChannel = 'smart-search' | 'claw' | 'boltslides' | 'sci_draw' | 'stat_lab';

/** 消息载荷。type 字段未来扩展不破坏旧 listener (switch default 忽略未知)。 */
type BroadcastMessage = {
  type: 'session-changed';
  /** 新 sessionId, 收件方可对比自己缓存的 sessionId 判断要不要 invalidate */
  newSessionId?: string;
  /** 写入时间戳, 给 debug 看 */
  ts: number;
};

function getChannel(feature: FeatureChannel): BroadcastChannel | null {
  if (typeof globalThis.BroadcastChannel === 'undefined') return null;
  // 同名 channel 不会重复创建底层资源; 但每次都 new 会增加 close 复杂度。
  // 这里直接 new 然后让 caller 用完 close (或交给 hook 在 cleanup 里 close)。
  return new BroadcastChannel(`scholay:${feature}`);
}

/**
 * 发件方: 在 reset 成功 / 关键 session 变更后调一次。
 * BroadcastChannel.postMessage 是同步入队、异步分发, 调用方不需要 await。
 *
 * fire-and-forget: 收不到也不报错 — 兜底是 React Query 的 staleTime 终究会过期。
 */
export function notifySessionChanged(
  feature: FeatureChannel,
  newSessionId?: string
): void {
  const ch = getChannel(feature);
  if (!ch) return;
  try {
    ch.postMessage({
      type: 'session-changed',
      newSessionId,
      ts: Date.now(),
    } satisfies BroadcastMessage);
  } finally {
    ch.close();
  }
}

/**
 * 收件方: hook 形式订阅广播, 收到 session-changed 就 invalidate 该 feature 的
 * react-query cache (session / history / context 三段)。
 *
 * queryKey 命名跟 features/<x>/api/<x>.ts 里的约定一致:
 *   ['smart-search', ...] 或 ['claw', ...]。
 * invalidate 顶层 prefix 一次失效全部子 query, 包括 messages / context / 等。
 */
export function useSessionBroadcast(feature: FeatureChannel): void {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = getChannel(feature);
    if (!ch) return;
    const onMessage = (ev: MessageEvent<BroadcastMessage>) => {
      const payload = ev.data;
      if (!payload || payload.type !== 'session-changed') return;
      // 顶层 prefix invalidate — react-query 会重新 fetch session / history / context,
      // hook 自然拿到新 sessionId, useSmartSearchSocket 也会因 sessionId 变化重连。
      void qc.invalidateQueries({ queryKey: [feature] });
    };
    ch.addEventListener('message', onMessage);
    return () => {
      ch.removeEventListener('message', onMessage);
      ch.close();
    };
  }, [feature, qc]);
}
