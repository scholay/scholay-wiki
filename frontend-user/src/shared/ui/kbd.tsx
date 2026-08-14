import { cn } from '@/shared/lib/utils';

/**
 * 键盘按键提示 — cmdk 命令面板 / shortcut 提示常用。
 *   <Kbd>⌘</Kbd><Kbd>K</Kbd>
 *
 * KEEP text-12 —— 按键提示是辅助信息层(与 DropdownMenuShortcut 同层),Figma 未给规格。
 * 且外框只有 h-5(20px),14px 文字按 leading-sans 1.25 = 17.5px 会几乎顶满、把边框挤没。
 */
export function Kbd({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-4 border border-border bg-surface-1 px-1 font-mono text-12 text-muted-foreground',
        className
      )}
      {...props}
    />
  );
}
