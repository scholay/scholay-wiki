import { useEffect, useMemo } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useFolderAppearance } from '@/shared/components/folder-appearance';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { useIsAuthenticated } from '@/stores/auth.store';
import {
  STAGING_FOLDER_LABEL,
  useWorkspaceFolderUi,
  type WorkspaceFolderTab,
} from '@/stores/workspace-folder.store';
import { useLibraryFoldersSummary } from '../api/library';
import { useStagingView } from '../hooks/useStagingView';

interface StagingTabsProps {
  /** tabs = 当前文件夹 + 下拉切换; select = 原生下拉(侧栏旧入口) */
  variant?: 'tabs' | 'select';
  className?: string;
}

type FolderItem = {
  key: WorkspaceFolderTab;
  label: string;
  fallback: 'staging' | 'folder';
};

function useWorkspaceFolderItems() {
  const authenticated = useIsAuthenticated();
  const activeTab = useWorkspaceFolderUi((s) => s.activeTab);
  const setActiveTab = useWorkspaceFolderUi((s) => s.setActiveTab);
  const foldersQ = useLibraryFoldersSummary();
  const folders = foldersQ.data?.folders ?? [];

  useEffect(() => {
    if (typeof activeTab !== 'number') return;
    if (foldersQ.isLoading) return;
    if (folders.length === 0) return;
    if (!folders.some((f) => f.id === activeTab)) {
      setActiveTab('staging');
    }
  }, [activeTab, folders, foldersQ.isLoading, setActiveTab]);

  const items = useMemo<FolderItem[]>(() => {
    const next: FolderItem[] = [
      {
        key: 'staging',
        label: STAGING_FOLDER_LABEL,
        fallback: 'staging',
      },
    ];
    if (authenticated) {
      for (const folder of folders) {
        next.push({
          key: folder.id,
          label: folder.name,
          fallback: 'folder',
        });
      }
    }
    return next;
  }, [authenticated, folders]);

  const activeItem =
    items.find((item) => item.key === activeTab) ?? items[0]!;
  const loading =
    authenticated && foldersQ.isLoading && folders.length === 0;

  return { items, activeItem, setActiveTab, folders, loading };
}

/**
 * 工作区文件夹切换 —— 第一个为「当前对话」,其后为文献集文件夹。
 */
export function StagingTabs({
  variant = 'select',
  className,
}: StagingTabsProps) {
  const { activeArea } = useStagingView();
  const { items, activeItem, setActiveTab, folders, loading } =
    useWorkspaceFolderItems();
  const stagingCount = activeArea?.papers.length ?? 0;

  if (variant === 'select') {
    const selectValue =
      activeItem.key === 'staging' ? 'staging' : String(activeItem.key);
    return (
      <div
        className={cn(
          'relative flex h-full min-w-0 items-center px-2',
          className,
        )}
      >
        <select
          value={selectValue}
          onChange={(e) => {
            const next = e.target.value;
            setActiveTab(
              next === 'staging' ? 'staging' : Number.parseInt(next, 10),
            );
          }}
          aria-label="工作区文件夹"
          className={cn(
            'h-7 w-full min-w-0 appearance-none truncate rounded-sm border border-border bg-background',
            'pl-2 pr-7 text-xs font-semibold text-foreground outline-none',
            'transition-colors hover:border-border-strong focus:border-foreground focus:ring-2 focus:ring-ring/20',
          )}
        >
          <option value="staging">
            {STAGING_FOLDER_LABEL} ({stagingCount})
          </option>
          {folders.map((folder) => (
            <option key={folder.id} value={String(folder.id)}>
              {folder.name} ({folder.paper_count})
            </option>
          ))}
          {loading && (
            <option value="staging" disabled>
              加载文件夹…
            </option>
          )}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-4 top-1/2 size-3.5 -translate-y-1/2 text-faint"
          aria-hidden
        />
      </div>
    );
  }

  return (
    <WorkspaceFolderPicker
      className={cn('justify-center px-2', className)}
    />
  );
}

/** Compact folder switch for the file-column function bar. */
export function WorkspaceFolderPicker({ className }: { className?: string }) {
  const { items, activeItem, setActiveTab, loading } =
    useWorkspaceFolderItems();
  const { Icon, iconShellClass } = useFolderAppearance(
    activeItem.key,
    activeItem.fallback,
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="切换文件夹"
          aria-label={`当前文件夹 ${activeItem.label}`}
          className={cn(
            'inline-flex h-7 min-w-0 max-w-[9.5rem] shrink items-center gap-1 rounded-sm px-1.5',
            'text-muted-foreground transition-colors duration-base ease-emphasized',
            'hover:bg-background hover:text-foreground',
            className,
          )}
        >
          <span className={cn(iconShellClass, 'size-5')} aria-hidden>
            <Icon className="size-3.5" strokeWidth={2} />
          </span>
          <span className="min-w-0 truncate text-12 font-semibold text-foreground">
            {activeItem.label}
          </span>
          <ChevronDown className="size-3.5 shrink-0" strokeWidth={2.25} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        {items.map((item) => (
          <FolderMenuItem
            key={String(item.key)}
            item={item}
            active={item.key === activeItem.key}
            onSelect={() => setActiveTab(item.key)}
          />
        ))}
        {loading ? (
          <DropdownMenuItem disabled>加载文件夹…</DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FolderMenuItem({
  item,
  active,
  onSelect,
}: {
  item: FolderItem;
  active: boolean;
  onSelect: () => void;
}) {
  const { Icon, iconShellClass } = useFolderAppearance(
    item.key,
    item.fallback,
  );
  return (
    <DropdownMenuItem onSelect={onSelect}>
      <span className={cn(iconShellClass, 'size-5')} aria-hidden>
        <Icon className="size-3.5" strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {active ? <Check className="size-3.5 text-foreground" /> : null}
    </DropdownMenuItem>
  );
}
