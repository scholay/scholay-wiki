import { useEffect } from 'react';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';
import { useUrlState, usePatchUrlState } from '@/shared/hooks';
import { todayISO } from '../DateRangeControl';
import {
  useTokenUsageFacets,
  FEATURE_OPTIONS,
  SOURCE_OPTIONS,
  type TokenUsageFilters,
} from '../../api/token-usage';

/**
 * Token 看板筛选条 —— 值存 URL(useUrlState 读 + 刷新/前进后退不丢),
 * 任一项变化时把解析好的 TokenUsageFilters 抛给父级(onChange)。
 *
 * 写入一律走 usePatchUrlState 的**单次** navigate:react-router v7 的 setSearchParams
 * 基于 render 闭包旧 base 计算,同一事件里多个 useUrlState setter 会互相覆盖(只有最后一个生效)。
 * 所以「切预设(改 days + 清 start/end)」「重置(清 9 个 key)」「uid↔anon 联动」都用一次 patch 写完。
 *
 * 时间窗口: days 预设(7/30/90)+ 可选自定义起止(两者都填则覆盖 days)。
 */

const DAY_OPTIONS = [7, 30, 90];
const SELECT_CLS = 'h-8 rounded-8 border border-input bg-surface-card px-2 text-xs text-foreground';

export function TokenUsageFilterBar({ onChange }: { onChange: (f: TokenUsageFilters) => void }) {
  // 只读值;所有写入走 patch(单次 navigate,避免多 key 互相覆盖)。
  const [days] = useUrlState('days', 30, Number);
  const [start] = useUrlState('start', '');
  const [end] = useUrlState('end', '');
  const [feature] = useUrlState('feature', '');
  const [source] = useUrlState('source', '');
  const [model] = useUrlState('model', '');
  const [provider] = useUrlState('provider', '');
  const [keyword] = useUrlState('kw', '');
  const [anon] = useUrlState('anon', '');
  const patch = usePatchUrlState();

  // facets 下拉用 days 窗口取(自定义区间时也用 days 兜底, 足够覆盖可选项)。
  const { data: facets } = useTokenUsageFacets(days);

  const customRange = !!(start && end);

  // 把当前控件值解析成 TokenUsageFilters 抛给父级。primitive 依赖, 不会循环。
  useEffect(() => {
    const f: TokenUsageFilters = {};
    if (customRange) {
      f.start_date = start;
      f.end_date = end;
    } else {
      f.days = days;
    }
    if (feature) f.feature = feature;
    if (source) f.source = source;
    if (model) f.model = model;
    if (provider) f.provider = provider;
    if (anon === '1') {
      f.anon = 1;
    } else if (keyword) {
      f.keyword = keyword;
    }
    onChange(f);
    // onChange 是父级稳定引用; 仅在控件值变化时重算
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, start, end, feature, source, model, provider, keyword, anon, customRange]);

  const hasDimFilter = !!(feature || source || model || provider || keyword || anon === '1' || start || end);

  const reset = () =>
    patch({ days: null, start: null, end: null, feature: null, source: null, model: null, provider: null, kw: null, anon: null });

  return (
    <section className="mb-6 flex flex-wrap items-end gap-3 rounded-16 border border-border-soft bg-surface-1 p-3">
      {/* 时间窗口预设 */}
      <div className="space-y-1">
        <Label className="text-2xs text-faint">时间范围</Label>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => patch({ days: null, start: todayISO(), end: todayISO() })}
            className={cn(
              'h-8 px-3 rounded-8 text-xs font-medium transition-colors',
              start && start === todayISO() && end === todayISO()
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
            )}
          >
            今天
          </button>
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => patch({ days: d === 30 ? null : d, start: null, end: null })}
              className={cn(
                'h-8 px-3 rounded-8 text-xs font-medium transition-colors',
                !customRange && d === days
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
              )}
            >
              {d} 天
            </button>
          ))}
        </div>
      </div>

      {/* 自定义区间 */}
      <div className="w-full space-y-1 sm:w-auto">
        <Label className="text-2xs text-faint">自定义起止</Label>
        <div className="flex items-center gap-1">
          <Input
            type="date"
            value={start}
            onChange={(e) => patch({ start: e.target.value || null })}
            className="h-8 min-w-0 flex-1 sm:w-36 sm:flex-none"
          />
          <span className="text-faint text-xs">→</span>
          <Input
            type="date"
            value={end}
            onChange={(e) => patch({ end: e.target.value || null })}
            className="h-8 min-w-0 flex-1 sm:w-36 sm:flex-none"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-2xs text-faint">功能</Label>
        <select value={feature} onChange={(e) => patch({ feature: e.target.value || null })} className={cn(SELECT_CLS, 'w-28')}>
          <option value="">全部</option>
          {FEATURE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <Label className="text-2xs text-faint">来源</Label>
        <select value={source} onChange={(e) => patch({ source: e.target.value || null })} className={cn(SELECT_CLS, 'w-24')}>
          <option value="">全部</option>
          {SOURCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <Label className="text-2xs text-faint">模型</Label>
        <select value={model} onChange={(e) => patch({ model: e.target.value || null })} className={cn(SELECT_CLS, 'w-40 max-w-40')}>
          <option value="">全部</option>
          {(facets?.models ?? []).map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <Label className="text-2xs text-faint">Provider</Label>
        <select value={provider} onChange={(e) => patch({ provider: e.target.value || null })} className={cn(SELECT_CLS, 'w-32')}>
          <option value="">全部</option>
          {(facets?.providers ?? []).map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <Label className="text-2xs text-faint">用户</Label>
        <Input
          value={keyword}
          onChange={(e) => patch({ kw: e.target.value || null, anon: e.target.value ? null : undefined })}
          placeholder="ID / 用户名 / 邮箱 / 手机号"
          disabled={anon === '1'}
          className="h-8 w-48"
        />
      </div>

      <label className="flex items-center gap-1.5 h-8 text-xs text-subtle cursor-pointer select-none">
        <input
          type="checkbox"
          checked={anon === '1'}
          onChange={(e) => patch({ anon: e.target.checked ? '1' : null, kw: e.target.checked ? null : undefined })}
          className="size-3.5 accent-[var(--color-brand-green)]"
        />
        仅公众号/匿名
      </label>

      {hasDimFilter && (
        <Button size="sm" variant="ghost" onClick={reset}>
          重置
        </Button>
      )}
    </section>
  );
}
