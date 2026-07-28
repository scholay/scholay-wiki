import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import { compactTokens } from '../../api/token-usage';
import { COMPOSITION_SEGMENTS, fillColor } from './palette';

/**
 * 维度拆分面板 —— 一张卡 + Tab 切维度(模型/功能/来源/Provider/用户),
 * 取代原先并排 5 张「只有总量」的卡。每行一条分段横条(输入/输出/缓存命中/缓存创建,
 * 颜色与主图「构成」一致),条长 = 占该维度最大值的比例;行下附四项细分数字。
 */

export interface DimRow {
  key: string;
  label: string;
  sub?: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
  total: number;
  calls: number;
}

export interface DimTab {
  value: string;
  title: string;
  rows: DimRow[];
  emptyText?: string;
}

export function TokenDimensionPanel({ tabs, loading }: { tabs: DimTab[]; loading?: boolean }) {
  return (
    <section className="mb-6 rounded-16 border border-border bg-surface-card p-4">
      <Tabs defaultValue={tabs[0]?.value}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 max-w-full overflow-x-auto">
            <TabsList>
              {tabs.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>
                  {t.title}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {/* 分段颜色图例(与主图「构成」同色) */}
          <div className="flex items-center gap-3 text-12 text-faint">
            {COMPOSITION_SEGMENTS.map((s) => (
              <span key={s.key} className="flex items-center gap-1">
                {/* 8px 图例色块用 2px 圆角 —— 档位缺口豁免,见 design-system-guard 的「禁止 arbitrary 圆角」 */}
                <span className="size-2 rounded-[2px]" style={{ backgroundColor: fillColor(s.fill) }} />
                {s.label}
              </span>
            ))}
          </div>
        </div>
        {tabs.map((t) => (
          <TabsContent key={t.value} value={t.value} className="mt-0">
            <DimRows rows={t.rows} loading={loading} emptyText={t.emptyText ?? '暂无数据'} />
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}

function DimRows({ rows, loading, emptyText }: { rows: DimRow[]; loading?: boolean; emptyText: string }) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => {
        const segments = [
          { label: '输入', value: r.input, fill: COMPOSITION_SEGMENTS[0].fill },
          { label: '输出', value: r.output, fill: COMPOSITION_SEGMENTS[1].fill },
          { label: '缓存命中', value: r.cacheRead, fill: COMPOSITION_SEGMENTS[2].fill },
          { label: '缓存创建', value: r.cacheCreation, fill: COMPOSITION_SEGMENTS[3].fill },
        ];
        return (
          <div key={r.key} className="flex flex-col">
            <div className="flex items-baseline justify-between gap-2 text-12">
              <span className="truncate font-medium text-subtle">
                {r.label}
                {r.sub && <span className="ml-1 font-normal text-faint">{r.sub}</span>}
              </span>
              <span className="shrink-0 tabular-nums text-faint">
                {compactTokens(r.total)} · {r.calls.toLocaleString()} 次
              </span>
            </div>
            <div className="mt-1 h-2.5 w-full overflow-hidden rounded-pill bg-surface-2">
              <div className="flex h-full" style={{ width: `${(r.total / max) * 100}%` }}>
                {segments
                  .filter((s) => s.value > 0)
                  .map((s) => (
                    <div
                      key={s.label}
                      title={`${s.label} ${s.value.toLocaleString()}`}
                      style={{
                        width: `${(s.value / Math.max(1, r.total)) * 100}%`,
                        backgroundColor: fillColor(s.fill),
                      }}
                    />
                  ))}
              </div>
            </div>
            <div className="mt-0.5 text-12 tabular-nums text-faint">
              输入 {compactTokens(r.input)} · 输出 {compactTokens(r.output)} · 命中 {compactTokens(r.cacheRead)}
              {r.cacheCreation > 0 && <> · 创建 {compactTokens(r.cacheCreation)}</>}
            </div>
          </div>
        );
      })}
      {!loading && rows.length === 0 && <p className="py-6 text-center text-12 text-faint">{emptyText}</p>}
    </div>
  );
}
