// 情报(学术新闻)公开取数 —— 跨 feature 共享(移动 feed / PC 首页情报区 / PC 详情页都用)。
// 正文单一真源在后端 internal/news(webhook 落库);前端只取数渲染,不打包正文 TS。
// 数据走公开 API /api/v1/news(免登录;后台 enabled 关闭时返空/404)。
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { http } from '@/shared/lib/http';
import { retryDetailQuery } from '@/shared/lib/query-config';

export interface NewsSource {
  url: string;
  label: string;
}

/** 列表卡片(不含正文)。字段与后端 news.CardDTO 同构(snake_case)。 */
export interface NewsCard {
  slug: string;
  title: string;
  summary: string;
  section: string;
  section_label: string;
  report_type: string; // hourly=快讯 | daily=今日要览
  cover_image?: string;
  sources: NewsSource[];
  is_featured: boolean;
  score: number;
  view_count: number;
  heat_external: number; // 0-100
  heat_trend: number; // 上升速度(可负)
  published_at: string; // RFC3339
}

/** 单篇全文。与后端 news.DetailDTO 同构。 */
export interface NewsDetail extends NewsCard {
  url: string;
  body_md: string;
  body_html: string;
  credibility_note: string;
  original_date?: string;
  heat_measured_at?: string;
  updated_at: string; // 上游 updated_at(dateModified)
}

export type NewsSort = 'latest' | 'heat';

/** 情报内置分区 taxonomy(与后端 section 枚举对齐;UI 常量,与内容无关)。 */
export const NEWS_SECTIONS = [
  { id: '', label: '全部' },
  { id: 'major-event', label: '重大事件' },
  { id: 'china-policy', label: '国内政策' },
  { id: 'top-journal', label: '顶刊速递' },
  { id: 'other', label: '其他' },
] as const;

/** heat_trend 超过此速率视为「飙升」,卡片出红色 ↑ chip。 */
export const HEAT_SURGE_THRESHOLD = 5;

interface ListResp {
  items: NewsCard[];
  has_more: boolean;
}

/** 移动 feed 分页大小(后端 page_size 上限 50)。 */
export const NEWS_FEED_PAGE_SIZE = 8;

async function fetchNewsPage(
  sort: NewsSort,
  section: string,
  page: number,
  pageSize: number,
): Promise<ListResp> {
  const { data } = await http.get<ListResp>('/news', {
    params: { sort, section: section || undefined, page, page_size: pageSize },
  });
  return { items: data.items ?? [], has_more: !!data.has_more };
}

/**
 * 移动「上下滑」情报 feed 数据层 —— 确定性 (sort,section,page) 分页(非随机 seed)。
 * 情报是真实时间/热度全序:下拉刷新 = invalidate 同 key 拿含最新条目的第一页(非换 seed)。
 */
export function useNewsFeedInfinite(sort: NewsSort, section: string) {
  return useInfiniteQuery({
    queryKey: ['news', 'feed', sort, section],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => fetchNewsPage(sort, section, pageParam, NEWS_FEED_PAGE_SIZE),
    getNextPageParam: (last, all) => (last.has_more ? all.length + 1 : undefined),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

/** 跨页摊平 + 按 slug 去重 + 过滤无标题脏数据。 */
export function flattenNewsPages(pages: ListResp[] | undefined): NewsCard[] {
  if (!pages) return [];
  const seen = new Set<string>();
  const out: NewsCard[] = [];
  for (const p of pages) {
    for (const it of p.items) {
      if (!it.slug || !it.title || seen.has(it.slug)) continue;
      seen.add(it.slug);
      out.push(it);
    }
  }
  return out;
}

/** PC 首页情报区主信息流(单页 top N)。 */
export function useNewsList(sort: NewsSort, limit = 8) {
  return useQuery({
    queryKey: ['news', 'list', sort, limit],
    queryFn: () => fetchNewsPage(sort, '', 1, limit).then((r) => r.items),
    staleTime: 5 * 60_000,
  });
}

/** PC 首页右侧热榜 / 移动热榜。 */
export function useNewsTrending(days = 7, limit = 10) {
  return useQuery({
    queryKey: ['news', 'trending', days, limit],
    queryFn: async () =>
      (await http.get<{ items: NewsCard[] }>('/news/trending', { params: { days, limit } })).data
        .items ?? [],
    staleTime: 5 * 60_000,
  });
}

interface DetailResp {
  item: NewsDetail;
  related: NewsCard[];
}

/** 情报详情(含正文 + 同分区相关)。slug 空不发请求;404 不重试(ResourceError 秒出)。 */
export function useNewsDetail(slug: string) {
  return useQuery({
    queryKey: ['news', 'detail', slug],
    queryFn: async () =>
      (await http.get<DetailResp>(`/news/detail/${slug}`)).data,
    enabled: !!slug,
    staleTime: 5 * 60_000,
    retry: retryDetailQuery,
  });
}

/** heat_external(0-100)格式化:整数直显,小数留一位。 */
export function formatHeat(h: number): string {
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
}

/** section → 主题色(token 内可用:红/琥珀/绿/faint);跨移动卡 + PC 卡共用。 */
export function newsSectionTone(section: string): { dot: string; text: string } {
  switch (section) {
    case 'major-event':
      return { dot: 'bg-brand-red', text: 'text-brand-red' };
    case 'china-policy':
      return { dot: 'bg-brand-amber', text: 'text-brand-amber' };
    case 'top-journal':
      return { dot: 'bg-brand-green', text: 'text-brand-green' };
    default:
      return { dot: 'bg-faint', text: 'text-faint' };
  }
}

/** RFC3339 → 「X 分钟前」;解析失败回退原串。 */
export function newsRelativeTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatDistanceToNow(d, { addSuffix: true, locale: zhCN });
}

/** heat_trend 是否达到「飙升」速率。 */
export function isNewsSurging(heatTrend: number): boolean {
  return heatTrend >= HEAT_SURGE_THRESHOLD;
}

/** report_type → 中文标签。 */
export function newsReportLabel(reportType: string): string {
  return reportType === 'daily' ? '今日要览' : '快讯';
}
