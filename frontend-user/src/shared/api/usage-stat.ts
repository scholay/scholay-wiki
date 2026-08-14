// ============================================================================
// 功能使用统计上报 (前端事件) —— POST /api/v1/public/usage-events/track
//
// 后端能直接记到服务端经手的功能 (搜索 / 矩阵 / 审稿 / agent 对话)。但"暂存"和
// "收藏"是前端事件 (暂存还可匿名本地操作, 后端根本看不到), 由这里 fire-and-forget 上报。
//
// 用带 keepalive 的 fetch (而非 sendBeacon): 这样能带 Authorization 头, 后端
// OptionalUserAuth 中间件据此拿 user_id; 无 token 则按匿名 (anon_id) 记。
// anon_id 是 localStorage 里的稳定 uuid, 支撑"匿名独立访客"统计。
//
// 与后端的可信 SEO 种子链路 / hot-content.ts（论文热度）并列的第三条
// best-effort 上报通道, 写入后端 usage_events 表 (功能使用统计 v2)。
// ============================================================================

import { getAnonId } from '@/shared/lib/anon-id';
import { getAuthToken } from '@/shared/lib/auth-token';

const TRACK_URL = '/api/v1/public/usage-events/track';

interface TrackEventPayload {
  feature: string;
  action: string;
  source?: string;
  extra?: Record<string, unknown>;
}

function postTrack(events: TrackEventPayload[]): void {
  if (!events.length) return;
  const body = JSON.stringify({ anon_id: getAnonId(), events });
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const tok = getAuthToken();
  if (tok) headers.Authorization = `Bearer ${tok}`;
  void fetch(TRACK_URL, {
    method: 'POST',
    headers,
    body,
    keepalive: true,
  }).catch(() => {
    // best-effort, 不打扰用户
  });
}

/**
 * 暂存一次 —— source 区分来自传统(traditional)还是智能(smart)搜索;单篇省略 count,
 * 一键批量传 count 篇数。传统/智能两条结果链路都调这里(各自传对应 source)。
 */
export function trackStaging(source?: 'traditional' | 'smart', count?: number): void {
  postTrack([
    {
      feature: 'staging',
      action: 'stage',
      source,
      extra: count && count > 1 ? { count } : undefined,
    },
  ]);
}

/**
 * 收藏一次。收藏按钮跨搜索结果 / 文件夹 / 首页 / 引用等多处复用,搜索来源
 * (traditional/smart) 在这些上下文里并不普遍成立,故不强行附 source(留空)。
 */
export function trackFavorite(): void {
  postTrack([{ feature: 'favorite', action: 'favorite' }]);
}
