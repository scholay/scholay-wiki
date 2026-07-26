import { cn } from '@/shared/lib/utils';

/**
 * 键盘按键提示 — cmdk 命令面板 / shortcut 提示常用。
 *   <Kbd>⌘</Kbd><Kbd>K</Kbd>
 */
export function Kbd({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-4 border border-border bg-surface-1 px-1 font-mono text-2xs text-muted-foreground',
        className
      )}
      {...props}
    />
  );
}
