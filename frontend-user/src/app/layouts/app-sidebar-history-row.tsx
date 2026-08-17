import { Folder, Loader2, type LucideIcon } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

/** L3 under the current-feature heading (L1=16, L2=38). */
export const HISTORY_ROW_INSET = 'pl-12 pr-4';

export function HistoryHint({ children }: { children: string }) {
  return (
    <div className={cn(HISTORY_ROW_INSET, 'py-3 text-12 text-faint')}>
      {children}
    </div>
  );
}

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
        'flex h-8 items-center gap-2 w-full text-left transition-colors',
        HISTORY_ROW_INSET,
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
