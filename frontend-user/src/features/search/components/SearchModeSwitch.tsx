import { SmartSearchToggle } from '@/shared/components/SmartSearchToggle';
import { cn } from '@/shared/lib/utils';
import type { SearchMode } from '../search-mode';

interface SearchModeSwitchProps {
  mode: SearchMode;
  onModeChange: (mode: SearchMode) => void;
  className?: string;
}

/**
 * 智能搜索开关 —— 开 = 对话式智能搜索,关 = 传统搜索。
 * 优先嵌在输入框内(见 SmartSearchToggle);本组件保留给仍单独挂载的入口。
 */
export function SearchModeSwitch({
  mode,
  onModeChange,
  className,
}: SearchModeSwitchProps) {
  return (
    <div className={cn('flex w-full items-center justify-start', className)}>
      <SmartSearchToggle
        checked={mode === 'smart'}
        onCheckedChange={(on) => onModeChange(on ? 'smart' : 'classic')}
      />
    </div>
  );
}
