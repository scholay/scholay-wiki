// LLM Token 用量看板 —— admin 只读 hooks。
// 字段对齐 backend/internal/llmusage (models_admin.go / handler_admin.go)。
// 数据源: llm_token_usage 账本(项目侧 internal/ai + agent 侧 scholar_agent 每次 LLM 调用一行)。
import { useQuery } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';
import { localDateKey } from '@/shared/lib/daily-trend';

/** 看板/明细共享的过滤参数(空值由调用方 coerce 成 undefined, axios 自动丢弃)。 */
export interface TokenUsageFilters {
  days?: number;
  start_date?: string;
  end_date?: string;
  feature?: string;
  source?: string;
  model?: string;
  provider?: string;
  user_id?: number; // legacy(精确 ID),前端已改走 keyword
  keyword?: string; // 用户关键词:ID / 用户名 / 邮箱 / 手机号
  anon?: 1; // 仅 user_id IS NULL(公众号/匿名)
}

export interface TokenTotals {
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  total_calls: number;
  unique_users: number;
  anon_calls: number;
  anon_tokens: number;
}

export interface TokenDayPoint {
  date: string;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  calls: number;
}

export interface TokenBreakdownItem {
  key: string;
  label: string;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  calls: number;
}

export interface TokenUserItem {
  user_id: number | null; // null = 公众号/匿名
  username: string;
  email: string;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  calls: number;
}

/** 「天 × 维度(model/feature)」交叉聚合的一格 —— 主图分段堆叠柱用(稀疏,按 daily 的日期 spine 合并)。 */
export interface TokenDayDimPoint {
  date: string;
  key: string;
  label: string;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  calls: number;
}

export interface TokenUsageOverview {
  days: number;
  totals: TokenTotals;
  daily: TokenDayPoint[];
  by_feature: TokenBreakdownItem[];
  by_source: TokenBreakdownItem[];
  by_model: TokenBreakdownItem[];
  by_provider: TokenBreakdownItem[];
  top_users: TokenUserItem[];
  daily_by_model: TokenDayDimPoint[];
  daily_by_feature: TokenDayDimPoint[];
}

export interface TokenLog {
  id: number;
  user_id: number | null;
  username: string;
  email: string;
  feature: string;
  source: string;
  provider: string;
  account_id: number | null;
  account_name: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  request_id: string;
  created_at: string;
}

export interface TokenFacets {
  models: string[];
  providers: string[];
  accounts: Array<{ id: number; name: string }>;
}

export interface TokenLogParams extends TokenUsageFilters {
  page?: number;
  page_size?: number;
  sort?: 'created_at' | 'total_tokens';
}

/** 总览: KPI + 每日趋势 + 多维拆分 + top 用户(一次拉全)。 */
export function useTokenUsageSummary(params: TokenUsageFilters) {
  return useQuery({
    queryKey: ['admin', 'token-usage', 'summary', params],
    queryFn: async () =>
      (await http.get<{ data: TokenUsageOverview }>('/admin/llm-token-usage/summary', { params })).data.data,
    staleTime: 60_000,
  });
}

/** 明细分页(后端返回 {logs, total})。 */
export function useTokenUsageLogs(params: TokenLogParams) {
  return useQuery({
    queryKey: ['admin', 'token-usage', 'logs', params],
    queryFn: async () => {
      const r = await http.get<{ data: { logs: TokenLog[]; total: number } }>(
        '/admin/llm-token-usage/logs',
        { params }
      );
      return { logs: r.data.data.logs ?? [], total: r.data.data.total ?? 0 };
    },
  });
}

/** 筛选下拉的动态可选值(model/provider/account)。 */
export function useTokenUsageFacets(days: number) {
  return useQuery({
    queryKey: ['admin', 'token-usage', 'facets', days],
    queryFn: async () =>
      (await http.get<{ data: TokenFacets }>('/admin/llm-token-usage/facets', { params: { days } })).data.data,
    staleTime: 60_000,
  });
}

/** 导出当前过滤下的明细 CSV —— 走统一 http(自带 Authorization),responseType blob。 */
export async function exportTokenUsageCSV(params: TokenLogParams) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') search.set(k, String(v));
  });
  const { data: blob } = await http.get<Blob>(
    `/admin/llm-token-usage/export?${search.toString()}`,
    { responseType: 'blob' }
  );
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `llm-token-usage-${localDateKey()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

// ─── 展示辅助 ───────────────────────────────────────────────────────────────

/** 固定枚举(feature/source)前端硬编码 label,与后端 FeatureLabel/SourceLabel 同口径。 */
export const FEATURE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'smart_search', label: '智能搜索' },
  { value: 'claw', label: '智能助手' },
  { value: 'peer_review', label: 'AI 审稿' },
  { value: 'matrix', label: '矩阵分析' },
  { value: 'translate', label: '论文翻译' },
  { value: 'wechat_oa', label: '公众号' },
  { value: 'prism', label: '智能写作' },
];

export const SOURCE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'project', label: '项目' },
  { value: 'agent', label: 'Agent' },
];

/**
 * 大数缩写(图表轴/紧凑展示用):12345 → 12.3k,1234567 → 1.2M,1200000000 → 1.2B。
 * round 值去掉多余的 `.0`(800000000 → 800M,而非 800.0M),与坐标轴 compactAxis 一致;
 * 并加 B 档 —— 否则 ≥1B 退化成超长的「1000.0M」,会把纵轴标签挤出去被裁切。
 */
export function compactTokens(n: number): string {
  const trim = (s: string) => s.replace(/\.0$/, '');
  if (n >= 1_000_000_000) return trim((n / 1_000_000_000).toFixed(1)) + 'B';
  if (n >= 1_000_000) return trim((n / 1_000_000).toFixed(1)) + 'M';
  if (n >= 1_000) return trim((n / 1_000).toFixed(1)) + 'k';
  return String(n);
}
