import { useState, type ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { cn } from '@/shared/lib/utils';
import { FOLDER_COLOR_OPTIONS, FOLDER_ICON_OPTIONS } from './folder-icons';

interface FolderIconPickerProps {
  value?: string;
  onChange: (iconId: string) => void;
  colorValue?: string;
  onColorChange: (colorId: string) => void;
  /** 触发器(通常是文件夹图标按钮) */
  children: ReactNode;
  /** 窄轨时弹层仍靠右 */
  side?: 'right' | 'bottom';
}

/**
 * 文件夹自定义图标 + 背景色 —— 点图标弹出候选矩阵。
 * 检索工作区与文献集侧栏共用;样式存 `scholay.workspace-folder-ui`。
 */
export function FolderIconPicker({
  value,
  onChange,
  colorValue = 'none',
  onColorChange,
  children,
  side = 'right',
}: FolderIconPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side={side}
        align="start"
        sideOffset={8}
        className="w-[220px] p-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1.5 px-1 text-2xs font-semibold text-faint">
          背景色
        </div>
        <div
          role="listbox"
          aria-label="文件夹背景色"
          className="mb-2.5 flex flex-wrap gap-1.5 px-0.5"
        >
          {FOLDER_COLOR_OPTIONS.map(({ id, label, swatchClass }) => {
            const selected = colorValue === id;
            return (
              <button
                key={id}
                type="button"
                role="option"
                aria-selected={selected}
                title={label}
                onClick={() => onColorChange(id)}
                className={cn(
                  'inline-flex size-6 cursor-pointer items-center justify-center rounded-pill transition-shadow',
                  selected && 'ring-2 ring-foreground ring-offset-1 ring-offset-background',
                )}
              >
                <span
                  className={cn('size-4 rounded-pill', swatchClass)}
                  aria-hidden
                />
              </button>
            );
          })}
        </div>

        <div className="mb-1.5 px-1 text-2xs font-semibold text-faint">
          图标
        </div>
        <div
          role="listbox"
          aria-label="文件夹图标"
          className="grid grid-cols-5 gap-1"
        >
          {FOLDER_ICON_OPTIONS.map(({ id, Icon, label }) => {
            const selected = value === id;
            return (
              <button
                key={id}
                type="button"
                role="option"
                aria-selected={selected}
                title={label}
                onClick={() => onChange(id)}
                className={cn(
                  'inline-flex size-9 cursor-pointer items-center justify-center rounded-md transition-colors',
                  selected
                    ? 'bg-foreground text-background'
                    : 'text-subtle hover:bg-surface-1 hover:text-foreground',
                )}
              >
                <Icon className="size-4" strokeWidth={1.8} />
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
