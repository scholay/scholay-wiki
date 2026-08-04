import { Link } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import { ListSkeleton } from '@/shared/components/LoadingState';
import { ResourceError } from '@/shared/components/ResourceError';
import { compactTokens, exactPoints, formatPoints, formatYuan } from '../../api/token-usage';

/**
 * 维度拆分面板 —— 一张卡 + Tab 切维度(模型/功能/来源/Provider/用户)。
 *
 * 主指标是**算力点**:横条长度 ∝ 该行算力点占本维度最大值的比例,右上角给算力点 + 调用次数,
 * 副行才是 token 明细(输入/输出/缓存)。
 *
 * 🔴 横条刻意是**实心**而不是像主图那样按 输入/输出/缓存 四色分段 —— 长度是「成本」、
 * 分段是「token 数量」,两者不是同一个量纲,混在一根条上会让人把「缓存命中占了半根条」
 * 误读成「缓存花了一半的钱」(缓存读单价通常只有输入的 1/10~1/100,恰恰相反)。
 * token 构成想看分色去主图的「token 构成」档。
 */

export interface DimRow {
  key: string;
  label: string;
  /**
   * 该行实体的详情深链(如 Top 用户 → `/admin/users?q=<id>`)。
   * 传了就把 label 渲染成链接 —— 「谁烧掉了几万算力点」之后必然要点进去看,
   * 纯文本会逼人手抄 ID 再去别的页面搜。
   */
  href?: string;
  sub?: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
  calls: number;
  /** 该行消耗(微元);÷1000 = 算力点。**主指标** —— 条长与排序都由它决定。
   *  刻意不带 token 总量字段:留着它,下一个人很容易把「total」当成主指标再画一次条,
   *  就又回到「长度是 token、标签是算力点」的混合口径。token 明细走 input/output/cache 三项副行。 */
  costMicro: number;
  /** 该行未计价的调用次数(cost=0):>0 时行尾标注,避免「0 算力点」被读成「不花钱」。 */
  unpricedCalls?: number;
}

export interface DimTab {
  value: string;
  title: string;
  rows: DimRow[];
  emptyText?: string;
}

export function TokenDimensionPanel({
  tabs,
  loading,
  error,
  onRetry,
}: {
  tabs: DimTab[];
  loading?: boolean;
  /** 概览 query 的 error —— 不传就会把"接口挂了"渲染成"暂无数据"。 */
  error?: unknown;
  onRetry?: () => void;
}) {
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
          <span className="text-12 text-faint">条长 = 算力点占比</span>
        </div>
        {tabs.map((t) => (
          <TabsContent key={t.value} value={t.value} className="mt-0">
            <DimRows
              rows={t.rows}
              loading={loading}
              error={error}
              onRetry={onRetry}
              emptyText={t.emptyText ?? '暂无数据'}
            />
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}

function DimRows({
  rows,
  loading,
  error,
  onRetry,
  emptyText,
}: {
  rows: DimRow[];
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  emptyText: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.costMicro));

  // 三态顺序与 DataTable 一致:error 先于 loading —— react-query 自动重试期间
  // loading 会再次为 true,先判 loading 会让失败被骨架永久盖住。
  if (error) {
    return (
      <ResourceError
        error={error}
        resourceName="维度拆分"
        onRetry={onRetry}
        autoRedirect={false}
        className="h-auto bg-surface-card"
      />
    );
  }
  // loading 时 rows 也是空数组 —— 若直接走 map,切筛选那一两秒整张卡是空白且高度塌陷,
  // 会带动下方明细表上下跳。骨架把高度撑住。
  if (loading && rows.length === 0) return <ListSkeleton rows={5} withTrailing={false} />;

  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => (
        <div key={r.key} className="flex flex-col">
          <div className="flex items-baseline justify-between gap-2 text-12">
            <span className="min-w-0 truncate font-medium text-subtle" title={r.label}>
              {r.href ? (
                <Link to={r.href} className="hover:text-brand-red hover:underline underline-offset-2">
                  {r.label}
                </Link>
              ) : (
                r.label
              )}
              {r.sub && <span className="ml-1 font-normal text-faint">{r.sub}</span>}
            </span>
            <span
              className="shrink-0 tabular-nums text-faint"
              title={`${exactPoints(r.costMicro)} 算力点 ≈ ${formatYuan(r.costMicro)}`}
            >
              <span className="font-medium text-foreground">{formatPoints(r.costMicro)}</span> 算力点 ·{' '}
              {r.calls.toLocaleString()} 次
            </span>
          </div>
          <div className="mt-1 h-2.5 w-full overflow-hidden rounded-pill bg-surface-2">
            <div
              className="h-full rounded-pill bg-brand-green"
              style={{ width: `${(r.costMicro / max) * 100}%` }}
              title={`${exactPoints(r.costMicro)} 算力点 ≈ ${formatYuan(r.costMicro)}`}
            />
          </div>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-12 tabular-nums text-faint">
            <span>
              {formatYuan(r.costMicro)} · 输入 {compactTokens(r.input)} · 输出 {compactTokens(r.output)} · 命中{' '}
              {compactTokens(r.cacheRead)}
              {r.cacheCreation > 0 && <> · 创建 {compactTokens(r.cacheCreation)}</>}
            </span>
            {!!r.unpricedCalls && (
              <span className="text-brand-amber">其中 {r.unpricedCalls.toLocaleString()} 次未计价</span>
            )}
          </div>
        </div>
      ))}
      {rows.length === 0 && <p className="py-6 text-center text-12 text-faint">{emptyText}</p>}
    </div>
  );
}
