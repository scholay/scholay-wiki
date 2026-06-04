import { ChevronLeft, FileText, FolderTree, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { Input } from '@/shared/ui/input';
import {
  Sidebar,
  SidebarAuthFooter,
  SidebarCollapseButton,
  SidebarContent,
  SidebarHeaderNav,
  SidebarItem,
  SidebarSection,
} from '@/shared/components/sidebar';
import { useSidebar } from '@/stores/sidebar.store';
import { toApiError } from '@/shared/lib/http';
import { cn } from '@/shared/lib/utils';
import { useCreateFile, useDeleteFile, useRenameFile, type PrismFile } from '../../api/prism';

interface OutlineItem {
  level: number;
  title: string;
  line: number; // 1-based 行号 —— 点击大纲项跳转编辑器到该行
}

/**
 * 项目内 Sidebar —— 文件目录 + 大纲。复用 SidebarLayout 框架(同 ClawSidebar)。
 * 文件行: 点击 → 打开; ⋮ → 重命名(行内输入)/ 删除(确认弹窗), 交互同文件系统。
 * 提案在途(disabled)时禁用文件增删改, 避免在 diff 期间切走/改名。
 */
export function PrismFileSidebar({
  projectId,
  projectTitle,
  files,
  activeFileId,
  mainFile,
  outline,
  disabled,
  onSelect,
  onDeletedActive,
  onBack,
  onOutlineClick,
}: {
  projectId: number;
  projectTitle?: string;
  files: PrismFile[];
  activeFileId: number | null;
  mainFile?: string;
  outline: OutlineItem[];
  disabled: boolean;
  onSelect: (id: number) => void;
  onDeletedActive: () => void;
  onBack: () => void;
  onOutlineClick: (line: number) => void;
}) {
  const toggleSidebar = useSidebar((s) => s.toggle);
  const create = useCreateFile(projectId);
  const rename = useRenameFile(projectId);
  const del = useDeleteFile(projectId);
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PrismFile | null>(null);

  const submitNew = async (raw: string) => {
    setCreating(false);
    const n = raw.trim();
    if (!n) return;
    try {
      const f = await create.mutateAsync(n);
      onSelect(f.id);
    } catch (e) {
      toast.error(toApiError(e).message || '新建失败');
    }
  };

  const submitRename = async (file: PrismFile, raw: string) => {
    setRenamingId(null);
    const n = raw.trim();
    if (!n || n === file.rel_path) return;
    try {
      await rename.mutateAsync({ fileId: file.id, relPath: n });
    } catch (e) {
      toast.error(toApiError(e).message || '重命名失败');
    }
  };

  return (
    <Sidebar>
      {/* 顶部菜单导航与其它菜单页一致(不塞额外按钮);返回项目列表放到下面的标题面包屑。 */}
      <SidebarHeaderNav />
      <SidebarContent>
        {/* 项目标题行兼作「‹ 返回项目列表」面包屑 */}
        <button
          type="button"
          onClick={onBack}
          title="返回项目列表"
          className="group flex w-full items-center gap-1 px-3 pb-1 pt-3 text-left text-xs font-bold text-foreground"
        >
          <ChevronLeft className="size-3.5 shrink-0 text-faint transition-colors group-hover:text-brand-red" />
          <span className="truncate group-hover:text-brand-red">{projectTitle || '未命名项目'}</span>
        </button>

        <SidebarSection
          id="prism-files"
          label="文件"
          prominent
          action={
            <button
              type="button"
              disabled={disabled}
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-1 text-brand-red transition-opacity hover:opacity-80 disabled:opacity-40"
            >
              <Plus className="size-3" /> 新建
            </button>
          }
        >
          {creating && (
            <div className="px-3 py-1">
              <Input
                autoFocus
                defaultValue=""
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) submitNew((e.target as HTMLInputElement).value);
                  if (e.key === 'Escape') setCreating(false);
                }}
                onBlur={(e) => submitNew(e.target.value)}
                placeholder="intro.tex"
                className="h-7 text-xs"
              />
            </div>
          )}
          {files.map((f) => (
            <FileRow
              key={f.id}
              file={f}
              active={f.id === activeFileId}
              isMain={f.rel_path === mainFile}
              disabled={disabled}
              renaming={renamingId === f.id}
              onSelect={() => onSelect(f.id)}
              onStartRename={() => setRenamingId(f.id)}
              onSubmitRename={(v) => submitRename(f, v)}
              onCancelRename={() => setRenamingId(null)}
              onDelete={() => setDeleteTarget(f)}
            />
          ))}
        </SidebarSection>

        {outline.length > 0 && (
          <SidebarSection id="prism-outline" label="大纲" bordered>
            {outline.map((s, i) => (
              <SidebarItem
                key={i}
                label={s.title}
                icon={<FolderTree />}
                indent={Math.min(s.level, 3) as 0 | 1 | 2 | 3}
                size="sm"
                onClick={() => onOutlineClick(s.line)}
              />
            ))}
          </SidebarSection>
        )}
      </SidebarContent>
      <SidebarAuthFooter />
      <SidebarCollapseButton onClick={toggleSidebar} />

      <DeleteFileDialog
        target={deleteTarget}
        pending={del.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await del.mutateAsync(deleteTarget.id);
            if (deleteTarget.id === activeFileId) onDeletedActive();
            setDeleteTarget(null);
            toast.success('已删除');
          } catch (e) {
            toast.error(toApiError(e).message || '删除失败');
          }
        }}
      />
    </Sidebar>
  );
}

// ─── Row ────────────────────────────────────────────────────────────────

function FileRow({
  file,
  active,
  isMain,
  disabled,
  renaming,
  onSelect,
  onStartRename,
  onSubmitRename,
  onCancelRename,
  onDelete,
}: {
  file: PrismFile;
  active: boolean;
  isMain: boolean;
  disabled: boolean;
  renaming: boolean;
  onSelect: () => void;
  onStartRename: () => void;
  onSubmitRename: (value: string) => void;
  onCancelRename: () => void;
  onDelete: () => void;
}) {
  if (renaming) {
    return (
      <div className="px-3 py-1">
        <Input
          autoFocus
          defaultValue={file.rel_path}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) onSubmitRename((e.target as HTMLInputElement).value);
            if (e.key === 'Escape') onCancelRename();
          }}
          onBlur={(e) => onSubmitRename(e.target.value)}
          className="h-7 text-xs"
        />
      </div>
    );
  }

  return (
    <div className={cn('group flex items-center', active ? 'bg-surface-2' : 'hover:bg-surface-1')}>
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        className={cn(
          'flex h-8 min-w-0 flex-1 items-center gap-1.5 text-left text-sm transition-colors',
          active
            ? '-ml-px border-l-[3px] border-l-foreground pl-[13px] font-semibold text-foreground'
            : 'pl-4 text-subtle'
        )}
      >
        <FileText className="size-3.5 shrink-0 text-faint" />
        <span className="truncate">{file.rel_path}</span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className="mr-1.5 inline-flex size-6 items-center justify-center rounded text-faint opacity-0 transition-opacity hover:bg-surface-2 hover:text-foreground group-hover:opacity-100 data-[state=open]:opacity-100 disabled:hidden"
            aria-label="更多操作"
          >
            <MoreVertical className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-32">
          <DropdownMenuItem onClick={onStartRename}>
            <Pencil className="size-3.5" />
            重命名
          </DropdownMenuItem>
          {!isMain && (
            <DropdownMenuItem onClick={onDelete} className="text-brand-red focus:text-brand-red">
              <Trash2 className="size-3.5" />
              删除
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ─── Delete dialog ─────────────────────────────────────────────────────

function DeleteFileDialog({
  target,
  pending,
  onClose,
  onConfirm,
}: {
  target: PrismFile | null;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>确定删除这个文件?</DialogTitle>
          <DialogDescription>
            文件 <span className="font-mono text-foreground">"{target?.rel_path}"</span> 连同其版本历史将被永久删除, 不可恢复。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button variant="destructive" disabled={pending} onClick={onConfirm}>
            {pending ? '删除中…' : '确认删除'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
