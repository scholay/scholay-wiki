import { useState } from 'react';
import { Coins, Activity, Database, Users } from 'lucide-react';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { StatCard } from '../components/StatCard';
import { TokenUsageFilterBar } from '../components/token-usage/TokenUsageFilterBar';
import { TokenTrendChart } from '../components/token-usage/TokenTrendChart';
import { TokenBreakdownCard, type TokenBreakdownRow } from '../components/token-usage/TokenBreakdownCard';
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
 * (smart_search/claw/peer_review) 每次 LLM 调用一行。参考 API 中转站(one-api/new-api)看板:
 * KPI 卡 + 每日趋势 + 多维拆分(模型/功能/来源/Provider/top 用户)+ 可筛选明细表(可导 CSV)。
 *
 * 筛选(TokenUsageFilterBar 自管 + URL 持久化)对全页生效: KPI / 图 / 拆分 / 明细同步。
 */

function dimRows(items: TokenBreakdownItem[]): TokenBreakdownRow[] {
  return items.map((d) => ({ key: d.key, label: d.label, tokens: d.total_tokens, calls: d.calls }));
}

function userRows(items: TokenUserItem[]): TokenBreakdownRow[] {
  return items.map((u) => ({
    key: u.user_id == null ? 'anon' : String(u.user_id),
    label: u.user_id == null ? '公众号/匿名' : u.username || u.email || `用户 #${u.user_id}`,
    tokens: u.total_tokens,
    calls: u.calls,
    sub: u.user_id != null && u.username && u.email ? u.email : undefined,
  }));
}

export function TokenUsageStatsPage() {
  const [filters, setFilters] = useState<TokenUsageFilters>({ days: 30 });
  const { data, isLoading } = useTokenUsageSummary(filters);

  const t = data?.totals;
  const cacheTotal = (t?.cache_read_tokens ?? 0) + (t?.cache_creation_tokens ?? 0);
  const cacheBase = (t?.input_tokens ?? 0) + (t?.cache_read_tokens ?? 0);
  const cacheHitRate = cacheBase > 0 ? ((t?.cache_read_tokens ?? 0) / cacheBase) * 100 : 0;

  return (
    <AdminPageLayout
      title="Token 用量统计"
      description="统一 LLM token 账本 · 项目侧 + Agent 侧每次调用一行 · 按维度筛选与导出"
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

      {/* 每日趋势 */}
      <TokenTrendChart daily={data?.daily ?? []} />

      {/* 多维拆分 */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TokenBreakdownCard title="按模型" rows={dimRows(data?.by_model ?? [])} loading={isLoading} color="green" />
        <TokenBreakdownCard title="按功能" rows={dimRows(data?.by_feature ?? [])} loading={isLoading} color="green" />
        <TokenBreakdownCard title="按来源" rows={dimRows(data?.by_source ?? [])} loading={isLoading} color="red" />
        <TokenBreakdownCard title="按 Provider" rows={dimRows(data?.by_provider ?? [])} loading={isLoading} color="red" />
        <TokenBreakdownCard
          title="Top 用户(按用量)"
          rows={userRows(data?.top_users ?? [])}
          loading={isLoading}
          color="green"
          emptyText="暂无用户用量"
        />
      </section>

      {/* 明细 */}
      <TokenUsageLogTable filters={filters} />
    </AdminPageLayout>
  );
}
