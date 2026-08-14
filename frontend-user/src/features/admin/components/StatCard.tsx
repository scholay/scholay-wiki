import { type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { toApiError } from '@/shared/lib/http';
import { Skeleton } from '@/shared/ui/skeleton';
import { cn } from '@/shared/lib/utils';

/**
 * KPI 卡 —— Dashboard 顶部数字卡片。
 * 白底 + 1px 描边,无阴影,数字 24 中粗。
 *
 * 🔴 **传了 error 就绝不会回落成 0**。改造前各统计页普遍写 `(x ?? 0).toLocaleString()`,
 * 接口一挂,后台就斩钉截铁地显示「总使用次数 0 / 总算力点 0 / 30 日营收 ¥0.00」——
 * 这不是白屏,是**显示错误数字**,比白屏危险得多(会被当成真实经营结论)。
 * 所以这里把 loading / error / 正常 拆成三态,错误态只给 `—` 加一个可悬停看原因的警告图标。
 */
export function StatCard({
  label,
  value,
  hint,
  icon,
  trend,
  loading,
  error,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  /** 同比/环比小标,正数绿色,负数红色 */
  trend?: { value: string; positive?: boolean };
  /** 首屏加载中 —— 渲染骨架而不是 0 */
  loading?: boolean;
  /** query 的 error —— 传了就走错误态,不显示任何数字 */
  error?: unknown;
  className?: string;
}) {
  const errMsg = error ? toApiError(error).message || '加载失败' : null;

  return (
    <div
      className={cn(
        'rounded-16 border border-border bg-surface-card p-4 flex flex-col gap-2',
        className
      )}
    >
      <div className="flex items-center justify-between text-faint">
        <span className="text-12">{label}</span>
        {icon && <span className="[&_svg]:size-4">{icon}</span>}
      </div>

      {/* tabular-nums:同一行几张卡的数字位数不同也能对齐,扫一排 KPI 才不跳 */}
      {errMsg ? (
        <div
          className="flex items-center gap-1.5 text-24 font-medium text-faint"
          title={`加载失败:${errMsg}`}
        >
          <span className="tabular-nums">—</span>
          <AlertTriangle className="size-4 text-brand-red" />
        </div>
      ) : loading ? (
        <Skeleton className="h-8 w-24 rounded-8" />
      ) : (
        <div className="text-24 font-medium text-foreground tabular-nums">{value}</div>
      )}

      {errMsg ? (
        <div className="text-12 text-brand-red truncate" title={errMsg}>
          {errMsg}
        </div>
      ) : (
        (hint || trend) && (
          <div className="flex items-center gap-2 text-12">
            {trend && (
              <span
                className={cn(
                  'font-medium tabular-nums',
                  trend.positive ? 'text-brand-green' : 'text-brand-red'
                )}
              >
                {trend.value}
              </span>
            )}
            {hint && <span className="text-muted-foreground">{hint}</span>}
          </div>
        )
      )}
    </div>
  );
}
