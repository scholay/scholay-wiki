import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  Folder,
  Loader2,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/shared/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/ui/popover';
import type { UserLibraryFolderItem } from '@/shared/api/types';
import { useApiToast } from '@/shared/hooks';
import {
  useBatchDeletePapers,
  useBatchMovePapers,
  type LibraryFolderFilter,
} from '../api/papers';

/**
 * 文献集批量操作工具条 —— 由 LibraryFolderView 在外层 toolbar 渲染,**左对齐**
 * 替换 normal 模式下的"面包屑 / 搜索框 / 导入按钮"。
 *
 * 状态语义:`selectedCount > 0` 即激活批量模式;父级控制显隐。
 */
interface Props {
  selectedCount: number;
  totalCount: number;
  allSelected: boolean;
  folders: UserLibraryFolderItem[];
  currentFilter: LibraryFolderFilter;
  ids: number[];
  onToggleAll: () => void;
  onClear: () => void;
}

export function LibraryBulkToolbar({
  selectedCount,
  totalCount,
  allSelected,
  folders,
  currentFilter,
  ids,
  onToggleAll,
  onClear,
}: Props) {
  const moveMut = useBatchMovePapers();
  const deleteMut = useBatchDeletePapers();
  const apiToast = useApiToast();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [folderQuery, setFolderQuery] = useState('');

  const handleMove = (folderId: number) => {
    moveMut.mutate(
      { ids, folderId },
      {
        onSuccess: (res) => {
          toast.success(`已移动 ${res.affected} 篇`);
          setMoveOpen(false);
          setFolderQuery('');
          onClear();
        },
        onError: apiToast.onError(),
      }
    );
  };
  const handleDelete = () => {
    deleteMut.mutate(ids, {
      onSuccess: (res) => {
        toast.success(`已删除 ${res.affected} 篇`);
        setConfirmingDelete(false);
        onClear();
      },
      onError: apiToast.onError(),
    });
  };

  const busy = moveMut.isPending || deleteMut.isPending;
  const otherFolders = folders.filter((f) => f.id !== currentFilter);

  // 搜索过滤(命中 name 子串,大小写不敏感)
  const filteredFolders = useMemo(() => {
    const q = folderQuery.trim().toLowerCase();
    if (!q) return otherFolders;
    return otherFolders.filter((f) => f.name.toLowerCase().includes(q));
  }, [otherFolders, folderQuery]);

  return (
    <>
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        <span className="text-14 font-medium text-foreground tabular-nums">
          已选 {selectedCount} 项
        </span>
        <span className="text-12 text-faint">
          (共 {totalCount} 项)
        </span>

        <button
          type="button"
          onClick={onToggleAll}
          disabled={busy}
          className="h-7 px-2.5 rounded-8 border border-border text-12 text-subtle hover:bg-surface-1 disabled:opacity-50"
        >
          {allSelected ? '取消全选' : '全选'}
        </button>

        {/* 转移 —— 与行级三点菜单的「转移到…」同款图标 + 文案 + 搜索 + 滚动条
            从 DropdownMenu 改成 Popover:DropdownMenu 内嵌输入框时键盘导航会抢
            焦点,搜索体验差;Popover 没有这层副作用,可以自由内嵌 input */}
        <Popover
          open={moveOpen}
          onOpenChange={(o) => {
            setMoveOpen(o);
            if (!o) setFolderQuery('');
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={busy}
              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-8 border border-border text-12 font-medium text-subtle hover:bg-surface-1 disabled:opacity-50 data-[state=open]:bg-surface-2 data-[state=open]:text-foreground"
            >
              {moveMut.isPending ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <ArrowRightLeft className="size-3" />
              )}
              转移
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" sideOffset={4} className="w-[220px] p-1">
            {/* 搜索框 */}
            <div className="px-1 pt-1 pb-1.5">
              <div className="flex items-center gap-1.5 h-7 px-2 rounded-8 bg-surface-1 border border-border focus-within:border-foreground transition-colors">
                <Search
                  className="size-3 text-faint shrink-0"
                  strokeWidth={2}
                />
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

            {/* 列表 —— 滚动:max-h + overflow-y-auto */}
            <div className="max-h-[260px] overflow-y-auto">
              {filteredFolders.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => handleMove(f.id)}
                  disabled={moveMut.isPending}
                  className="flex items-center gap-2 w-full h-8 px-2 rounded-8 text-12 text-subtle hover:bg-surface-1 hover:text-foreground disabled:opacity-50 transition-colors text-left"
                >
                  <Folder className="size-3.5 shrink-0 text-faint" />
                  <span className="flex-1 truncate">{f.name}</span>
                </button>
              ))}
              {filteredFolders.length === 0 && (
                <div className="px-2 py-3 text-12 text-faint text-center">
                  {folderQuery.trim()
                    ? `没有匹配「${folderQuery.trim()}」的文件夹`
                    : '没有可移动到的文件夹,先新建'}
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>

        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          disabled={busy}
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-8 border border-brand-red bg-brand-red text-on-brand text-12 font-medium hover:bg-brand-red/90 disabled:opacity-50"
        >
          <Trash2 className="size-3" />
          删除
        </button>

        <button
          type="button"
          onClick={onClear}
          disabled={busy}
          className="inline-flex items-center justify-center h-7 w-7 rounded-8 border border-border text-muted-foreground hover:bg-surface-1 disabled:opacity-50"
          title="取消选择"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <BatchDeleteConfirmDialog
        open={confirmingDelete}
        count={selectedCount}
        busy={deleteMut.isPending}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={handleDelete}
      />
    </>
  );
}

function BatchDeleteConfirmDialog({
  open,
  count,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  count: number;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="p-0 gap-0 max-w-[360px] w-[360px]">
        <header className="flex items-center gap-2 h-13 px-5 pr-12 border-b border-border-soft">
          <AlertTriangle className="size-4 text-brand-red shrink-0" />
          <DialogTitle className="text-16 font-medium text-foreground">
            删除 {count} 篇论文?
          </DialogTitle>
        </header>
        <div className="px-5 py-4 text-12 text-subtle leading-paragraph">
          将从文献集永久移除选中的 {count} 篇论文。此操作不可撤销。
        </div>
        <footer className="flex items-center justify-end gap-2 h-13 px-5 border-t border-border-soft">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-7 px-3 rounded-8 border border-border text-12 text-subtle hover:bg-surface-1 disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex items-center gap-1 h-7 px-3 rounded-8 bg-brand-red text-on-brand text-12 font-medium hover:bg-brand-red/90 disabled:opacity-50"
          >
            {busy && <Loader2 className="size-3 animate-spin" />}
            确认删除
          </button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
