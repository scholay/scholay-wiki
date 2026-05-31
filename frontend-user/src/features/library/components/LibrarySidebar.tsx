import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import {
  Check,
  Folder,
  Loader2,
  LogIn,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Sidebar,
  SidebarContent,
  SidebarHeaderNav,
  SidebarSection,
  SidebarAuthFooter,
  SidebarCollapseButton,
} from '@/shared/components/sidebar';
import { Button } from '@/shared/ui/button';
import { FavoriteBurst } from '@/shared/components/FavoriteBurst';
import { useSidebar } from '@/stores/sidebar.store';
import { useAuthStore } from '@/stores/auth.store';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { useApiToast } from '@/shared/hooks';
import { cn } from '@/shared/lib/utils';
import type { UserLibraryFolderItem } from '@/shared/api/types';
import {
  useCreateFolder,
  useDeleteFolder,
  useLibraryFolders,
  useRenameFolder,
} from '../api/folders';

/**
 * 文献集侧栏 —— **单层文件夹列表**(对照 .pen `Uls2s` 中"我的文件夹"段):
 *
 *   我的文件夹            + 新建
 *   📁 默认文件夹          12         (active:淡红粉底 + 名字加粗)
 *   📁 LLM 综述            15
 *   📁 Agent 综述           9
 *
 * - 文件夹只有这一层,**不展开** —— 论文在右侧 mainArea 显示
 * - 选中态走 URL `?folder=<id>`;无 query 时由 LibraryPage 自动选默认文件夹
 * - 普通文件夹 hover 露 ✎ 重命名 + 🗑 删除;双击 inline rename
 * - 系统默认文件夹(is_default)锁定:无 ✎/🗑,无双击改名
 */
export function LibrarySidebar() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const toggleSidebar = useSidebar((s) => s.toggle);
  const token = useAuthStore((s) => s.token);
  const openAuthDialog = useAuthDialog((s) => s.openDialog);
  const apiToast = useApiToast();
  // autoAnimate 只跟踪 folder 增删(新建/删除)的进出动画,无展开/折叠抖动场景
  const [treeRef] = useAutoAnimate<HTMLDivElement>({
    duration: 180,
    easing: 'ease-out',
  });
  // FavoriteBurst 锚点 —— +1 浮起动画用 portal 渲染到 body,锚到 section 屏幕坐标
  const sectionRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useLibraryFolders();
  const folders = data?.folders ?? [];

  const activeFolderParam = params.get('folder') ?? '';
  // 没有 ?folder 时(LibraryPage 内 fallback 到默认文件夹),sidebar 也高亮默认文件夹
  const activeId = activeFolderParam
    ? Number(activeFolderParam)
    : (folders.find((f) => f.is_default)?.id ?? null);

  const setActive = (folderId: number) => {
    // 切文件夹时丢掉 q/page/sort/size 等其他参数 —— 否则上一个文件夹的搜索词 /
    // 翻页会被带到新文件夹,新视图打开就是错的页码 + 错的过滤条件。
    navigate({ pathname: '/library', search: `?folder=${folderId}` });
  };

  // 创建文件夹
  //
  // 风控:每用户最多 MAX_FOLDERS_PER_USER 个文件夹。后端是硬约束(返 409),
  // 前端在用户点击新建之前先拦一下,避免无效请求 + 给出立即反馈。
  // 不在 UI 上显示"最多 N 个"提示语;只有触达上限才弹 toast。
  const MAX_FOLDERS_PER_USER = 50;
  const [creating, setCreating] = useState(false);
  const createMut = useCreateFolder();
  const startCreating = () => {
    if (folders.length >= MAX_FOLDERS_PER_USER) {
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
    // 二次校验 —— 用户在 creating 态期间可能另开 tab 又建了一个
    if (folders.length >= MAX_FOLDERS_PER_USER) {
      toast.error(`文件夹最多创建 ${MAX_FOLDERS_PER_USER} 个,请删除一些不用的再试`);
      setCreating(false);
      return;
    }
    createMut.mutate(trimmed, {
      onSuccess: (folder) => {
        setCreating(false);
        setActive(folder.id);
      },
      onError: apiToast.onError(),
    });
  };

  // 未登录:不展示"我的文件夹 + 新建"(对未登录用户没意义),改成
  // 一个登录引导卡 —— 视觉与 SearchSidebar 未登录态的 LibrarySection 一致
  if (!token) {
    return (
      <Sidebar>
        <SidebarHeaderNav />
        <SidebarContent>
          <SidebarSection id="library" label="我的文献集">
            <div className="mx-4 my-2 px-3 py-3 rounded-md bg-surface-1 border border-border-soft">
              <div className="text-sm text-subtle leading-relaxed">
                登录后查看你的文献集,所有收藏云端同步
              </div>
              <Button
                size="sm"
                variant="primary"
                className="mt-2 w-full h-8 text-xs"
                onClick={() => openAuthDialog('login')}
              >
                <LogIn className="size-3" />
                登录 / 注册
              </Button>
            </div>
          </SidebarSection>
        </SidebarContent>
        <SidebarAuthFooter />
        <SidebarCollapseButton onClick={toggleSidebar} />
      </Sidebar>
    );
  }

  return (
    <Sidebar>
      <SidebarHeaderNav />

      <SidebarContent>
        {/* 锚点 + FavoriteBurst —— 收藏成功 "+1" 浮起。
            走 Portal + position:fixed,完全跳出 ScrollArea overflow:hidden 的裁剪 */}
        <div ref={sectionRef}>
        <SidebarSection
          id="library"
          label="我的文件夹"
          action={
            !creating && (
              <button
                type="button"
                onClick={startCreating}
                disabled={createMut.isPending}
                className="inline-flex items-center gap-0.5 text-foreground hover:opacity-70 disabled:opacity-50"
                title="新建文件夹"
              >
                <Plus className="size-3" />
                新建
              </button>
            )
          }
        >
          <div ref={treeRef} className="flex flex-col">
            {creating && (
              <NewFolderRow
                busy={createMut.isPending}
                onSubmit={handleCreate}
                onCancel={() => setCreating(false)}
              />
            )}

            {isLoading && folders.length === 0 && (
              <div className="px-4 py-2 text-2xs text-faint">加载中…</div>
            )}
            {!isLoading && folders.length === 0 && !creating && (
              <div className="px-4 py-2 text-2xs text-faint">
                还没有文件夹 · 点击「新建」开始
              </div>
            )}
            {folders.map((f) => (
              <FolderRow
                key={f.id}
                folder={f}
                active={activeId === f.id}
                onActivate={() => setActive(f.id)}
              />
            ))}
          </div>
        </SidebarSection>
        </div>
        <FavoriteBurst anchorRef={sectionRef} />
      </SidebarContent>

      <SidebarAuthFooter />
      <SidebarCollapseButton onClick={toggleSidebar} />
    </Sidebar>
  );
}

// ============================================================================
// 文件夹单行 —— 对照 .pen `MZ0Ma`(active) / `t6u6Oj`(普通)
//   普通:h-30 px-4 gap-2.5,文件夹名 13/normal/#444,数量 11/#999
//   active:bg-danger-soft(#FFF7F7),文件夹名 13/bold/#111,数量 11/bold/#666
//   去掉 ▾/▸ chevron(用户要求"不做展开收起")
// ============================================================================

interface FolderRowProps {
  folder: UserLibraryFolderItem;
  active: boolean;
  onActivate: () => void;
}

function FolderRow({
  folder,
  active,
  onActivate,
}: FolderRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(folder.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const renameMut = useRenameFolder();
  const deleteMut = useDeleteFolder();
  const apiToast = useApiToast();

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
      }
    );
  };
  const confirmDelete = () => {
    deleteMut.mutate(folder.id, {
      onSuccess: () => toast.success(`已删除「${folder.name}」`),
      onError: apiToast.onError(),
    });
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 px-4 h-8">
        <Folder className="size-3.5 text-muted-foreground shrink-0" />
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
          className="flex-1 h-6 bg-background border border-border rounded-sm px-1.5 text-xs outline-none focus:border-brand-red"
        />
        {renameMut.isPending && (
          <Loader2 className="size-3 animate-spin text-muted-foreground" />
        )}
      </div>
    );
  }

  if (confirmingDelete) {
    return (
      <div className="flex items-center gap-1.5 px-4 h-8 bg-danger-soft">
        <span className="flex-1 text-2xs text-brand-red font-bold truncate">
          删除「{folder.name}」?
        </span>
        <button
          type="button"
          onClick={confirmDelete}
          disabled={deleteMut.isPending}
          className="inline-flex h-5 w-5 items-center justify-center rounded-sm bg-brand-red text-white hover:bg-brand-red/90"
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
          className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-surface-2"
          title="取消"
        >
          <X className="size-3" />
        </button>
      </div>
    );
  }

  // 系统默认文件夹:UI 上锁定 —— 不可双击改名,不显示 ✎/🗑
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
        'group relative flex items-center gap-2.5 px-4 h-8 cursor-pointer transition-colors',
        // active 态对照 .pen MZ0Ma:bg-danger-soft + 字加粗;非 active hover 用浅灰
        active ? 'bg-danger-soft' : 'hover:bg-surface-1'
      )}
    >
      <Folder
        className={cn(
          'size-3.5 shrink-0',
          active ? 'text-foreground' : 'text-muted-foreground'
        )}
      />
      <span
        className={cn(
          'flex-1 min-w-0 truncate text-base',
          active ? 'text-foreground font-bold' : 'text-subtle'
        )}
        title={locked ? '系统默认文件夹(不可改名 / 不可删除)' : folder.name}
      >
        {folder.name}
      </span>

      <span
        className={cn(
          'text-xs tabular-nums transition-opacity',
          active ? 'text-muted-foreground font-bold' : 'text-faint',
          !locked && 'group-hover:opacity-0'
        )}
      >
        {folder.paper_count.toLocaleString()}
      </span>

      {!locked && (
        <div className="absolute right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
            className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground"
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
            className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-danger-soft hover:text-brand-red"
            title="删除"
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 新建文件夹的 inline 行
// ============================================================================

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
    <div className="flex items-center gap-1.5 px-4 h-8">
      <Folder className="size-3.5 text-muted-foreground shrink-0" />
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        maxLength={32}
        placeholder="文件夹名称"
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit(draft);
          else if (e.key === 'Escape') onCancel();
        }}
        onBlur={() => onSubmit(draft)}
        disabled={busy}
        className="flex-1 h-6 bg-background border border-border rounded-sm px-1.5 text-xs outline-none focus:border-brand-red"
      />
      {busy && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
    </div>
  );
}
