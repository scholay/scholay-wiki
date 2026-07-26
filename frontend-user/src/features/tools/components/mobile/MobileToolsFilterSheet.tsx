import { MobileBottomSheet } from '@/shared/components/MobileBottomSheet';
import { cn } from '@/shared/lib/utils';
import { ACCESS_TYPE_LABEL, PRICE_TYPE_LABEL } from '@/types/feature-tool';

/**
 * 功能广场移动端「筛选」底部抽屉 —— 与 PC 侧栏(ToolsSidebar)同一套维度:价格 / 获取方式 /
 * 开源 / 排序(分类走顶部 chips)。单选(再点取消),实时写回 URL → 列表自动重查。
 */
export interface ToolFilters {
  price: string; // price_type
  access: string; // access_type
  os: string; // '' | 'open' | 'closed'
  sort: string; // '' | 'hot' | 'new' | 'name'
}

const PRICE_OPTS = ['free', 'freemium', 'trial', 'paid', 'edu'];
const ACCESS_OPTS: Array<'website' | 'download'> = ['website', 'download'];
const OS_OPTS = [
  { v: 'open', l: '开源' },
  { v: 'closed', l: '闭源' },
];
const SORT_OPTS = [
  { v: 'hot', l: '最热' },
  { v: 'new', l: '最新' },
  { v: 'name', l: '名称' },
];

export function MobileToolsFilterSheet({
  open,
  onOpenChange,
  value,
  onChange,
  onReset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: ToolFilters;
  /** 单维度切换(再点同值=取消);写回 URL 由父组件做。 */
  onChange: (patch: Partial<ToolFilters>) => void;
  onReset: () => void;
}) {
  const toggle = (key: keyof ToolFilters, v: string) =>
    onChange({ [key]: value[key] === v ? '' : v } as Partial<ToolFilters>);

  return (
    <MobileBottomSheet open={open} onOpenChange={onOpenChange} title="筛选">
      <div className="flex flex-col gap-5 px-4 pb-3 pt-1">
        <div className="flex items-center justify-between">
          <span className="text-md font-semibold text-foreground">筛选</span>
          <button type="button" onClick={onReset} className="text-xs text-muted-foreground active:opacity-60">
            重置
          </button>
        </div>

        <Section title="价格">
          {PRICE_OPTS.map((v) => (
            <Chip key={v} label={PRICE_TYPE_LABEL[v] ?? v} active={value.price === v} onClick={() => toggle('price', v)} />
          ))}
        </Section>

        <Section title="获取方式">
          {ACCESS_OPTS.map((v) => (
            <Chip key={v} label={ACCESS_TYPE_LABEL[v]} active={value.access === v} onClick={() => toggle('access', v)} />
          ))}
        </Section>

        <Section title="开源">
          {OS_OPTS.map((o) => (
            <Chip key={o.v} label={o.l} active={value.os === o.v} onClick={() => toggle('os', o.v)} />
          ))}
        </Section>

        <Section title="排序">
          {SORT_OPTS.map((o) => (
            <Chip key={o.v} label={o.l} active={value.sort === o.v} onClick={() => toggle('sort', o.v)} />
          ))}
        </Section>
      </div>
    </MobileBottomSheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-faint">{title}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-pill border px-3 py-1.5 text-xs transition-colors',
        active
          ? 'border-foreground bg-foreground font-medium text-on-brand'
          : 'border-border bg-surface-card text-muted-foreground active:bg-surface-1'
      )}
    >
      {label}
    </button>
  );
}
