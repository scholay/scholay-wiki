import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Pencil, Pin } from 'lucide-react';
import { SidebarSection } from '@/shared/components/sidebar';
import {
  FolderAppearanceFields,
  useFolderAppearance,
} from '@/shared/components/folder-appearance';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/ui/popover';
import { useAuthStore } from '@/stores/auth.store';
import {
  libraryFolderMetaKey,
  sortLibraryFolders,
  useLibraryFolderMeta,
} from '@/stores/library-folder-meta.store';
import { useLibraryFolders, useRenameFolder } from '@/features/library/api/folders';
import {
  collectionsForSection,
  type ResourceSectionId,
} from '@/features/library/resource-model';
import { useApiToast } from '@/shared/hooks';
import { cn } from '@/shared/lib/utils';

/**
 * 我的资源下段:文献集 / 期刊集 / 稿件集 / 资源集各自列出对应文件夹。
 * Hub(`/library` 无 section)不挂本段。
 */
export function LibraryFolderHistory() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const token = useAuthStore((s) => s.token);
  const section = librarySectionFromSearch(search);
  const { data, isLoading } = useLibraryFolders();
  const paperFolders = data?.folders ?? [];
  const folderParam = new URLSearchParams(search).get('folder') ?? '';
  const aliases = useLibraryFolderMeta((s) => s.aliases);
  const pinned = useLibraryFolderMeta((s) => s.pinned);

  if (!section) return null;

  const rawRows =
    section === 'papers'
      ? paperFolders.map((f) => ({
          id: String(f.id),
          label: f.name,
          paperId: f.id,
          canPatchName: !f.is_default,
        }))
      : collectionsForSection(section).map((c) => ({
          id: c.id,
          label: c.name,
          paperId: null as number | null,
          canPatchName: false,
        }));

  const rows = sortLibraryFolders(
    rawRows.map((row) => {
      const metaKey = libraryFolderMetaKey(section, row.id);
      return {
        ...row,
        metaKey,
        label: aliases[metaKey] || row.label,
      };
    }),
    pinned,
  );

  const defaultPaperId = paperFolders.find((f) => f.is_default)?.id;
  const activeId =
    section === 'papers' && !folderParam && defaultPaperId
      ? String(defaultPaperId)
      : folderParam;

  return (
    <SidebarSection id="recent-sessions" label="文件夹" bordered>
      {!token ? (
        <div className="px-4 py-3 text-12 text-faint">登录后可见文件夹</div>
      ) : section === 'papers' && isLoading ? (
        <div className="px-4 py-3 text-12 text-faint">加载中…</div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-3 text-12 text-faint">还没有文件夹</div>
      ) : (
        rows.map((row) => (
          <LibraryFolderRow
            key={row.metaKey}
            metaKey={row.metaKey}
            appearanceKey={row.id}
            label={row.label}
            paperId={row.paperId}
            canPatchName={row.canPatchName}
            active={row.id === activeId}
            onOpen={() =>
              navigate(`/library?section=${section}&folder=${row.id}`)
            }
          />
        ))
      )}
    </SidebarSection>
  );
}

function LibraryFolderRow({
  metaKey,
  appearanceKey,
  label,
  paperId,
  canPatchName,
  active,
  onOpen,
}: {
  metaKey: string;
  appearanceKey: string;
  label: string;
  paperId: number | null;
  canPatchName: boolean;
  active: boolean;
  onOpen: () => void;
}) {
  const { Icon, hasColor, iconShellClass, pickerProps } = useFolderAppearance(
    appearanceKey,
    'folder',
  );
  const pinned = useLibraryFolderMeta((s) => s.pinned.includes(metaKey));
  const togglePin = useLibraryFolderMeta((s) => s.togglePin);
  const setAlias = useLibraryFolderMeta((s) => s.setAlias);
  const renameMut = useRenameFolder();
  const apiToast = useApiToast();
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editOpen) setDraft(label);
  }, [label, editOpen]);

  useEffect(() => {
    if (editOpen) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editOpen]);

  const commitName = () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === label) return;
    setAlias(metaKey, trimmed);
    if (canPatchName && paperId != null) {
      renameMut.mutate(
        { id: paperId, name: trimmed },
        { onError: apiToast.onError() },
      );
    }
  };

  return (
    <div
      className={cn(
        'group relative flex h-8 w-full items-center gap-2 px-4 transition-colors',
        active ? 'bg-surface-2' : 'hover:bg-surface-1',
      )}
    >
      <span
        className={cn(
          iconShellClass,
          'size-5',
          !hasColor && (active ? 'text-foreground' : 'text-faint'),
        )}
        aria-hidden
      >
        <Icon className="size-3.5" strokeWidth={2} />
      </span>
      <button
        type="button"
        onClick={onOpen}
        title={label}
        className={cn(
          'min-w-0 flex-1 truncate text-left text-14',
          active ? 'font-medium text-foreground' : 'text-subtle',
        )}
      >
        {label}
      </button>

      <Popover open={editOpen} onOpenChange={setEditOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            title="编辑文件夹"
            aria-label={`编辑「${label}」`}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'inline-flex size-6 shrink-0 items-center justify-center rounded-4 text-faint hover:bg-surface-3 hover:text-foreground',
              editOpen && 'text-foreground',
            )}
          >
            <Pencil className="size-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="right"
          align="start"
          sideOffset={8}
          className="w-[220px] p-2"
          onClick={(e) => e.stopPropagation()}
        >
          <label className="mb-1.5 block px-1 text-12 text-faint">名称</label>
          <input
            ref={inputRef}
            value={draft}
            maxLength={32}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commitName();
                setEditOpen(false);
              } else if (e.key === 'Escape') {
                setDraft(label);
                setEditOpen(false);
              }
            }}
            className="mb-2.5 h-8 w-full rounded-8 border border-border bg-background px-2 text-14 outline-none focus:border-foreground"
          />
          <FolderAppearanceFields
            iconId={pickerProps.value}
            onIconChange={pickerProps.onChange}
            colorId={pickerProps.colorValue}
            onColorChange={pickerProps.onColorChange}
          />
        </PopoverContent>
      </Popover>

      <button
        type="button"
        title={pinned ? '取消置顶' : '置顶'}
        aria-label={pinned ? `取消置顶「${label}」` : `置顶「${label}」`}
        aria-pressed={pinned}
        onClick={(e) => {
          e.stopPropagation();
          togglePin(metaKey);
        }}
        className={cn(
          'inline-flex size-6 shrink-0 items-center justify-center rounded-4 text-faint transition-opacity hover:bg-surface-3 hover:text-foreground',
          pinned
            ? 'opacity-100 text-foreground'
            : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
        )}
      >
        <Pin className={cn('size-3.5', pinned && 'fill-current')} />
      </button>
    </div>
  );
}

function librarySectionFromSearch(search: string): ResourceSectionId | null {
  const raw = new URLSearchParams(search).get('section');
  if (
    raw === 'papers' ||
    raw === 'journals' ||
    raw === 'manuscripts' ||
    raw === 'folders'
  ) {
    return raw;
  }
  return null;
}
