import { cn } from '@/shared/lib/utils';

/**
 * Sidebar 数字徽章 —— 通用 nav item trailing 计数:
 *   <CountBadge n={feedback.pending} tone="danger" />
 *   <CountBadge n={drafts.length} tone="muted" />
 *
 * tone:
 *   danger  → 红底白字(需要立刻处理的事:待办/告警)
 *   muted   → 浅灰底淡字(草稿、参考量等)
 *   brand   → 红字(强调但不抢眼)
 *
 * 上限自动显示 99+,避免长数字撑爆 sidebar。
 */
export function CountBadge({
  n,
  tone = 'muted',
}: {
  n: number;
  tone?: 'danger' | 'muted' | 'brand';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-pill text-2xs font-bold tabular-nums',
        tone === 'danger' && 'bg-brand-red text-white',
        tone === 'muted' && 'bg-surface-2 text-faint',
        tone === 'brand' && 'bg-danger-soft text-brand-red'
      )}
      aria-label={`${n}`}
    >
      {n > 99 ? '99+' : n}
    </span>
  );
}

/**
 * Sidebar 状态点 —— 极简圆点指示器:
 *   <StatusDot tone="warning" />  // 提醒需关注
 *   <StatusDot tone="danger" />   // 告警
 *   <StatusDot tone="success" />  // 健康
 */
export function StatusDot({
  tone,
}: {
  tone: 'warning' | 'danger' | 'success';
}) {
  const labels = { warning: '需要注意', danger: '告警', success: '正常' };
  return (
    <span
      className={cn(
        'inline-block size-2 rounded-pill',
        tone === 'warning' && 'bg-brand-amber',
        tone === 'danger' && 'bg-brand-red',
        tone === 'success' && 'bg-brand-green'
      )}
      aria-label={labels[tone]}
    />
  );
}
