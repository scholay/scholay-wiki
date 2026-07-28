import { memo, useEffect, useMemo } from 'react';
import { ChevronDown, FolderOpen } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useIsAuthenticated } from '@/stores/auth.store';
import {
  STAGING_FOLDER_LABEL,
  useWorkspaceFolderUi,
  type WorkspaceFolderTab,
} from '@/stores/workspace-folder.store';
import { useLibraryFoldersSummary } from '../api/library';
import { useStagingView } from '../hooks/useStagingView';

interface StagingTabsProps {
  /** tabs = 横向标签(遗留); select = 下拉选框(矩阵 / 图谱等窄列) */
  variant?: 'tabs' | 'select';
}

/**
 * 工作区文件夹切换 —— 第一个为「暂存」(临时工作区),其后为文献集文件夹。
 * 侧栏用 WorkspaceFolderTree;矩阵表头等窄区域用 variant="select"。
 */
export function StagingTabs({ variant = 'select' }: StagingTabsProps) {
  const authenticated = useIsAuthenticated();
  const activeTab = useWorkspaceFolderUi((s) => s.activeTab);
  const setActiveTab = useWorkspaceFolderUi((s) => s.setActiveTab);
  const { activeArea } = useStagingView();
  const foldersQ = useLibraryFoldersSummary();
  const folders = foldersQ.data?.folders ?? [];

  const stagingCount = activeArea?.papers.length ?? 0;

  useEffect(() => {
    if (typeof activeTab !== 'number') return;
    if (foldersQ.isLoading) return;
    if (folders.length === 0) return;
    if (!folders.some((f) => f.id === activeTab)) {
      setActiveTab('staging');
    }
  }, [activeTab, folders, foldersQ.isLoading, setActiveTab]);

  const selectValue =
    activeTab === 'staging' ? 'staging' : String(activeTab);

  const options = useMemo(() => {
    const items: { value: string; label: string }[] = [
      {
        value: 'staging',
        label: `${STAGING_FOLDER_LABEL} (${stagingCount})`,
      },
    ];
    for (const folder of folders) {
      items.push({
        value: String(folder.id),
        label: `${folder.name} (${folder.paper_count})`,
      });
    }
    return items;
  }, [folders, stagingCount]);

  if (variant === 'select') {
    return (
      <div className="relative flex h-9 min-w-0 items-center px-2">
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
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
          {authenticated && foldersQ.isLoading && folders.length === 0 && (
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
    <div
      className="flex h-9 min-w-0 items-center gap-1 border-b border-border bg-background px-2 shrink-0"
      role="tablist"
      aria-label="工作区文件夹"
    >
      <FolderTabItem
        label={STAGING_FOLDER_LABEL}
        count={stagingCount}
        active={activeTab === 'staging'}
        onActivate={() => setActiveTab('staging')}
        variant="staging"
      />

      {authenticated &&
        folders.map((folder) => (
          <FolderTabItem
            key={folder.id}
            label={folder.name}
            count={folder.paper_count}
            active={activeTab === folder.id}
            onActivate={() => setActiveTab(folder.id)}
            variant="folder"
          />
        ))}

      {authenticated && foldersQ.isLoading && folders.length === 0 && (
        <span className="shrink-0 px-1 text-2xs text-faint">加载…</span>
      )}
    </div>
  );
}

interface FolderTabItemProps {
  label: string;
  count: number;
  active: boolean;
  onActivate: () => void;
  variant: 'staging' | 'folder';
}

const FolderTabItem = memo(function FolderTabItem({
  label,
  count,
  active,
  onActivate,
  variant,
}: FolderTabItemProps) {
  return (
    <div
      role="tab"
      aria-selected={active}
      onClick={onActivate}
      className={cn(
        'group relative flex h-full min-w-0 flex-1 basis-0 items-center gap-1 px-1.5 cursor-pointer transition-colors',
        active ? 'text-foreground' : 'text-muted-foreground hover:text-subtle',
      )}
      title={label}
    >
      {variant === 'folder' && (
        <FolderOpen className="size-3 shrink-0 text-faint" strokeWidth={2.25} />
      )}
      <span
        className={cn(
          'truncate text-sm',
          active ? 'font-bold' : 'font-semibold',
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          'inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-pill text-2xs font-bold shrink-0 tabular-nums',
          active
            ? 'bg-brand-red text-white'
            : 'bg-surface-2 text-muted-foreground',
        )}
      >
        {count}
      </span>
      {active && (
        <span
          aria-hidden
          className="absolute left-2 right-2 -bottom-px h-[2px] bg-brand-red rounded-full"
        />
      )}
    </div>
  );
});

export type { WorkspaceFolderTab };
