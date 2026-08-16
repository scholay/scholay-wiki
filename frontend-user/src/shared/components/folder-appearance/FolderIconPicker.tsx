import { useState, type ReactNode } from 'react';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/ui/popover';
import { FolderAppearanceFields } from './FolderAppearanceFields';

interface FolderIconPickerProps {
  value?: string;
  onChange: (iconId: string) => void;
  colorValue?: string;
  onColorChange: (colorId: string) => void;
  /** 触发器(通常是文件夹图标按钮) */
  children: ReactNode;
  /** 窄轨时弹层仍靠右 */
  side?: 'right' | 'bottom';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** click = 点触发器打开; contextmenu = 左键留给父级,由外部打开 */
  openOn?: 'click' | 'contextmenu';
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
  open: openProp,
  onOpenChange,
  openOn = 'click',
}: FolderIconPickerProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {openOn === 'contextmenu' ? (
        <PopoverAnchor asChild>{children}</PopoverAnchor>
      ) : (
        <PopoverTrigger asChild>{children}</PopoverTrigger>
      )}
      <PopoverContent
        side={side}
        align="start"
        sideOffset={8}
        className="w-[220px] p-2"
        onClick={(e) => e.stopPropagation()}
      >
        <FolderAppearanceFields
          iconId={value ?? 'folder'}
          onIconChange={onChange}
          colorId={colorValue}
          onColorChange={onColorChange}
        />
      </PopoverContent>
    </Popover>
  );
}
