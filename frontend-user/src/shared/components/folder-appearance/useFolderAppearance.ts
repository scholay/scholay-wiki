import { cn } from '@/shared/lib/utils';
import { useWorkspaceFolderUi } from '@/stores/workspace-folder.store';
import {
  folderIconStorageKey,
  resolveFolderColor,
  resolveFolderIcon,
} from './folder-icons';

/**
 * 文件夹图标/背景色 —— 读写 `useWorkspaceFolderUi`,检索工作区与文献集共用同一份持久化。
 */
export function useFolderAppearance(
  folderKey: 'staging' | number,
  fallback: 'staging' | 'folder',
) {
  const storageKey = folderIconStorageKey(folderKey);
  const iconId = useWorkspaceFolderUi((s) => s.folderIcons[storageKey]);
  const setFolderIcon = useWorkspaceFolderUi((s) => s.setFolderIcon);
  const colorId = useWorkspaceFolderUi((s) => s.folderColors[storageKey]);
  const setFolderColor = useWorkspaceFolderUi((s) => s.setFolderColor);
  const defaultIconId = fallback === 'staging' ? 'inbox' : 'folder';
  const Icon = resolveFolderIcon(iconId ?? defaultIconId, fallback);
  const color = resolveFolderColor(colorId);
  const hasColor = Boolean(color.bgClass);

  const iconShellClass = cn(
    'inline-flex size-6 shrink-0 items-center justify-center rounded-sm',
    hasColor
      ? cn(color.bgClass, color.fgClass)
      : 'text-muted-foreground',
  );

  const pickerProps = {
    value: iconId ?? defaultIconId,
    onChange: (id: string) => setFolderIcon(storageKey, id),
    colorValue: colorId ?? 'none',
    onColorChange: (id: string) => setFolderColor(storageKey, id),
    side: 'right' as const,
  };

  return { Icon, color, hasColor, iconShellClass, pickerProps };
}
