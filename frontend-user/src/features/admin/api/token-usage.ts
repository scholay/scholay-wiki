// LLM 算力用量看板 —— admin 只读 hooks。
// 字段对齐 backend/internal/llmusage (models_admin.go / handler_admin.go)。
// 数据源: llm_token_usage 账本(项目侧 internal/ai + agent 侧 scholar_agent 每次 LLM 调用一行)。
//
// 单位约定(全页唯一口径):
//   主单位 = **算力点**,由 cost_micro_yuan(整数微元)÷ 1000 得到。1 算力点 = ¥0.001 真实成本,
//   由该次调用的模型自己的四类单价(输入/输出/缓存读/缓存写,含长输入分档)精算并快照落行 ——
//   与用户额度扣减、用户端额度条**同源同单位**,后台看到的「消耗了多少」就是用户被扣掉的那个数。
//   token 是次要口径,保留是因为缓存命中率 / 上下文规模这类运维视角只有 token 能表达。
//
// 换算刻意放在前端:后端 DTO 一律传整数微元(无精度损失),避免「后端已折算 + 前端再折算」的双重除法。
import { keepPreviousData, useQuery } from '@tanstack/react-query';
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
  /** 窗口内总消耗(微元)。÷1000 = 算力点 —— 全页主单位。 */
  cost_micro_yuan: number;
  /** 公众号/匿名(user_id IS NULL)的消耗(微元)。 */
  anon_cost_micro_yuan: number;
  /** cost=0 的调用次数:成本制改造前的历史行 / 模型当时未计价。见文件头注释。 */
  unpriced_calls: number;
  /** 上述未计价调用消耗掉的 token 量(它们没有折算出任何算力点)。 */
  unpriced_tokens: number;
}

export interface TokenDayPoint {
  date: string;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  calls: number;
  cost_micro_yuan: number;
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
  cost_micro_yuan: number;
  /** 该维度下未计价的调用次数(按模型看时 = 「这个模型的单价没配」的直接信号)。 */
  unpriced_calls: number;
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
  cost_micro_yuan: number;
  unpriced_calls: number;
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
  cost_micro_yuan: number;
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
  /** 本次调用的成本快照(微元);÷1000 = 算力点。0 = 未计价(历史行 / 该模型当时无单价)。 */
  cost_micro_yuan: number;
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
  sort?: 'created_at' | 'total_tokens' | 'cost_micro_yuan';
}

/** 总览: KPI + 每日趋势 + 多维拆分 + top 用户(一次拉全)。 */
export function useTokenUsageSummary(params: TokenUsageFilters, enabled = true) {
  return useQuery({
    queryKey: ['admin', 'token-usage', 'summary', params],
    // summary 无分页,不做 keepPreviousData:切换 days 区间时保留旧区间的 KPI 数字
    // 而无任何加载指示,比短暂转圈更误导(2026-08-12 对抗审查)。
    enabled,
    queryFn: async () =>
      (await http.get<{ data: TokenUsageOverview }>('/admin/llm-token-usage/summary', { params })).data.data,
    staleTime: 60_000,
  });
}

/** 明细分页(后端返回 {logs, total})。 */
export function useTokenUsageLogs(params: TokenLogParams) {
  return useQuery({
    queryKey: ['admin', 'token-usage', 'logs', params],
    // 分页参数在 key 里,翻页保留上一页数据,避免列表塌空闪白(2026-08-12 审计)。
    placeholderData: keepPreviousData,
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
  { value: 'smart_search', label: '智能搜论文' },
  { value: 'claw', label: '智能助手' },
  { value: 'peer_review', label: 'AI 审稿' },
  { value: 'matrix', label: '矩阵分析' },
  { value: 'translate', label: '论文翻译' },
  { value: 'wechat_oa', label: '公众号' },
  { value: 'prism', label: '智能写作' },
  // claw 内的两个 mode,落账本时写自己的 feature key(账本里实际存在这两个值)。
  { value: 'boltslides', label: '制作PPT' },
  { value: 'sci_draw', label: '科研绘图' },
  { value: 'stat_lab', label: '数据分析' },
  // memory = per-user 长期记忆的后台抽取。它走 SkipQuota(不扣用户额度)但**照常记账本**,
  // 所以在成本视角里是可见的平台开销 —— 必须能筛、能显示中文名。漏掉它会让同一页出现
  // 两个叫法:「按功能」拆分走后端 FeatureLabel 显示「记忆抽取」,明细表却回落显示裸 code。
  { value: 'memory', label: '记忆抽取' },
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

// ─── 算力点(主单位)──────────────────────────────────────────────────────────
//
// 1 算力点 = 1000 微元 = ¥0.001 真实成本。这是**全站计费单位**,不是本页自创的展示单位:
// 用户端额度条、后台用户详情抽屉的 TokenQuotaBar、计费配置页的周期额度输入框,除的都是同一个 1000。
// 改这个常数 = 改全站计费口径,后端 llmusage/handler_admin.go 的 microYuanPerPoint 必须同时改。

export const MICRO_YUAN_PER_POINT = 1000;

/** 微元 → 算力点(带小数,给图表数值 / 需要精确求和的地方用;不要拿它直接渲染文本)。 */
export function toPoints(microYuan: number): number {
  return (microYuan || 0) / MICRO_YUAN_PER_POINT;
}

/**
 * 微元 → 展示用算力点字符串。
 * 聚合量级(≥1 点)取整 + 千分位,与用户额度条 `Math.round(used / 1000)` 同口径;
 * 单次调用可能小到 0.4 点,取整会变成 0(「有消耗」被渲染成「没消耗」),故 <1 时保留 2 位小数。
 * 恒 0 才显示 0 —— 这时它要么真是 0,要么是未计价行,由调用方旁边的角标区分。
 */
export function formatPoints(microYuan: number): string {
  const p = toPoints(microYuan);
  if (p === 0) return '0';
  // 最小非零成本是 1 微元 = 0.001 点,toFixed(2) 会把它渲染成「0.00」——
  // 那和「0」在屏幕上不可区分,又一次「有消耗被显示成没消耗」。低于两位精度就明说是「<0.01」。
  if (p < 0.01) return '<0.01';
  if (p < 1) return p.toFixed(2);
  return Math.round(p).toLocaleString();
}

/** 算力点的紧凑写法(图表轴 / KPI 大数字)。入参是**微元**,与 formatPoints 保持同一个入口单位。 */
export function compactPoints(microYuan: number): string {
  const p = toPoints(microYuan);
  if (p > 0 && p < 1) return p.toFixed(2);
  return compactTokens(Math.round(p));
}

/**
 * 精确算力点(不缩写、不取整)—— **只给 title 用**。
 *
 * KPI 上的「1.2k」对看趋势够了,但算力点是计费单位(与用户被扣的额度同源同单位),
 * 对账时需要的是精确数;缩写后页面上任何地方都拿不到它。最小非零成本是 1 微元 = 0.001 点,
 * 故保留 3 位小数 —— 再截就会把「有消耗」显示成 0。
 */
export function exactPoints(microYuan: number): string {
  return toPoints(microYuan).toLocaleString('zh-CN', { maximumFractionDigits: 3 });
}

/** 微元 → 人民币展示(¥x.xx)。给「这些算力点折多少钱」的副文案用;财务视角仍以元为准。 */
export function formatYuan(microYuan: number): string {
  return `¥${((microYuan || 0) / 1_000_000).toFixed(2)}`;
}
