// 统一的「日期范围」选择器 —— 全站 admin 监控页共用,口径一致:
//   预设:今天 / 近7天 / 近30天 / 近90天   +   自定义(起止两个日期)
//   · 今天 / 自定义 → 输出 { start, end }(YYYY-MM-DD,含当天)
//   · 近 N 天      → 输出 { days: N }
// 受控组件:父级持有 DateWindow,把它转成自己接口的参数(days 或 start_date/end_date)。
import { useState } from 'react';
import { cn } from '@/shared/lib/utils';

export interface DateWindow {
  days?: number;
  start?: string; // YYYY-MM-DD
  end?: string; // YYYY-MM-DD
}

/** 把 DateWindow 转成后端 query 参数:有起止 → start_date/end_date;否则 → days。 */
export function windowParams(w: DateWindow): { days?: number; start_date?: string; end_date?: string } {
  if (w.start && w.end) return { start_date: w.start, end_date: w.end };
  return { days: w.days ?? 30 };
}

/** 把 DateWindow 解析成具体起止日期(预设 → 近 N 天的日历区间,含今天)。给只收 start/end 的接口用。 */
export function windowToDateRange(w: DateWindow): { start: string; end: string } {
  if (w.start && w.end) return { start: w.start, end: w.end };
  const days = w.days ?? 30;
  const today = new Date();
  const startD = new Date(today);
  startD.setDate(today.getDate() - (days - 1));
  const p = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return { start: fmt(startD), end: fmt(today) };
}

/** 本地当天(不做 UTC 转换,跟随浏览器本地日历)。 */
export function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const DAY_PRESETS = [7, 30, 90];
const DATE_INPUT_CLS = 'h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground';

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-7 rounded-md px-3 text-xs font-medium transition-colors',
        active ? 'bg-brand-red text-background' : 'bg-surface-2 text-subtle hover:bg-surface-1',
      )}
    >
      {children}
    </button>
  );
}

export interface DateRangeControlProps {
  value: DateWindow;
  onChange: (w: DateWindow) => void;
  /** 自定义可选的最大日期,默认今天。 */
  className?: string;
}

export function DateRangeControl({ value, onChange, className }: DateRangeControlProps) {
  const today = todayISO();
  const isToday = !!value.start && value.start === today && value.end === today;
  const isCustom = !!value.start && !isToday;
  const [openCustom, setOpenCustom] = useState(isCustom);
  const showCustom = openCustom || isCustom;

  const presetActive = (d: number) => value.days === d && !value.start;

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <Chip
        active={isToday}
        onClick={() => {
          setOpenCustom(false);
          onChange({ start: today, end: today });
        }}
      >
        今天
      </Chip>
      {DAY_PRESETS.map((d) => (
        <Chip
          key={d}
          active={presetActive(d)}
          onClick={() => {
            setOpenCustom(false);
            onChange({ days: d });
          }}
        >
          近{d}天
        </Chip>
      ))}
      <Chip active={showCustom} onClick={() => setOpenCustom((o) => !o)}>
        自定义
      </Chip>
      {showCustom && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={value.start ?? ''}
            max={value.end || today}
            onChange={(e) => onChange({ start: e.target.value, end: value.end || today })}
            className={DATE_INPUT_CLS}
          />
          <span className="text-xs text-faint">至</span>
          <input
            type="date"
            value={value.end ?? ''}
            min={value.start || undefined}
            max={today}
            onChange={(e) => onChange({ start: value.start || e.target.value, end: e.target.value })}
            className={DATE_INPUT_CLS}
          />
        </div>
      )}
    </div>
  );
}
