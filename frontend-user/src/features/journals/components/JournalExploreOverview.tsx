import { BookOpen, Globe, Layers, Unlock } from 'lucide-react';
import { useJournalStats } from '../api/journals';
import { cn } from '@/shared/lib/utils';

/**
 * 期刊探索概览 —— 无 keyword + 无 filter 时显示在结果区顶部。
 *
 * 数据来源 `/public/journals/stats`(上游 `/v1/jnl/stats`):
 *   - 总期刊数 / OA 占比
 *   - 数据源覆盖(crossref/openalex/scimago/jcr/fqb/ccf/gjqk 等)
 *   - JCR + 中科院分区分布
 *   - 国家分布
 *
 * 设计:把"啥都没有"的空查询页变成"在做出选择前先看一眼期刊大盘",
 * 既给用户体感数据,也是个无搜索行为的视觉锚点。
 */
export function JournalExploreOverview() {
  const { data, isLoading } = useJournalStats();

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-[88px] rounded-md bg-background border border-border-soft animate-pulse"
          />
        ))}
      </div>
    );
  }

  const oaPct =
    data.totalJournals > 0
      ? Math.round((data.oaCount / data.totalJournals) * 100)
      : 0;
  const sourceCount = Object.keys(data.sourceCoverage ?? {}).length;
  const countryCount = data.countryDistribution?.length ?? 0;

  const jcrDist = (data.quartileDistribution?.jcr ?? [])
    .filter((x) => /^Q[1-4]$/.test(x.q))
    .sort((a, b) => a.q.localeCompare(b.q));
  const fqbDist = (data.quartileDistribution?.fqb ?? [])
    .filter((x) => /^[1-4]$/.test(x.q))
    .sort((a, b) => a.q.localeCompare(b.q));

  return (
    <section className="space-y-5">
      {/* KPI 行 —— 4 卡 */}
      <div className="grid grid-cols-4 gap-3">
        <KpiCard
          icon={<BookOpen className="size-4" />}
          label="总期刊"
          value={data.totalJournals.toLocaleString()}
          tone="red"
        />
        <KpiCard
          icon={<Unlock className="size-4" />}
          label="开放获取"
          value={`${data.oaCount.toLocaleString()}`}
          sub={`占比 ${oaPct}%`}
          tone="green"
        />
        <KpiCard
          icon={<Globe className="size-4" />}
          label="覆盖国家"
          value={`${countryCount}`}
          tone="blue"
        />
        <KpiCard
          icon={<Layers className="size-4" />}
          label="数据源"
          value={`${sourceCount}`}
          tone="amber"
        />
      </div>

      {/* 分区分布 */}
      <div className="grid grid-cols-2 gap-3">
        <DistributionPanel
          title="JCR 分区分布"
          items={jcrDist.map((x) => ({ label: x.q, count: x.cnt }))}
          colors={{
            Q1: 'bg-brand-green',
            Q2: 'bg-cat-blue',
            Q3: 'bg-brand-amber',
            Q4: 'bg-brand-red',
          }}
        />
        <DistributionPanel
          title="中科院分区分布"
          items={fqbDist.map((x) => ({ label: `${x.q} 区`, count: x.cnt }))}
          colors={{
            '1 区': 'bg-brand-green',
            '2 区': 'bg-cat-blue',
            '3 区': 'bg-brand-amber',
            '4 区': 'bg-brand-red',
          }}
        />
      </div>

      {/* 数据源覆盖 */}
      {data.sourceCoverage && Object.keys(data.sourceCoverage).length > 0 && (
        <div className="rounded-md bg-background border border-border-soft px-4 py-3">
          <h3 className="text-2xs font-bold uppercase text-faint">
            数据源覆盖
          </h3>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs">
            {Object.entries(data.sourceCoverage).map(([src, cnt]) => (
              <span key={src} className="inline-flex items-baseline gap-1">
                <span className="font-mono text-muted-foreground">{src}</span>
                <span className="font-bold text-foreground tabular-nums">
                  {Number(cnt).toLocaleString()}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ============================================================================

const TONE_BG: Record<string, string> = {
  red: 'bg-brand-red/10 text-brand-red',
  green: 'bg-brand-green/10 text-brand-green',
  blue: 'bg-cat-blue-soft text-cat-blue',
  amber: 'bg-brand-amber/10 text-brand-amber',
};

function KpiCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone: 'red' | 'green' | 'blue' | 'amber';
}) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3 rounded-md bg-background border border-border">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'inline-flex h-7 w-7 items-center justify-center rounded-sm',
            TONE_BG[tone]
          )}
        >
          {icon}
        </span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="text-xl font-bold text-foreground tabular-nums leading-none">
        {value}
      </div>
      {sub && <div className="text-2xs text-faint">{sub}</div>}
    </div>
  );
}

function DistributionPanel({
  title,
  items,
  colors,
}: {
  title: string;
  items: { label: string; count: number }[];
  colors: Record<string, string>;
}) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="rounded-md bg-background border border-border-soft px-4 py-3">
      <h3 className="text-2xs font-bold uppercase text-faint">
        {title}
      </h3>
      <div className="mt-3 space-y-2">
        {items.length === 0 ? (
          <div className="text-2xs text-faint">无数据</div>
        ) : (
          items.map((it) => (
            <div key={it.label} className="flex items-center gap-3">
              <span className="w-12 text-xs text-subtle font-semibold shrink-0">
                {it.label}
              </span>
              <div className="flex-1 h-2 rounded-pill bg-surface-2 overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-pill transition-all',
                    colors[it.label] ?? 'bg-foreground'
                  )}
                  style={{ width: `${Math.max(2, (it.count / max) * 100)}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums w-16 text-right shrink-0">
                {it.count.toLocaleString()}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
