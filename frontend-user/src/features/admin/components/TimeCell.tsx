import { relativeTimeZh } from '@/shared/lib/relative-time';
import { cn } from '@/shared/lib/utils';

/**
 * 后台统一时间单元格 —— **相对时间主显 + 绝对时刻挂 title**。
 *
 * 为什么要有这个组件:改造前后台的时间显示有四种精度并存,全部靠字符串切片,
 * 一律不经 `new Date()`,所以一个相对时间都没有:
 *   - `slice(0, 10)`  只到日   (支付配置)
 *   - `slice(0, 16)`  到分     (用户 / 会话监控 / 审稿)
 *   - `slice(0, 19)`  到秒     (发送记录 / 订单)
 *   - `slice(5, 16)`  连年都砍 (邮件中心)
 *
 * 而「最后活跃」「工单提交」「key 最近使用」「会话最后访问」这几列存在的**唯一理由**
 * 就是回答"这条是刚刚的还是上周的" —— 扫一列 `2026-08-01 09:12` 是答不出来的。
 * 所以主显相对时间,精确时刻放 title(排查要跟后端日志对齐时再悬停看)。
 */
export function TimeCell({
  value,
  /** 空值占位,默认 `—` */
  fallback = '—',
  /** 前缀,如「发送 」「创建 」—— 同一列混用两种语义时必须写明 */
  prefix,
  /** 只显示绝对时刻(表单/详情里已有上下文,不需要相对) */
  absolute,
  className,
}: {
  value?: string | null;
  fallback?: string;
  prefix?: string;
  absolute?: boolean;
  className?: string;
}) {
  const d = parseBackendTime(value);
  if (!d) return <span className={cn('text-faint', className)}>{fallback}</span>;

  const abs = formatAbsolute(d);
  const rel = relativeTimeZh(d.toISOString());

  return (
    <span
      className={cn('tabular-nums whitespace-nowrap text-faint', className)}
      title={prefix ? `${prefix}${abs}` : abs}
    >
      {prefix}
      {absolute ? abs : rel || abs}
    </span>
  );
}

/**
 * 解析后端时间 —— 后端并非只吐 RFC3339。
 *
 * 🔴 Safari 对 `2026-08-03 14:00:00`(空格分隔)这种格式 `new Date()` 直接得 NaN,
 * 而本项目多个 admin 接口正是这个格式(GORM 的 `datetime` 列 + 自定义 marshal)。
 * 所以统一先把空格换成 `T` 再解析;失败返回 null 交给调用方兜底,**不抛**。
 */
export function parseBackendTime(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(typeof value === 'string' ? value.replace(' ', 'T') : value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `2026-08-03 14:11:22` —— 后台对账用,固定到秒,不随浏览器 locale 变 */
export function formatAbsolute(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}

/** 供非 JSX 场景(title 拼接 / 导出)复用 */
export function formatBackendTime(value?: string | null, fallback = '—'): string {
  const d = parseBackendTime(value);
  return d ? formatAbsolute(d) : fallback;
}
