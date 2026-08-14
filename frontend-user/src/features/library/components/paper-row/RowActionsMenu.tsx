import { useMemo, useState } from 'react';
import {
  ArrowRightLeft,
  CheckSquare,
  ChevronLeft,
  Folder,
  Loader2,
  MoreHorizontal,
  Search,
  Square,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/ui/popover';
import { ConfirmPopover } from '@/shared/components/ConfirmPopover';
import { useApiToast } from '@/shared/hooks';
import { cn } from '@/shared/lib/utils';
import { useLibraryFolders } from '../../api/folders';
import {
  useBatchDeletePapers,
  useMovePaperToFolder,
  type LibraryFolderFilter,
} from '../../api/papers';

/**
 * 文件夹内论文的行级操作菜单 —— 三个点按钮 + Popover 弹层。
 *
 *   ⋯ → ┌──────────────┐       (转移 click 切换到 folders 视图)
 *       │ ↔ 转移到 ▸    │       ┌────────────────────┐
 *       │ 🗑 删除        │  →   │ ← 转移到            │
 *       │ ☑ 选中/取消    │       │   📁 文件夹 A      │
 *       └──────────────┘       │   📁 文件夹 B      │
 *                              │   📁 根目录        │
 *                              └────────────────────┘
 *
 * 重要语义:**行级操作只针对本行**,与选择状态完全解耦。
 * 即便用户已经勾选了多行,在某一行点"删除"也只删该行;批量操作走顶部 Toolbar。
 *
 * 删除:无独立单行端点,复用 useBatchDeletePapers 传 `[paper.id]`。
 * 转移:复用 useMovePaperToFolder(单行 PATCH /papers/:id/folder)。
 * 选中:转发给父级 onToggle —— 选中态下文案切"取消选中"。
 */
export interface RowActionsMenuProps {
  paperId: number;
  rowIndex: number;
  /** 当前文件夹的 filter(用于在转移列表里隐藏"自己") */
  currentFilter: LibraryFolderFilter;
  /** 选择态 —— 用于切按钮文案("选中" / "取消选中") */
  isSelected: boolean;
  /** 父级稳定回调,(paperId, rowIndex, shiftKey) */
  onToggle: (paperId: number, rowIndex: number, shift: boolean) => void;
}

// NOTE: 编辑信息 / 上传 PDF / 在线关联 这些"对论文本体的操作"现在归 chip 的 click 菜单
// (BasicInfoChip / PdfChip), 不再放在三点菜单里, 避免重复入口。三点菜单只保留"卷宗类"
// 操作: 转移到文件夹 / 删除 / 选中。

type View = 'main' | 'folders';

export function RowActionsMenu({
  paperId,
  rowIndex,
  currentFilter,
  isSelected,
  onToggle,
}: RowActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('main');
  const [folderQuery, setFolderQuery] = useState('');

  const foldersQ = useLibraryFolders();
  const folders = foldersQ.data?.folders ?? [];

  const moveMut = useMovePaperToFolder();
  const deleteMut = useBatchDeletePapers();
  const apiToast = useApiToast();

  const close = () => {
    setOpen(false);
    // 关闭后下一帧复位视图,避免再次打开还停留在 folders
    setTimeout(() => setView('main'), 200);
  };

  const handleMove = async (folderId: number, folderName: string) => {
    if (moveMut.isPending) return;
    try {
      await moveMut.mutateAsync({ id: paperId, folderId });
      toast.success(`已移动到「${folderName}」`);
      close();
    } catch (err) {
      apiToast.show(err, '移动失败');
    }
  };

  const handleDelete = async () => {
    if (deleteMut.isPending) return;
    try {
      const res = await deleteMut.mutateAsync([paperId]);
      toast.success(`已删除 ${res.affected ?? 1} 篇`);
      close();
    } catch (err) {
      apiToast.show(err, '删除失败');
    }
  };

  const handleToggleSelect = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle(paperId, rowIndex, false);
    close();
  };

  // 转移候选 = 全部文件夹,排除"当前文件夹"避免自移动。
  // 不再有"根目录"候选:后端已无根目录概念(null 落默认文件夹),默认文件夹本身
  // 就在 folders 列表里,想"移回默认夹"直接选它即可,无需 null 语义。
  const allMoveTargets = useMemo(() => {
    const list: Array<{ id: number; name: string }> = [];
    for (const f of folders) {
      if (f.id !== currentFilter) {
        list.push({ id: f.id, name: f.name });
      }
    }
    return list;
  }, [folders, currentFilter]);

  // 搜索过滤 —— 名字包含输入即命中(大小写不敏感)
  const moveTargets = useMemo(() => {
    const q = folderQuery.trim().toLowerCase();
    if (!q) return allMoveTargets;
    return allMoveTargets.filter((t) => t.name.toLowerCase().includes(q));
  }, [allMoveTargets, folderQuery]);

  // 进入 folders 视图时清空旧搜索词,避免上次的过滤残留
  const enterFoldersView = () => {
    setFolderQuery('');
    setView('folders');
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setTimeout(() => setView('main'), 200);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="更多操作"
          title="更多操作"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            // 与"我的 PDF / 引用 / OA / AI 翻译"同款 chip 按钮:h-6 + px-2 + border + 12 字号
            'inline-flex items-center gap-1 h-6 px-2 rounded-8 border border-border text-12 font-medium text-subtle shrink-0 transition-colors',
            'hover:bg-surface-1 hover:text-foreground',
            'data-[state=open]:bg-surface-2 data-[state=open]:text-foreground data-[state=open]:border-foreground/30'
          )}
        >
          <MoreHorizontal className="size-3.5" strokeWidth={2} />
        </button>
      </PopoverTrigger>
      {/* w-panel-sm = --panel-w-sm 12.5rem = 200px,与原 w-[200px] 等值(零像素变化) */}
      <PopoverContent
        align="end"
        sideOffset={4}
        className="w-panel-sm p-1"
        onClick={(e) => e.stopPropagation()}
      >
        {view === 'main' ? (
          <div className="flex flex-col">
            <MenuButton
              icon={<ArrowRightLeft className="size-3.5" />}
              label="转移到…"
              onClick={enterFoldersView}
              chevron
            />
            {/* description 说「从你的收藏中」而不是「从文件夹中」:上一项就是「转移到…」(选文件夹),
                写成「从文件夹中删除」会被读成转移的逆操作(挪出这个夹);
                实际是删整行 + 连带删 PDF,与所在文件夹无关。 */}
            <ConfirmPopover
              title="删除这篇论文?"
              description="会从你的收藏中删除这篇文献,你上传的 PDF 也会一起删除。"
              confirmText="删除"
              cancelText="取消"
              danger
              side="left"
              align="start"
              onConfirm={handleDelete}
            >
              <MenuButton
                icon={
                  deleteMut.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )
                }
                label="删除"
                tone="danger"
              />
            </ConfirmPopover>
            <MenuButton
              icon={
                isSelected ? (
                  <CheckSquare className="size-3.5" />
                ) : (
                  <Square className="size-3.5" />
                )
              }
              label={isSelected ? '取消选中' : '选中'}
              onClick={handleToggleSelect}
            />
          </div>
        ) : (
          <div className="flex flex-col">
            <button
              type="button"
              onClick={() => setView('main')}
              className="flex items-center gap-1.5 h-7 px-2 rounded-8 text-12 font-medium text-subtle hover:bg-surface-1 hover:text-foreground transition-colors text-left"
            >
              <ChevronLeft className="size-3" strokeWidth={2.25} />
              转移到
            </button>

            {/* 搜索框 —— 文件夹多了找起来要命,缩进半层与列表对齐 */}
            <div className="px-1 pt-1 pb-1.5">
              <div className="flex items-center gap-1.5 h-7 px-2 rounded-8 bg-surface-1 border border-border focus-within:border-foreground transition-colors">
                <Search className="size-3 text-faint shrink-0" strokeWidth={2} />
                {/* outline-none 合法:焦点可供性由外层容器的 focus-within:border-foreground 提供 */}
                <input
                  type="text"
                  value={folderQuery}
                  onChange={(e) => setFolderQuery(e.target.value)}
                  placeholder="搜索文件夹…"
                  maxLength={48}
                  autoFocus
                  className="flex-1 min-w-0 h-full bg-transparent text-12 outline-none placeholder:text-faint"
                />
              </div>
            </div>

            {/* 列表 —— max-h + overflow-y-auto 长名单滚动。
                max-h-scroll-pane = --scroll-pane-max-h 16.25rem = 260px,与原 max-h-[260px] 等值
                (该 token 就是从本处这类「弹层内列表滚动区」的 5 个一致值抽出来的)。 */}
            <div className="max-h-scroll-pane overflow-y-auto">
              {moveTargets.length === 0 ? (
                <div className="px-2 py-3 text-12 text-faint text-center">
                  {folderQuery.trim()
                    ? `没有匹配「${folderQuery.trim()}」的文件夹`
                    : '没有可转移的位置'}
                </div>
              ) : (
                moveTargets.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleMove(t.id, t.name)}
                    disabled={moveMut.isPending}
                    className="flex items-center gap-2 w-full h-8 px-2 rounded-8 text-12 text-subtle hover:bg-surface-1 hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-left"
                  >
                    <Folder className="size-3.5 shrink-0 text-faint" />
                    <span className="flex-1 truncate">{t.name}</span>
                    {moveMut.isPending &&
                      moveMut.variables?.id === paperId &&
                      moveMut.variables?.folderId === t.id && (
                        <Loader2 className="size-3 animate-spin" />
                      )}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// 简化的菜单条 —— 三种 action 共享同款行式样式
function MenuButton({
  icon,
  label,
  onClick,
  tone,
  chevron,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: (e: React.MouseEvent) => void;
  tone?: 'danger';
  chevron?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 w-full h-8 px-2 rounded-8 text-12 transition-colors text-left',
        tone === 'danger'
          ? 'text-brand-red hover:bg-danger-soft'
          : 'text-subtle hover:bg-surface-1 hover:text-foreground'
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {chevron && (
        <span className="text-faint text-12" aria-hidden>
          ›
        </span>
      )}
    </button>
  );
}
