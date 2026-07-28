import { memo, useEffect } from 'react';
import { Folder, Inbox } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useIsAuthenticated } from '@/stores/auth.store';
import {
  STAGING_FOLDER_LABEL,
  useWorkspaceFolderUi,
  type WorkspaceFolderTab,
} from '@/stores/workspace-folder.store';
import { useLibraryFoldersSummary } from '../../api/library';
import { useStagingView } from '../../hooks/useStagingView';

interface FolderTreeRowProps {
  label: string;
  count: number;
  active: boolean;
  onActivate: () => void;
  icon: 'staging' | 'folder';
}

const FolderTreeRow = memo(function FolderTreeRow({
  label,
  count,
  active,
  onActivate,
  icon,
}: FolderTreeRowProps) {
  const Icon = icon === 'staging' ? Inbox : Folder;
  return (
    <button
      type="button"
      onClick={onActivate}
      title={label}
      className={cn(
        'group flex w-full items-center gap-2.5 px-4 h-8 text-left transition-colors',
        active ? 'bg-danger-soft' : 'hover:bg-surface-1',
      )}
    >
      <Icon
        className={cn(
          'size-3.5 shrink-0',
          active ? 'text-foreground' : 'text-muted-foreground',
        )}
      />
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-base',
          active ? 'font-bold text-foreground' : 'text-subtle',
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          'shrink-0 text-2xs tabular-nums',
          active ? 'font-bold text-muted-foreground' : 'text-faint',
        )}
      >
        {count.toLocaleString()}
      </span>
    </button>
  );
});

/** 工作区文件夹树 —— 纵向列表(对照 LibrarySidebar FolderRow / 原 LibrarySection) */
export function WorkspaceFolderTree() {
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

  return (
    <nav className="flex flex-col" aria-label="工作区文件夹">
      <FolderTreeRow
        label={STAGING_FOLDER_LABEL}
        count={stagingCount}
        active={activeTab === 'staging'}
        onActivate={() => setActiveTab('staging')}
        icon="staging"
      />

      {authenticated && foldersQ.isLoading && folders.length === 0 && (
        <div className="px-4 py-2 text-2xs text-faint">加载中…</div>
      )}

      {authenticated &&
        folders.map((folder) => (
          <FolderTreeRow
            key={folder.id}
            label={folder.name}
            count={folder.paper_count}
            active={activeTab === folder.id}
            onActivate={() => setActiveTab(folder.id)}
            icon="folder"
          />
        ))}

      {authenticated && !foldersQ.isLoading && folders.length === 0 && (
        <div className="px-4 py-2 text-2xs text-faint">还没有文献集文件夹</div>
      )}
    </nav>
  );
}

export type { WorkspaceFolderTab };
