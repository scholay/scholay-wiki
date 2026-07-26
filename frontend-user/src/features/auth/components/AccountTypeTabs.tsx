import { cn } from '@/shared/lib/utils';
import type { AccountType } from '../types';

interface AccountTypeTabsProps {
  value: AccountType;
  onChange: (v: AccountType) => void;
  className?: string;
}

/**
 * 邮箱 / 手机号 切换 — 平铺式 segmented control,适合弹窗顶部。
 * 这里不复用 shadcn Tabs:因为 Tabs 主要承载 TabsContent,
 * 而我们的切换只改一个 controlled value,Tabs 引入冗余 trigger 语义。
 */
const TABS: { value: AccountType; label: string }[] = [
  { value: 'email', label: '邮箱' },
  { value: 'phone', label: '手机号' },
];

export function AccountTypeTabs({
  value,
  onChange,
  className,
}: AccountTypeTabsProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-12 bg-surface-2 p-0.5 text-sm',
        className
      )}
    >
      {TABS.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={cn(
            'h-7 px-3 rounded-8 transition-colors',
            value === t.value
              ?'bg-surface-card text-foreground shadow-raised'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
