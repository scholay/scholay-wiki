import { useState } from 'react';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { Coins, Activity, Database, Users, TriangleAlert } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { toApiError } from '@/shared/lib/http';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { StatCard } from '../components/StatCard';
import { TokenUsageFilterBar } from '../components/token-usage/TokenUsageFilterBar';
import { TokenDailyChart } from '../components/token-usage/TokenDailyChart';
import { TokenDimensionPanel, type DimRow, type DimTab } from '../components/token-usage/TokenDimensionPanel';
import { TokenUsageLogTable } from '../components/token-usage/TokenUsageLogTable';
import {
  useTokenUsageSummary,
  compactTokens,
  compactPoints,
  exactPoints,
  formatPoints,
  formatYuan,
  type TokenUsageFilters,
  type TokenBreakdownItem,
  type TokenUserItem,
} from '../api/token-usage';

/**
 * 算力用量统计(后台)—— 统一 LLM 账本(llm_token_usage)看板。
 *
 * 主单位是**算力点**(1 点 = ¥0.001 真实成本,由每次调用所用模型自己的四类单价精算并快照落行),
 * 与用户额度扣减**同源同单位** —— 这里看到的「消耗了多少」就是用户被扣掉的那个数。
 * token 保留为次要口径:缓存命中率、上下文规模这类运维视角只有 token 能表达。
 *
 * 数据源: 项目侧 internal/ai(matrix/translate/wechat_oa) + agent 侧 scholar_agent
 * (per-call,一次模型调用一行)。布局刻意克制:
 *   筛选栏 → KPI → 每日用量主图(可切:按模型/按功能(算力点) · token 构成 · 调用次数)
 *   → 维度拆分面板(Tab:模型/功能/来源/Provider/用户,条长 = 算力点占比)→ 明细表。
 *
 * 筛选(TokenUsageFilterBar 自管 + URL 持久化)对全页生效: KPI / 图 / 拆分 / 明细同步;
 * 按用户(关键词)筛选后,主图即该用户的「每天 × 模型/功能」视图。
 */

function dimRows(items: TokenBreakdownItem[]): DimRow[] {
  return items.map((d) => ({
    key: d.key || '(空)',
    label: d.label,
    input: d.input_tokens,
    output: d.output_tokens,
    cacheRead: d.cache_read_tokens,
    cacheCreation: d.cache_creation_tokens,
    calls: d.calls,
    costMicro: d.cost_micro_yuan,
    unpricedCalls: d.unpriced_calls,
  }));
}

function userRows(items: TokenUserItem[]): DimRow[] {
  return items.map((u) => ({
    key: u.user_id == null ? 'anon' : String(u.user_id),
    // 统一:始终带 #ID。匿名(公众号/系统)无 user_id。
    label: u.user_id == null ? '公众号/匿名' : `${u.username || u.email || '用户'} #${u.user_id}`,
    // 「谁一天烧掉几万算力点」之后必然要去看这个人是谁 —— 深链到用户管理的关键词搜索
    // (UsersPage 读的就是 `q`),否则只能手抄 ID 再去搜。匿名行没有实体可跳。
    href: u.user_id == null ? undefined : `/admin/users?q=${u.user_id}`,
    sub: u.user_id != null && u.username && u.email ? u.email : undefined,
    input: u.input_tokens,
    output: u.output_tokens,
    cacheRead: u.cache_read_tokens,
    cacheCreation: u.cache_creation_tokens,
    calls: u.calls,
    costMicro: u.cost_micro_yuan,
    unpricedCalls: u.unpriced_calls,
  }));
}

export function TokenUsageStatsPage() {
  const [filters, setFilters] = useState<TokenUsageFilters>({ days: 30 });
  const { data, isLoading, isError, error, refetch } = useTokenUsageSummary(filters);
  const qc = useQueryClient();
  // 刷新整页(概览 + 明细 + facets 三条 query 共前缀);isFetching 单看这一族,
  // 本页没有轮询 query,所以不会出现"按钮常年 disabled"。
  const fetching = useIsFetching({ queryKey: ['admin', 'token-usage'] }) > 0;

  const t = data?.totals;
  const cacheTotal = (t?.cache_read_tokens ?? 0) + (t?.cache_creation_tokens ?? 0);
  const cacheBase = (t?.input_tokens ?? 0) + (t?.cache_read_tokens ?? 0);
  const cacheHitRate = cacheBase > 0 ? ((t?.cache_read_tokens ?? 0) / cacheBase) * 100 : 0;
  const unpricedCalls = t?.unpriced_calls ?? 0;

  const tabs: DimTab[] = [
    { value: 'model', title: '模型', rows: dimRows(data?.by_model ?? []) },
    { value: 'feature', title: '功能', rows: dimRows(data?.by_feature ?? []) },
    { value: 'source', title: '来源', rows: dimRows(data?.by_source ?? []) },
    { value: 'provider', title: 'Provider', rows: dimRows(data?.by_provider ?? []) },
    { value: 'users', title: 'Top 用户', rows: userRows(data?.top_users ?? []), emptyText: '暂无用户用量' },
  ];

  return (
    <AdminPageLayout
      title="算力用量统计"
      description="统一 LLM 账本 · 按各模型自己的单价精算 · 1 算力点 = ¥0.001,与用户额度同单位"
      onRefresh={() => qc.invalidateQueries({ queryKey: ['admin', 'token-usage'] })}
      refreshing={fetching}
    >
      <TokenUsageFilterBar onChange={setFilters} />

      {/* 🔴 加载失败横幅 —— 这一页最贵的错误是"说反话":概览接口一挂,四张 KPI 全走 `?? 0`,
          图空、拆分「暂无数据」、明细「暂无调用记录」,整页读起来就是「这段时间平台一次
          LLM 都没调用、一分钱没花」。成本看板显示 0 会直接影响"要不要继续放量"的判断,
          所以失败必须先声明出来,KPI 也一律不回落成数字(StatCard 传了 error 就只给 —)。 */}
      {isError && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-12 border border-border bg-danger-soft px-3 py-2 text-12">
          <span className="flex items-center gap-2 font-medium text-brand-red">
            <TriangleAlert className="size-3.5 shrink-0" />
            用量数据加载失败
          </span>
          <span className="text-subtle">{toApiError(error).message}</span>
          <span className="text-faint">下方 KPI / 图表 / 拆分为空,不代表这段时间没有调用。</span>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            重试
          </Button>
        </div>
      )}

      {/* KPI —— 算力点打头,token 退到第 3 张卡。
          紧凑值(1.2k)扫趋势够用,但算力点是计费单位、对账要精确数 —— 挂 title 补上。 */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard
          icon={<Coins />}
          label="总算力点"
          loading={isLoading}
          error={error}
          value={
            <span title={`精确值 ${exactPoints(t?.cost_micro_yuan ?? 0)} 算力点`}>
              {compactPoints(t?.cost_micro_yuan ?? 0)}
            </span>
          }
          hint={`≈ ${formatYuan(t?.cost_micro_yuan ?? 0)} 真实成本`}
        />
        <StatCard
          icon={<Activity />}
          label="调用次数"
          loading={isLoading}
          error={error}
          value={(t?.total_calls ?? 0).toLocaleString()}
          hint={`公众号/匿名 ${(t?.anon_calls ?? 0).toLocaleString()} 次`}
        />
        <StatCard
          icon={<Database />}
          label="总 Tokens"
          loading={isLoading}
          error={error}
          value={
            <span title={`精确值 ${(t?.total_tokens ?? 0).toLocaleString()} tokens`}>
              {compactTokens(t?.total_tokens ?? 0)}
            </span>
          }
          hint={`缓存 ${compactTokens(cacheTotal)} · 命中率 ${cacheHitRate.toFixed(1)}%`}
        />
        <StatCard
          icon={<Users />}
          label="独立用户"
          loading={isLoading}
          error={error}
          value={(t?.unique_users ?? 0).toLocaleString()}
          hint={`匿名消耗 ${formatPoints(t?.anon_cost_micro_yuan ?? 0)} 算力点`}
        />
      </section>

      {/* 未计价告示 —— 让「0 算力点」与「没花钱」可区分。
          这些行的成本快照是 0:成本制改造(2026-07)之前记的历史行,或该模型当时不在目录/没配单价。
          不做静默补算:快照落行是刻意设计(目录调价不漂历史账),补算会让账面与用户当时被扣的额度对不上。 */}
      {unpricedCalls > 0 && (
        <div className="mb-6 flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-12 border border-border bg-brand-amber-soft px-3 py-2 text-12 text-subtle">
          {/* gap-2 而非 gap-1.5:半档不在 Figma 间距集合内,且棘轮基线已是零余量(护栏会当场红) */}
          <span className="flex items-center gap-2 font-medium text-foreground">
            <TriangleAlert className="size-3.5 shrink-0" />
            {unpricedCalls.toLocaleString()} 次调用未计价
          </span>
          <span>
            共 {compactTokens(t?.unpriced_tokens ?? 0)} tokens 未折算成算力点,已从上方总数中排除
            {(t?.total_calls ?? 0) > 0 && <>(占 {(((unpricedCalls / (t?.total_calls || 1)) * 100)).toFixed(1)}% 调用)</>}。
          </span>
          <span className="text-faint">
            成因:成本制改造前的历史行,或该模型未在「模型目录」配置单价 —— 后者可在模型维度里定位后补价。
          </span>
        </div>
      )}

      {/* 每日用量主图(视图可切) */}
      <TokenDailyChart
        daily={data?.daily ?? []}
        byModel={data?.daily_by_model ?? []}
        byFeature={data?.daily_by_feature ?? []}
        loading={isLoading}
        error={error}
        onRetry={() => refetch()}
      />

      {/* 维度拆分(Tab 切换 + 算力点横条) */}
      <TokenDimensionPanel tabs={tabs} loading={isLoading} error={error} onRetry={() => refetch()} />

      {/* 明细 */}
      <TokenUsageLogTable filters={filters} />
    </AdminPageLayout>
  );
}
