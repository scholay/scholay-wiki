import { Folder, Loader2, type LucideIcon } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

export function HistoryRow({
  label,
  active,
  loading,
  onOpen,
  icon: Icon,
}: {
  label: string;
  active: boolean;
  loading?: boolean;
  onOpen: () => void;
  /** 文件夹行传 Folder;对话历史不传。 */
  icon?: LucideIcon;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title={label}
      className={cn(
        'flex h-8 items-center gap-2 px-4 w-full text-left transition-colors',
        active ? 'bg-surface-2' : 'hover:bg-surface-1',
      )}
    >
      {Icon ? (
        <Icon
          className={cn(
            'size-3.5 shrink-0',
            active ? 'text-foreground' : 'text-faint',
          )}
          strokeWidth={2}
        />
      ) : null}
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-14',
          active ? 'font-medium text-foreground' : 'text-subtle',
          loading && 'italic text-faint',
        )}
      >
        {loading ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="size-3 shrink-0 animate-spin" />
            <span className="truncate">{label}</span>
          </span>
        ) : (
          label
        )}
      </span>
    </button>
  );
}
