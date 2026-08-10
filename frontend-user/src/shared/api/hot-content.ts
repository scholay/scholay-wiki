// ============================================================================
// 热门内容上报 helpers —— POST /api/v1/public/hot-content/track
//
// 后端服务端只能记到「传统 / 期刊搜索的关键词 + 曝光」(minicod SearchPapers /
// SearchJournals 接口被打到时顺带记)。以下三类维度服务端看不到, 必须前端主动上报
// (fire-and-forget, 走 sendBeacon):
//   - 曝光 impression: 智能搜索结果集 —— 论文在 agent 容器内经 Minicod MCP 取得,
//     后端主进程的搜索接口根本没被打到 (传统搜索曝光仍由后端记, 不走这里, 防双计)
//   - 点击 click:      站内从结果点开论文详情 —— 详情数据来自前端缓存, 不打 GET /papers/:id
//   - SEO 直访 seo_view: 论文页作为站外落地入口被打开
//
// 与后端的可信 SEO 种子链路独立：SEO 写 seo_papers，这里只写 hot_papers
// 热度榜。投递方式刻意一致 (sendBeacon, 失败回退 fetch+keepalive), 不阻塞主线程 / 导航。
// ============================================================================

import type { Paper } from '@/shared/api/types';

const TRACK_URL = '/api/v1/public/hot-content/track';

// 后端期望的 snake_case 结构 (mirrors hotcontent.PaperViewData)。
// authors 是 JSON 字符串(作者名数组),与后端落库格式一致 (paperToViewData 同款)。
interface TrackPaperData {
  paper_id: string;
  title?: string;
  doi?: string;
  authors?: string;
  year?: number;
  venue?: string;
}

/** 把 frontend Paper 映射成上报 payload;缺 paperId 直接丢弃。 */
function paperToTrackData(p: Paper | undefined | null): TrackPaperData | null {
  if (!p || !p.paperId) return null;
  const data: TrackPaperData = { paper_id: p.paperId };
  if (p.title) data.title = p.title;
  if (typeof p.year === 'number' && p.year > 0) data.year = p.year;
  if (p.venue) data.venue = p.venue;
  if (p.externalIds && typeof p.externalIds === 'object') {
    const doi = (p.externalIds as Record<string, unknown>).DOI;
    if (typeof doi === 'string' && doi) data.doi = doi;
  }
  if (p.authors && p.authors.length) {
    const names = p.authors
      .map((a) => a?.name)
      .filter((n): n is string => !!n);
    if (names.length) data.authors = JSON.stringify(names);
  }
  return data;
}

/** sendBeacon 投递,失败回退 fetch+keepalive(均 best-effort,不打扰用户)。 */
function postTrack(body: object): void {
  const json = JSON.stringify(body);
  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.sendBeacon === 'function'
  ) {
    try {
      const blob = new Blob([json], { type: 'application/json' });
      if (navigator.sendBeacon(TRACK_URL, blob)) return;
    } catch {
      // fall through to fetch
    }
  }
  void fetch(TRACK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: json,
    keepalive: true,
  }).catch(() => {
    // best-effort
  });
}

/**
 * 搜索结果集渲染 → 上报一批曝光。**仅智能搜索用**:传统 / 期刊搜索的曝光由后端
 * SearchPapers 服务端记, 不要在传统搜索结果里再调本函数, 否则双计。
 */
export function trackPaperImpressions(
  papers: Array<Paper | undefined | null>
): void {
  const items: TrackPaperData[] = [];
  const seen = new Set<string>();
  for (const p of papers) {
    const d = paperToTrackData(p);
    if (!d) continue;
    if (seen.has(d.paper_id)) continue; // 同批去重
    seen.add(d.paper_id);
    items.push(d);
  }
  if (!items.length) return;
  postTrack({ impressions: items });
}

/** 站内点开论文详情 → 上报一次点击 (传统 / 智能 / 文件夹 / 引用 等所有站内打开)。 */
export function trackPaperClick(paper: Paper | undefined | null): void {
  const d = paperToTrackData(paper);
  if (!d) return;
  postTrack({ clicks: [d] });
}

/** 论文页作为站外落地入口被打开 → 上报一次 SEO 直访。 */
export function trackPaperSeoView(paper: Paper | undefined | null): void {
  const d = paperToTrackData(paper);
  if (!d) return;
  postTrack({ seo_views: [d] });
}
