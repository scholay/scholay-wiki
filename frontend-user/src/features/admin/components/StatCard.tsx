import { type ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';

/**
 * KPI 卡 —— Dashboard 顶部数字卡片。
 * .pen 风格:白底 + 1px 描边,无阴影,数字 2xl 加粗。
 */
export function StatCard({
  label,
  value,
  hint,
  icon,
  trend,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  /** 同比/环比小标,正数绿色,负数红色 */
  trend?: { value: string; positive?: boolean };
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-md border border-border bg-surface-card p-4 flex flex-col gap-2',
        className
      )}
    >
      <div className="flex items-center justify-between text-faint">
        <span className="text-sm">{label}</span>
        {icon && <span className="[&_svg]:size-4">{icon}</span>}
      </div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      {(hint || trend) && (
        <div className="flex items-center gap-2 text-xs">
          {trend && (
            <span
              className={cn(
                'font-bold',
                trend.positive ? 'text-brand-green' : 'text-brand-red'
              )}
            >
              {trend.value}
            </span>
          )}
          {hint && <span className="text-muted-foreground">{hint}</span>}
        </div>
      )}
    </div>
  );
}
