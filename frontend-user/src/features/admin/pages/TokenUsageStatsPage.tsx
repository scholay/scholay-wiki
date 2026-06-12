import { useState } from 'react';
import { Coins, Activity, Database, Users } from 'lucide-react';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { StatCard } from '../components/StatCard';
import { TokenUsageFilterBar } from '../components/token-usage/TokenUsageFilterBar';
import { TokenDailyChart } from '../components/token-usage/TokenDailyChart';
import { TokenDimensionPanel, type DimRow, type DimTab } from '../components/token-usage/TokenDimensionPanel';
import { TokenUsageLogTable } from '../components/token-usage/TokenUsageLogTable';
import {
  useTokenUsageSummary,
  compactTokens,
  type TokenUsageFilters,
  type TokenBreakdownItem,
  type TokenUserItem,
} from '../api/token-usage';

/**
 * Token 用量统计(后台)—— 统一 LLM token 账本(llm_token_usage)看板。
 *
 * 数据源: 项目侧 internal/ai(matrix/translate/wechat_oa) + agent 侧 scholar_agent
 * (per-call,一次模型调用一行)。布局刻意克制:
 *   筛选栏 → KPI → 每日用量主图(堆叠维度可切:构成/模型/功能/调用次数)
 *   → 维度拆分面板(Tab:模型/功能/来源/Provider/用户,每行分段横条)→ 明细表。
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
    total: d.total_tokens,
    calls: d.calls,
  }));
}

function userRows(items: TokenUserItem[]): DimRow[] {
  return items.map((u) => ({
    key: u.user_id == null ? 'anon' : String(u.user_id),
    // 统一:始终带 #ID。匿名(公众号/系统)无 user_id。
    label: u.user_id == null ? '公众号/匿名' : `${u.username || u.email || '用户'} #${u.user_id}`,
    sub: u.user_id != null && u.username && u.email ? u.email : undefined,
    input: u.input_tokens,
    output: u.output_tokens,
    cacheRead: u.cache_read_tokens,
    cacheCreation: u.cache_creation_tokens,
    total: u.total_tokens,
    calls: u.calls,
  }));
}

export function TokenUsageStatsPage() {
  const [filters, setFilters] = useState<TokenUsageFilters>({ days: 30 });
  const { data, isLoading } = useTokenUsageSummary(filters);

  const t = data?.totals;
  const cacheTotal = (t?.cache_read_tokens ?? 0) + (t?.cache_creation_tokens ?? 0);
  const cacheBase = (t?.input_tokens ?? 0) + (t?.cache_read_tokens ?? 0);
  const cacheHitRate = cacheBase > 0 ? ((t?.cache_read_tokens ?? 0) / cacheBase) * 100 : 0;

  const tabs: DimTab[] = [
    { value: 'model', title: '模型', rows: dimRows(data?.by_model ?? []) },
    { value: 'feature', title: '功能', rows: dimRows(data?.by_feature ?? []) },
    { value: 'source', title: '来源', rows: dimRows(data?.by_source ?? []) },
    { value: 'provider', title: 'Provider', rows: dimRows(data?.by_provider ?? []) },
    { value: 'users', title: 'Top 用户', rows: userRows(data?.top_users ?? []), emptyText: '暂无用户用量' },
  ];

  return (
    <AdminPageLayout
      title="Token 用量统计"
      description="统一 LLM token 账本 · 每次模型调用一行 · 按维度筛选与导出"
    >
      <TokenUsageFilterBar onChange={setFilters} />

      {/* KPI */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={<Coins />}
          label="总 Tokens"
          value={compactTokens(t?.total_tokens ?? 0)}
          hint={`输入 ${compactTokens(t?.input_tokens ?? 0)} · 输出 ${compactTokens(t?.output_tokens ?? 0)}`}
        />
        <StatCard
          icon={<Activity />}
          label="调用次数"
          value={(t?.total_calls ?? 0).toLocaleString()}
          hint={`公众号/匿名 ${(t?.anon_calls ?? 0).toLocaleString()} 次`}
        />
        <StatCard
          icon={<Database />}
          label="缓存 Tokens"
          value={compactTokens(cacheTotal)}
          hint={`命中率 ${cacheHitRate.toFixed(1)}%`}
        />
        <StatCard
          icon={<Users />}
          label="独立用户"
          value={(t?.unique_users ?? 0).toLocaleString()}
          hint={`匿名 ${compactTokens(t?.anon_tokens ?? 0)} tokens`}
        />
      </section>

      {/* 每日用量主图(堆叠维度可切) */}
      <TokenDailyChart
        daily={data?.daily ?? []}
        byModel={data?.daily_by_model ?? []}
        byFeature={data?.daily_by_feature ?? []}
      />

      {/* 维度拆分(Tab 切换 + 分段横条) */}
      <TokenDimensionPanel tabs={tabs} loading={isLoading} />

      {/* 明细 */}
      <TokenUsageLogTable filters={filters} />
    </AdminPageLayout>
  );
}
