import { cn } from '@/shared/lib/utils';
import { FOLDER_COLOR_OPTIONS, FOLDER_ICON_OPTIONS } from './folder-icons';

export function FolderAppearanceFields({
  iconId,
  onIconChange,
  colorId,
  onColorChange,
}: {
  iconId: string;
  onIconChange: (id: string) => void;
  colorId: string;
  onColorChange: (id: string) => void;
}) {
  return (
    <>
      <div className="mb-1.5 px-1 text-2xs font-semibold text-faint">
        背景色
      </div>
      <div
        role="listbox"
        aria-label="文件夹背景色"
        className="mb-2.5 flex flex-wrap gap-1.5 px-0.5"
      >
        {FOLDER_COLOR_OPTIONS.map(({ id, label, swatchClass }) => {
          const selected = colorId === id;
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
                selected &&
                  'ring-2 ring-foreground ring-offset-1 ring-offset-background',
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
          const selected = iconId === id;
          return (
            <button
              key={id}
              type="button"
              role="option"
              aria-selected={selected}
              title={label}
              onClick={() => onIconChange(id)}
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
    </>
  );
}
