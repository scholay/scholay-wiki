import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import {
  BookMarked,
  BookOpen,
  Check,
  FilePenLine,
  Folder,
  Loader2,
  LogIn,
  Pencil,
  Plus,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Sidebar,
  SidebarContent,
  SidebarSection,
  SidebarRailItem,
} from '@/shared/components/sidebar';
import { formatRailCount } from '@/shared/components/sidebar/format-rail-count';
import {
  FolderIconPicker,
  useFolderAppearance,
} from '@/shared/components/folder-appearance';
import { Button } from '@/shared/ui/button';
import { FavoriteBurst } from '@/shared/components/FavoriteBurst';
import { useSidebar } from '@/stores/sidebar.store';
import { useAuthStore } from '@/stores/auth.store';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { useApiToast } from '@/shared/hooks';
import { cn } from '@/shared/lib/utils';
import type { UserLibraryFolderItem } from '@/shared/api/types';
import { STAGING_FOLDER_LABEL } from '@/stores/workspace-folder.store';
import { useStagingView } from '@/features/search/hooks/useStagingView';
import {
  useCreateFolder,
  useDeleteFolder,
  useLibraryFolders,
  useRenameFolder,
} from '../api/folders';
import {
  RESOURCE_SECTIONS,
  collectionsForSection,
  parseResourceSection,
  type ResourceCollection,
  type ResourceSectionId,
} from '../resource-model';

/** URL `?folder=staging` —— 文献集侧栏置顶的暂存区 */
export const LIBRARY_STAGING_FOLDER_PARAM = 'staging';

const SECTION_ICONS: Record<ResourceSectionId, LucideIcon> = {
  papers: BookMarked,
  journals: BookOpen,
  manuscripts: FilePenLine,
  folders: Folder,
};

/**
 * 我的资源侧栏 —— 四分：
 * 文献集 / 期刊集 / 稿件集 / 文件夹
 */
export function LibrarySidebar() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const sidebarExpanded = useSidebar((s) => s.expanded);
  const rail = !sidebarExpanded;
  const token = useAuthStore((s) => s.token);
  const openAuthDialog = useAuthDialog((s) => s.openDialog);
  const apiToast = useApiToast();
  const [treeRef] = useAutoAnimate<HTMLDivElement>({
    duration: 180,
    easing: 'ease-out',
  });
  const sectionRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useLibraryFolders();
  const paperFolders = data?.folders ?? [];
  const { activeArea } = useStagingView();
  const stagingCount = activeArea?.papers.length ?? 0;

  const section = parseResourceSection(params.get('section'));
  const activeFolderParam = params.get('folder') ?? '';
  const stagingActive =
    section === 'papers' && activeFolderParam === LIBRARY_STAGING_FOLDER_PARAM;

  const activePaperFolderId =
    section === 'papers' && !stagingActive && activeFolderParam
      ? Number(activeFolderParam)
      : section === 'papers'
        ? (paperFolders.find((f) => f.is_default)?.id ?? null)
        : null;

  const activeMockCollectionId =
    section !== 'papers' ? activeFolderParam : '';

  const go = (nextSection: ResourceSectionId, folderId: string | number) => {
    navigate({
      pathname: '/library',
      search: `?section=${nextSection}&folder=${folderId}`,
    });
  };

  const MAX_FOLDERS_PER_USER = 50;
  const [creating, setCreating] = useState(false);
  const createMut = useCreateFolder();
  const startCreating = () => {
    if (paperFolders.length >= MAX_FOLDERS_PER_USER) {
      toast.error(`文件夹最多创建 ${MAX_FOLDERS_PER_USER} 个,请删除一些不用的再试`);
      return;
    }
    setCreating(true);
  };
  const handleCreate = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      setCreating(false);
      return;
    }
    if (paperFolders.length >= MAX_FOLDERS_PER_USER) {
      toast.error(`文件夹最多创建 ${MAX_FOLDERS_PER_USER} 个,请删除一些不用的再试`);
      setCreating(false);
      return;
    }
    createMut.mutate(trimmed, {
      onSuccess: (folder) => {
        setCreating(false);
        go('papers', folder.id);
      },
      onError: apiToast.onError(),
    });
  };

  if (!token) {
    return (
      <Sidebar>
        <SidebarContent>
          {rail ? (
            <SidebarSection id="library">
              <div className="px-0.5 pt-1">
                <SidebarRailItem
                  icon={<LogIn strokeWidth={2} />}
                  label="登录 / 注册"
                  onClick={() => openAuthDialog('login')}
                />
              </div>
            </SidebarSection>
          ) : (
            <SidebarSection id="library" label="我的资源">
              <div className="mx-4 my-2 rounded-md border border-border-soft bg-surface-1 px-3 py-3">
                <div className="text-sm leading-relaxed text-subtle">
                  登录后查看文献集、期刊集、稿件集与通用文件夹
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  className="mt-2 h-8 w-full text-xs"
                  onClick={() => openAuthDialog('login')}
                >
                  <LogIn className="size-3" />
                  登录 / 注册
                </Button>
              </div>
            </SidebarSection>
          )}
        </SidebarContent>
      </Sidebar>
    );
  }

  return (
    <Sidebar>
      <SidebarContent>
        <div ref={sectionRef}>
          {/* —— 文献集 —— */}
          <SidebarSection
            id="library-papers"
            label="文献集"
            bordered={false}
            action={
              !rail &&
              !creating && (
                <button
                  type="button"
                  onClick={startCreating}
                  disabled={createMut.isPending}
                  className="inline-flex items-center gap-0.5 text-foreground hover:opacity-70 disabled:opacity-50"
                  title="新建文献集文件夹"
                >
                  <Plus className="size-3" />
                  新建
                </button>
              )
            }
          >
            <div
              ref={treeRef}
              className={cn('flex flex-col', rail && 'gap-0.5 px-0.5 pt-1')}
            >
              {!rail && creating && (
                <NewFolderRow
                  busy={createMut.isPending}
                  onSubmit={handleCreate}
                  onCancel={() => setCreating(false)}
                />
              )}

              <StagingFolderRow
                count={stagingCount}
                active={stagingActive}
                onActivate={() => go('papers', LIBRARY_STAGING_FOLDER_PARAM)}
                rail={rail}
              />

              {!rail && isLoading && paperFolders.length === 0 && (
                <div className="px-4 py-2 text-2xs text-faint">加载中…</div>
              )}
              {paperFolders.map((f) => (
                <PaperFolderRow
                  key={f.id}
                  folder={f}
                  active={
                    section === 'papers' &&
                    !stagingActive &&
                    activePaperFolderId === f.id
                  }
                  onActivate={() => go('papers', f.id)}
                  rail={rail}
                />
              ))}
            </div>
          </SidebarSection>

          {/* —— 期刊集 / 稿件集 / 文件夹 —— */}
          {RESOURCE_SECTIONS.filter((s) => s.id !== 'papers').map((s) => {
            const collections = collectionsForSection(s.id);
            const Icon = SECTION_ICONS[s.id];
            return (
              <SidebarSection
                key={s.id}
                id={`library-${s.id}`}
                label={s.label}
                bordered
              >
                <div
                  className={cn('flex flex-col', rail && 'gap-0.5 px-0.5 pt-1')}
                >
                  {!rail && (
                    <p className="px-4 pb-1 text-[10px] leading-snug text-faint">
                      {s.hint}
                    </p>
                  )}
                  {collections.map((c) => (
                    <MockCollectionRow
                      key={c.id}
                      collection={c}
                      icon={Icon}
                      active={
                        section === s.id && activeMockCollectionId === c.id
                      }
                      onActivate={() => go(s.id, c.id)}
                      rail={rail}
                    />
                  ))}
                </div>
              </SidebarSection>
            );
          })}
        </div>
        <FavoriteBurst anchorRef={sectionRef} />
      </SidebarContent>
    </Sidebar>
  );
}

function StagingFolderRow({
  count,
  active,
  onActivate,
  rail,
}: {
  count: number;
  active: boolean;
  onActivate: () => void;
  rail: boolean;
}) {
  const { Icon, hasColor, iconShellClass, pickerProps } = useFolderAppearance(
    'staging',
    'staging',
  );
  const iconShellActiveClass = cn(
    iconShellClass,
    !hasColor && active && 'text-brand-red',
  );

  const iconPicker = (
    <FolderIconPicker {...pickerProps}>
      <button
        type="button"
        title="更换图标与背景色"
        aria-label={`${STAGING_FOLDER_LABEL} · 更换图标与背景色`}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          rail
            ? cn(
                'inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm [&_svg]:size-3.5',
                hasColor
                  ? iconShellClass
                  : active
                    ? 'text-brand-red'
                    : 'text-muted-foreground',
              )
            : cn(
                iconShellActiveClass,
                'cursor-pointer transition-colors',
                !hasColor && 'hover:bg-surface-2 hover:text-foreground',
              ),
        )}
      >
        <Icon strokeWidth={2} className={rail ? undefined : 'size-3.5'} />
      </button>
    </FolderIconPicker>
  );

  if (rail) {
    return (
      <div
        className={cn(
          'group flex h-8 w-full items-center justify-center gap-1 rounded-sm px-1 transition-colors',
          active ? 'bg-danger-soft' : 'hover:bg-surface-1',
        )}
      >
        {iconPicker}
        <button
          type="button"
          onClick={onActivate}
          title={`${STAGING_FOLDER_LABEL} · ${count}`}
          aria-label={`${STAGING_FOLDER_LABEL}, ${count}`}
          className={cn(
            'inline-flex w-[2ch] shrink-0 cursor-pointer items-center justify-center text-2xs font-semibold tabular-nums leading-none',
            active
              ? 'text-brand-red'
              : 'text-faint group-hover:text-muted-foreground',
          )}
        >
          {formatRailCount(count)}
        </button>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onActivate();
        }
      }}
      className={cn(
        'group relative flex h-8 w-full cursor-pointer items-center gap-2.5 px-4 text-left transition-colors',
        active ? 'bg-danger-soft' : 'hover:bg-surface-1',
      )}
      title="检索工作区的临时文献篮"
    >
      {iconPicker}
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-base',
          active ? 'font-bold text-foreground' : 'text-subtle',
        )}
      >
        {STAGING_FOLDER_LABEL}
      </span>
      <span
        className={cn(
          'text-xs tabular-nums',
          active ? 'font-bold text-muted-foreground' : 'text-faint',
        )}
      >
        {count.toLocaleString()}
      </span>
    </div>
  );
}

function MockCollectionRow({
  collection,
  icon: Icon,
  active,
  onActivate,
  rail,
}: {
  collection: ResourceCollection;
  icon: LucideIcon;
  active: boolean;
  onActivate: () => void;
  rail: boolean;
}) {
  if (rail) {
    return (
      <SidebarRailItem
        icon={<Icon strokeWidth={2} />}
        count={collection.itemCount}
        label={collection.name}
        active={active}
        tone={active ? 'danger' : 'default'}
        onClick={onActivate}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={onActivate}
      title={collection.description ?? collection.name}
      className={cn(
        'group relative flex h-8 w-full items-center gap-2.5 px-4 text-left transition-colors',
        active ? 'bg-danger-soft' : 'hover:bg-surface-1',
      )}
    >
      <Icon
        className={cn(
          'size-3.5 shrink-0',
          active ? 'text-foreground' : 'text-muted-foreground',
        )}
        strokeWidth={2}
      />
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-base',
          active ? 'font-bold text-foreground' : 'text-subtle',
        )}
      >
        {collection.name}
      </span>
      <span
        className={cn(
          'text-xs tabular-nums',
          active ? 'font-bold text-muted-foreground' : 'text-faint',
        )}
      >
        {collection.itemCount.toLocaleString()}
      </span>
    </button>
  );
}

interface PaperFolderRowProps {
  folder: UserLibraryFolderItem;
  active: boolean;
  onActivate: () => void;
  rail?: boolean;
}

function PaperFolderRow({
  folder,
  active,
  onActivate,
  rail = false,
}: PaperFolderRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(folder.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const renameMut = useRenameFolder();
  const deleteMut = useDeleteFolder();
  const apiToast = useApiToast();
  const { Icon, hasColor, iconShellClass, pickerProps } = useFolderAppearance(
    folder.id,
    'folder',
  );
  const iconShellActiveClass = cn(
    iconShellClass,
    !hasColor && active && 'text-foreground',
  );

  const iconPicker = (
    <FolderIconPicker {...pickerProps}>
      <button
        type="button"
        title="更换图标与背景色"
        aria-label={`${folder.name} · 更换图标与背景色`}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          rail
            ? cn(
                'inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm [&_svg]:size-3.5',
                hasColor
                  ? iconShellClass
                  : active
                    ? 'text-foreground'
                    : 'text-muted-foreground',
              )
            : cn(
                iconShellActiveClass,
                'cursor-pointer transition-colors',
                !hasColor && 'hover:bg-surface-2 hover:text-foreground',
              ),
        )}
      >
        <Icon strokeWidth={2} className={rail ? undefined : 'size-3.5'} />
      </button>
    </FolderIconPicker>
  );

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);
  useEffect(() => {
    if (!editing) setDraft(folder.name);
  }, [folder.name, editing]);

  const commitRename = () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === folder.name) {
      setEditing(false);
      setDraft(folder.name);
      return;
    }
    renameMut.mutate(
      { id: folder.id, name: trimmed },
      {
        onSuccess: () => setEditing(false),
        onError: (err) => {
          apiToast.show(err);
          setDraft(folder.name);
          setEditing(false);
        },
      },
    );
  };
  const confirmDelete = () => {
    deleteMut.mutate(folder.id, {
      onSuccess: () => toast.success(`已删除「${folder.name}」`),
      onError: apiToast.onError(),
    });
  };

  if (rail) {
    return (
      <div
        className={cn(
          'group flex h-8 w-full items-center justify-center gap-1 rounded-sm px-1 transition-colors',
          active ? 'bg-danger-soft' : 'hover:bg-surface-1',
        )}
      >
        {iconPicker}
        <button
          type="button"
          onClick={onActivate}
          title={`${folder.name} · ${folder.paper_count}`}
          aria-label={`${folder.name}, ${folder.paper_count}`}
          className={cn(
            'inline-flex w-[2ch] shrink-0 cursor-pointer items-center justify-center text-2xs font-semibold tabular-nums leading-none',
            active
              ? 'text-brand-red'
              : 'text-faint group-hover:text-muted-foreground',
          )}
        >
          {formatRailCount(folder.paper_count)}
        </button>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="flex h-8 items-center gap-1.5 px-4">
        <span className={iconShellClass} aria-hidden>
          <Icon className="size-3.5" strokeWidth={2} />
        </span>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={32}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename();
            else if (e.key === 'Escape') {
              setEditing(false);
              setDraft(folder.name);
            }
          }}
          onBlur={commitRename}
          disabled={renameMut.isPending}
          className="h-6 flex-1 rounded-sm border border-border bg-background px-1.5 text-xs outline-none focus:border-brand-red"
        />
        {renameMut.isPending && (
          <Loader2 className="size-3 animate-spin text-muted-foreground" />
        )}
      </div>
    );
  }

  if (confirmingDelete) {
    return (
      <div className="flex h-8 items-center gap-1.5 bg-danger-soft px-4">
        <span className="flex-1 truncate text-2xs font-bold text-brand-red">
          删除「{folder.name}」?
        </span>
        <button
          type="button"
          onClick={confirmDelete}
          disabled={deleteMut.isPending}
          className="inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-sm bg-brand-red text-white hover:bg-brand-red/90"
          title="确认(内含论文回默认文件夹)"
        >
          {deleteMut.isPending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Check className="size-3" strokeWidth={3} />
          )}
        </button>
        <button
          type="button"
          onClick={() => setConfirmingDelete(false)}
          className="inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-surface-2"
          title="取消"
        >
          <X className="size-3" />
        </button>
      </div>
    );
  }

  const locked = folder.is_default;

  return (
    <div
      onClick={onActivate}
      onDoubleClick={
        locked
          ? undefined
          : (e) => {
              e.stopPropagation();
              setEditing(true);
            }
      }
      className={cn(
        'group relative flex h-8 cursor-pointer items-center gap-2.5 px-4 transition-colors',
        active ? 'bg-danger-soft' : 'hover:bg-surface-1',
      )}
    >
      {iconPicker}
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-base',
          active ? 'font-bold text-foreground' : 'text-subtle',
        )}
        title={locked ? '系统默认文件夹(不可改名 / 不可删除)' : folder.name}
      >
        {folder.name}
      </span>

      <span
        className={cn(
          'text-xs tabular-nums transition-opacity',
          active ? 'font-bold text-muted-foreground' : 'text-faint',
          !locked && 'group-hover:opacity-0',
        )}
      >
        {folder.paper_count.toLocaleString()}
      </span>

      {!locked && (
        <div className="absolute right-2 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
            className="inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            title="重命名"
          >
            <Pencil className="size-3" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setConfirmingDelete(true);
            }}
            className="inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-danger-soft hover:text-brand-red"
            title="删除"
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      )}
    </div>
  );
}

function NewFolderRow({
  busy,
  onSubmit,
  onCancel,
}: {
  busy: boolean;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  return (
    <div className="flex h-8 items-center gap-1.5 px-4">
      <Folder className="size-3.5 shrink-0 text-muted-foreground" />
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        maxLength={32}
        placeholder="文献集名称"
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit(draft);
          else if (e.key === 'Escape') onCancel();
        }}
        onBlur={() => onSubmit(draft)}
        disabled={busy}
        className="h-6 flex-1 rounded-sm border border-border bg-background px-1.5 text-xs outline-none focus:border-brand-red"
      />
      {busy && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
    </div>
  );
}
