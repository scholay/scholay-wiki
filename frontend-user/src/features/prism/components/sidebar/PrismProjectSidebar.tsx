import { useState } from 'react';
import { Loader2, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react';
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
import { Label } from '@/shared/ui/label';
import {
  Sidebar,
  SidebarAuthFooter,
  SidebarCollapseButton,
  SidebarContent,
  SidebarSection,
} from '@/shared/components/sidebar';
import { useSidebar } from '@/stores/sidebar.store';
import { useAuthStore } from '@/stores/auth.store';
import { toApiError } from '@/shared/lib/http';
import { cn } from '@/shared/lib/utils';
import {
  useCreateProject,
  useDeleteProject,
  useProjects,
  useRenameProject,
  type PrismProject,
} from '../../api/prism';

/**
 * 智能写作主页 Sidebar —— 项目记录列表。复用 SidebarLayout 框架, 跟 ClawSidebar 同型。
 * 每行: 点击 → 进入项目; ⋮ → 重命名 / 删除(交互逻辑同智能助手会话历史)。
 */
export function PrismProjectSidebar({
  activeProjectId,
  onOpen,
  onDeletedActive,
}: {
  activeProjectId: number | null;
  onOpen: (id: number) => void;
  /** 删除的是当前打开的项目时回退(= 回项目主页)。 */
  onDeletedActive: () => void;
}) {
  const toggleSidebar = useSidebar((s) => s.toggle);
  const token = useAuthStore((s) => s.token);
  const { data: projects, isLoading } = useProjects();
  const create = useCreateProject();
  const [renameTarget, setRenameTarget] = useState<PrismProject | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PrismProject | null>(null);

  const onCreate = async () => {
    try {
      const res = await create.mutateAsync('未命名项目');
      onOpen(res.project.id);
    } catch (e) {
      toast.error(toApiError(e).message || '新建项目失败');
    }
  };

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarSection
          id="prism-projects"
          label="项目"
          prominent
          action={
            <button
              type="button"
              onClick={onCreate}
              disabled={create.isPending || !token}
              className="inline-flex items-center gap-1 text-brand-red transition-opacity hover:opacity-80 disabled:opacity-40"
            >
              {create.isPending ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
              新建
            </button>
          }
        >
          {!token ? (
            <div className="px-4 py-3 text-2xs text-faint">登录后可见写作项目</div>
          ) : isLoading ? (
            <div className="px-4 py-3 text-2xs text-faint">加载中…</div>
          ) : !projects || projects.length === 0 ? (
            <div className="px-4 py-3 text-2xs text-faint">还没有写作项目, 点「新建」开始</div>
          ) : (
            <div className="flex flex-col">
              {projects.map((p) => (
                <ProjectRow
                  key={p.id}
                  project={p}
                  active={p.id === activeProjectId}
                  onOpen={() => onOpen(p.id)}
                  onRename={() => setRenameTarget(p)}
                  onDelete={() => setDeleteTarget(p)}
                />
              ))}
            </div>
          )}
        </SidebarSection>
      </SidebarContent>
      <SidebarAuthFooter />
      <SidebarCollapseButton onClick={toggleSidebar} />

      <RenameDialog key={renameTarget?.id} target={renameTarget} onClose={() => setRenameTarget(null)} />
      <DeleteDialog
        target={deleteTarget}
        activeProjectId={activeProjectId}
        onClose={() => setDeleteTarget(null)}
        onActiveDeleted={onDeletedActive}
      />
    </Sidebar>
  );
}

// ─── Row ────────────────────────────────────────────────────────────────

function ProjectRow({
  project,
  active,
  onOpen,
  onRename,
  onDelete,
}: {
  project: PrismProject;
  active: boolean;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        'group flex cursor-pointer items-center gap-2 px-4 py-1.5 transition-colors',
        active ? 'bg-surface-2' : 'hover:bg-surface-1'
      )}
      onClick={onOpen}
    >
      <div className="min-w-0 flex-1">
        <div
          className={cn('truncate text-sm', active ? 'font-semibold text-foreground' : 'text-subtle')}
          title={project.title || '未命名项目'}
        >
          {project.title || '未命名项目'}
        </div>
        <div className="text-2xs text-faint">更新于 {project.updated_at?.slice(0, 10)}</div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex size-6 items-center justify-center rounded text-faint opacity-0 transition-opacity hover:bg-surface-2 hover:text-foreground group-hover:opacity-100 data-[state=open]:opacity-100"
            aria-label="更多操作"
          >
            <MoreVertical className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-32">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onRename();
            }}
          >
            <Pencil className="size-3.5" />
            重命名
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="text-brand-red focus:text-brand-red"
          >
            <Trash2 className="size-3.5" />
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ─── Rename dialog ─────────────────────────────────────────────────────

// RenameDialog 由父层 key={target.id} 挂载,故每个目标都是全新实例:title 用 target.title 作初值,
// 受控同步 —— 彻底避免「取消(走 onClose 不触发 onOpenChange)后 title state 残留, 串到下一个目标」的脏值(review)。
function RenameDialog({ target, onClose }: { target: PrismProject | null; onClose: () => void }) {
  const rename = useRenameProject();
  const [title, setTitle] = useState(target?.title ?? '');

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>重命名项目</DialogTitle>
          <DialogDescription>仅改项目标题, 不影响项目内容。</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="prism-rename-title">新标题</Label>
          <Input
            id="prism-rename-title"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如: Transformer 综述"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            disabled={!title.trim() || rename.isPending}
            onClick={async () => {
              if (!target) return;
              try {
                await rename.mutateAsync({ projectId: target.id, title: title.trim() });
                toast.success('已重命名');
                onClose();
              } catch (err) {
                toast.error(toApiError(err).message || '重命名失败');
              }
            }}
          >
            {rename.isPending ? '保存中…' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete dialog ─────────────────────────────────────────────────────

function DeleteDialog({
  target,
  activeProjectId,
  onClose,
  onActiveDeleted,
}: {
  target: PrismProject | null;
  activeProjectId: number | null;
  onClose: () => void;
  onActiveDeleted: () => void;
}) {
  const del = useDeleteProject();
  const isActive = !!target && target.id === activeProjectId;

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>确定删除这个项目?</DialogTitle>
          <DialogDescription>
            项目 <span className="font-mono text-foreground">"{target?.title?.trim() || '未命名项目'}"</span>{' '}
            连同其全部文件、版本历史与对话将被永久删除, 不可恢复。
            {isActive && <strong>这是你当前打开的项目, 删除后会回到项目列表。</strong>}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="destructive"
            disabled={del.isPending}
            onClick={async () => {
              if (!target) return;
              try {
                await del.mutateAsync(target.id);
                if (isActive) onActiveDeleted();
                toast.success('已删除');
                onClose();
              } catch (err) {
                toast.error(toApiError(err).message || '删除失败');
              }
            }}
          >
            {del.isPending ? '删除中…' : '确认删除'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
