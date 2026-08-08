import { useMemo, useState } from 'react';
import { Activity, AlertTriangle, Cpu, Loader2, MousePointerClick } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { toApiError } from '@/shared/lib/http';
import { TimeCell } from './TimeCell';
import { formatPoints, useTokenUsageSummary } from '../api/token-usage';
import { useUserUsageEvents } from '../api/usage-stats';
import { buildUserFeatureUsage, featureUsageLabel, usageActionLabel } from './user-usage';

const DAY_PRESETS = [7, 30, 90, 365];

/**
 * 单用户使用状态：业务功能埋点 + LLM 账本的只读联合视图。
 * 不展示 input/output/cache token，所有 AI 消耗统一换算成算力点。
 */
export function UserUsageOverviewPanel({
  userId,
  enabled = true,
}: {
  userId: number;
  enabled?: boolean;
}) {
  const [days, setDays] = useState(30);
  const token = useTokenUsageSummary({ user_id: userId, days }, enabled);
  const events = useUserUsageEvents(userId, days, enabled);
  const eventRows = events.data?.events ?? [];
  const tokenFeatures = token.data?.by_feature ?? [];
  const featureRows = useMemo(
    () => buildUserFeatureUsage(eventRows, tokenFeatures),
    [eventRows, tokenFeatures],
  );
  const totals = token.data?.totals;
  const daily = (token.data?.daily ?? [])
    .filter((row) => row.calls > 0 || row.cost_micro_yuan > 0)
    .slice()
    .reverse()
    .slice(0, 14);
  const recentEvents = eventRows.slice(0, 12);
  const shownEvents = eventRows.length;
  const totalEvents = events.data?.total;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-12 text-faint">
          功能记录与 AI 算力账本合并展示，最长保留 365 天。
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {DAY_PRESETS.map((day) => (
            <Button
              key={day}
              type="button"
              size="sm"
              variant={days === day ? 'default' : 'outline'}
              onClick={() => setDays(day)}
            >
              近{day}天
            </Button>
          ))}
        </div>
      </div>

      {events.isError && (
        <UsageError
          title="功能记录加载失败"
          error={events.error}
          onRetry={() => void events.refetch()}
        />
      )}
      {token.isError && (
        <UsageError
          title="算力用量加载失败"
          error={token.error}
          onRetry={() => void token.refetch()}
        />
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric
          icon={<MousePointerClick className="size-3.5" />}
          label="功能事件"
          value={events.isLoading ? <Loader2 className="size-3.5 animate-spin" /> : (totalEvents ?? '—').toLocaleString()}
        />
        <Metric
          icon={<Cpu className="size-3.5" />}
          label="AI 算力消耗"
          value={token.isLoading ? <Loader2 className="size-3.5 animate-spin" /> : `${formatPoints(totals?.cost_micro_yuan ?? 0)} 点`}
          strong
        />
        <Metric
          icon={<Activity className="size-3.5" />}
          label="AI 调用(含重试)"
          value={token.isLoading ? <Loader2 className="size-3.5 animate-spin" /> : (totals?.total_calls ?? 0).toLocaleString()}
        />
        <Metric
          icon={<Activity className="size-3.5" />}
          label="最近功能事件"
          value={recentEvents[0] ? <TimeCell value={recentEvents[0].created_at} className="text-12" /> : '—'}
        />
      </div>

      {totals && totals.unpriced_calls > 0 && (
        <p className="rounded-8 bg-warning-soft px-2.5 py-2 text-12 text-brand-amber">
          {totals.unpriced_calls.toLocaleString()} 次历史调用缺少当时价格，暂未折算进算力点。
        </p>
      )}

      {featureRows.length > 0 ? (
        <div>
          <div className="mb-2 flex flex-wrap items-end justify-between gap-1">
            <h5 className="text-12 font-medium text-subtle">按功能观测</h5>
            <span className="text-12 text-faint">
              {totalEvents != null && totalEvents > shownEvents
                ? `功能事件显示最近 ${shownEvents} / 共 ${totalEvents.toLocaleString()}`
                : '功能事件与 AI 算力按功能合并'}
            </span>
          </div>
          <div className="overflow-x-auto rounded-12 border border-border">
            <table className="w-full min-w-[540px] text-12 tabular-nums">
              <thead>
                <tr className="border-b border-border bg-surface-1 text-faint">
                  <th className="px-2.5 py-2 text-left font-medium">功能</th>
                  <th className="px-2.5 py-2 text-right font-medium">近期事件</th>
                  <th className="px-2.5 py-2 text-right font-medium">AI 调用</th>
                  <th className="px-2.5 py-2 text-right font-medium">算力点</th>
                  <th className="px-2.5 py-2 text-right font-medium">最近使用</th>
                </tr>
              </thead>
              <tbody>
                {featureRows.map((row) => (
                  <tr key={row.key} className="border-b border-border-soft last:border-0">
                    <td className="px-2.5 py-2 text-subtle">{row.label}</td>
                    <td className="px-2.5 py-2 text-right text-subtle">
                      {row.recentEvents ? row.recentEvents.toLocaleString() : '—'}
                    </td>
                    <td className="px-2.5 py-2 text-right text-subtle">
                      {row.aiCalls ? row.aiCalls.toLocaleString() : '—'}
                    </td>
                    <td className="px-2.5 py-2 text-right font-medium text-foreground">
                      {row.costMicroYuan > 0 ? formatPoints(row.costMicroYuan) : '—'}
                    </td>
                    <td className="px-2.5 py-2 text-right text-faint">
                      <TimeCell value={row.lastUsedAt} className="text-12" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : !events.isLoading && !token.isLoading && !events.isError && !token.isError ? (
        <p className="py-2 text-12 text-faint">该时段没有功能使用或 AI 算力记录。</p>
      ) : null}

      {recentEvents.length > 0 && (
        <div>
          <h5 className="mb-1.5 text-12 font-medium text-subtle">最近功能记录</h5>
          <ul className="divide-y divide-border-soft rounded-12 border border-border px-2.5">
            {recentEvents.map((event) => (
              <li key={event.id} className="flex items-center justify-between gap-3 py-2 text-12">
                <span className="min-w-0 truncate text-subtle">
                  {featureUsageLabel(event.feature)}
                  <span className="ml-1.5 text-faint">· {usageActionLabel(event.action)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-faint">
                  {event.device_type && <span>{deviceLabel(event.device_type)}</span>}
                  <TimeCell value={event.created_at} className="text-12" />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {daily.length > 0 && (
        <div>
          <h5 className="mb-1.5 text-12 font-medium text-subtle">AI 算力日趋势(最近 14 个有用量日)</h5>
          <div className="overflow-hidden rounded-12 border border-border">
            <table className="w-full text-12 tabular-nums">
              <thead>
                <tr className="border-b border-border bg-surface-1 text-faint">
                  <th className="px-2.5 py-2 text-left font-medium">日期</th>
                  <th className="px-2.5 py-2 text-right font-medium">算力点</th>
                  <th className="px-2.5 py-2 text-right font-medium">AI 调用</th>
                </tr>
              </thead>
              <tbody>
                {daily.map((row) => (
                  <tr key={row.date} className="border-b border-border-soft last:border-0">
                    <td className="px-2.5 py-2 text-subtle">{row.date}</td>
                    <td className="px-2.5 py-2 text-right font-medium text-foreground">
                      {formatPoints(row.cost_micro_yuan)}
                    </td>
                    <td className="px-2.5 py-2 text-right text-faint">{row.calls.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-12 text-faint">
        注：历史 AI 算力点是模型实际成本的观测口径，可包含重试或平台承担的调用；用户当前周期的实际扣额以上方「会员与资产」为准。
      </p>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  strong,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="rounded-12 border border-border bg-surface-1 px-2.5 py-2">
      <div className="flex items-center gap-1 text-12 text-faint">{icon}{label}</div>
      <div className={strong ? 'mt-1 text-14 font-medium tabular-nums text-foreground' : 'mt-1 text-12 tabular-nums text-subtle'}>
        {value}
      </div>
    </div>
  );
}

function UsageError({ title, error, onRetry }: { title: string; error: unknown; onRetry: () => void }) {
  return (
    <div className="flex items-start gap-1.5 rounded-8 border border-border bg-danger-soft px-2.5 py-2 text-12">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-brand-red" />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <span className="text-brand-red">{title}：{toApiError(error).message || '未知错误'}</span>
        <span className="text-faint">加载失败不代表该用户没有记录。</span>
        <Button variant="outline" size="sm" onClick={onRetry}>重试</Button>
      </div>
    </div>
  );
}

function deviceLabel(device: string): string {
  const labels: Record<string, string> = {
    desktop: '桌面端',
    mobile: '移动端',
    tablet: '平板',
    miniprogram: '小程序',
  };
  return labels[device] ?? device;
}
