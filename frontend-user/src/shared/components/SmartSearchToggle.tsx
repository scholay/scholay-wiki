import { Switch } from '@/shared/ui/switch';
import { cn } from '@/shared/lib/utils';

/**
 * 输入框内嵌「智能搜索」开关 —— 首页 SearchAutocomplete / 搜索器 Composer 共用。
 */
export function SmartSearchToggle({
  checked,
  onCheckedChange,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}) {
  return (
    <label
      data-tour="home-mode-switch"
      title={checked ? '关闭后切换为文献搜索' : '开启后切换为智能搜索'}
      className={cn(
        'inline-flex shrink-0 cursor-pointer items-center gap-1.5 select-none',
        className,
      )}
      onMouseDown={(e) => e.preventDefault()}
    >
      <span
        className={cn(
          'text-2xs font-medium transition-colors',
          checked ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        智能搜索
      </span>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-label="智能搜索"
      />
    </label>
  );
}
