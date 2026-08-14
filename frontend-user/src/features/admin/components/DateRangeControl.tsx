// 统一的「日期范围」选择器 —— 全站 admin 监控页共用,口径一致:
//   预设:今天 / 近7天 / 近30天 / 近90天   +   自定义(起止两个日期)
//   · 今天 / 自定义 → 输出 { start, end }(YYYY-MM-DD,含当天)
//   · 近 N 天      → 输出 { days: N }
// 受控组件:父级持有 DateWindow,把它转成自己接口的参数(days 或 start_date/end_date)。
import { useState } from 'react';
import { Input } from '@/shared/ui/input';
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
const DATE_INPUT_CLS = 'h-7 w-auto px-2';

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
        'h-7 rounded-8 px-3 text-12 font-medium transition-colors',
        active ? 'bg-brand-red text-on-brand' : 'bg-surface-2 text-subtle hover:bg-surface-1',
      )}
    >
      {children}
    </button>
  );
}

export interface DateRangeControlProps {
  value: DateWindow;
  onChange: (w: DateWindow) => void;
  className?: string;
}

/** 当前生效窗口的人话描述 —— 自定义没填完时用来说明"你现在看的其实是哪一段"。 */
function effectiveWindowText(w: DateWindow): string {
  if (w.start && w.end) return `${w.start} 至 ${w.end}`;
  return `近 ${w.days ?? 30} 天`;
}

export function DateRangeControl({ value, onChange, className }: DateRangeControlProps) {
  const today = todayISO();
  const isToday = !!value.start && value.start === today && value.end === today;
  const isCustom = !!value.start && !isToday;
  const [openCustom, setOpenCustom] = useState(isCustom);
  const showCustom = openCustom || isCustom;

  /**
   * 🔴 自定义起止用**本地草稿**,只有两侧都填齐才向上抛。
   *
   * 旧写法是每次 onChange 直接抛 `{start: e.target.value, end: value.end || today}` ——
   * 清空一侧后 window 变成 `{start:'', end:'…'}`,而下游 windowParams 要求两者同时为真,
   * 否则**静默**回落到 days:30。于是页面悄悄换成近 30 天,可「自定义」chip 还高亮着、
   * 日期框里还留着一个 end,管理员会以为自己看的是某个特定区间。
   * 现在:没填齐就不改窗口,并明写当前实际生效的是哪一段。
   */
  const [draft, setDraft] = useState({ start: value.start ?? '', end: value.end ?? '' });
  // 外部改窗口(点预设 chip / 父级重置)时把草稿同步过来。渲染期对齐,避免 effect 慢一帧。
  const sig = `${value.start ?? ''}|${value.end ?? ''}`;
  const [lastSig, setLastSig] = useState(sig);
  if (sig !== lastSig) {
    setLastSig(sig);
    setDraft({ start: value.start ?? '', end: value.end ?? '' });
  }

  const commitDraft = (next: { start: string; end: string }) => {
    setDraft(next);
    if (next.start && next.end) onChange({ start: next.start, end: next.end });
  };
  const draftIncomplete = showCustom && !(draft.start && draft.end);

  // 「自定义」展开时,预设 chip 一律让位 —— 否则点开自定义的那一刻 window 还没变,
  // 「近30天」和「自定义」会同时呈朱砂实底激活态(两个互斥选项同时亮)。
  const presetActive = (d: number) => value.days === d && !value.start && !openCustom;

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <Chip
        active={isToday && !openCustom}
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
          <Input
            type="date"
            value={draft.start}
            max={draft.end || today}
            onChange={(e) => commitDraft({ ...draft, start: e.target.value })}
            className={DATE_INPUT_CLS}
          />
          <span className="text-12 text-faint">至</span>
          <Input
            type="date"
            value={draft.end}
            min={draft.start || undefined}
            max={today}
            onChange={(e) => commitDraft({ ...draft, end: e.target.value })}
            className={DATE_INPUT_CLS}
          />
        </div>
      )}
      {draftIncomplete && (
        <span className="text-12 text-brand-amber">
          起止都填齐才会生效,当前仍是{effectiveWindowText(value)}
        </span>
      )}
    </div>
  );
}
