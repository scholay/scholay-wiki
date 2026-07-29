import { Moon, Sun } from 'lucide-react';
import { IconButton } from '@/shared/components/IconButton';
import { resolveTheme, useThemeStore } from '@/stores/theme.store';

/**
 * 顶栏最右侧：日间 / 夜间一键切换。
 */
export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const resolved = resolveTheme(theme);
  const isDark = resolved === 'dark';

  return (
    <IconButton
      tooltip={isDark ? '切换日间模式' : '切换夜间模式'}
      aria-label={isDark ? '切换日间模式' : '切换夜间模式'}
      aria-pressed={isDark}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="rounded-lg bg-surface-2"
    >
      {isDark ? <Sun strokeWidth={2} /> : <Moon strokeWidth={2} />}
    </IconButton>
  );
}
