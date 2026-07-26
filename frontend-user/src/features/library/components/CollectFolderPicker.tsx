import { useEffect, useMemo, useState } from 'react';
import { LazyMotion, domMax } from 'framer-motion';
import { BookmarkCheck, Check, ChevronRight, Library, Loader2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import { toApiError } from '@/shared/lib/http';
import { isPhoneDevice } from '@/shared/lib/device';
import { MobileBottomSheet } from '@/shared/components/MobileBottomSheet';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog';
import { useCollectPicker } from '@/stores/collect-picker.store';
import type { UserLibraryFolderItem } from '@/shared/api/types';
import { useLibraryFolders, useCreateFolder } from '../api/folders';

/**
 * 全局「收藏到文献集」文件夹选择器 —— 对齐 scholay-mobile.pen `mLHNI`(收藏 / 文献→文献集):
 * 顶部标题 + 新建文献集 + 文件夹单选列表(默认夹预选)+「完成收藏」。
 * 移动端用底部抽屉、PC 用居中弹窗(同一份内容);由 providers 全局挂一份,任意收藏按钮 openCollect 触发。
 * 只负责选文件夹(含新建),选定后回调 request.onPick(folderId);真正收藏由 FavoritePaperButton 做。
 *
 * 分层:本组件属 library feature(用 features/library 的 folder hooks),由 app/providers 挂载(app→feature 允许);
 * 收藏按钮在 shared 只触碰 collect-picker.store,不 import 本组件。
 */
export function CollectFolderPicker() {
  const request = useCollectPicker((s) => s.request);
  const close = useCollectPicker((s) => s.closeCollect);
  const open = !!request;

  const foldersQ = useLibraryFolders();
  const folders = useMemo(() => foldersQ.data?.folders ?? [], [foldersQ.data]);
  const createMut = useCreateFolder();

  const [selected, setSelected] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  // 打开时(或文件夹加载完)预选默认文件夹;没有默认夹 → null(后端 Add 省略 folder_id 即落默认)。
  useEffect(() => {
    if (!open) return;
    const def = folders.find((f) => f.is_default);
    setSelected(def ? def.id : null);
    setCreating(false);
    setNewName('');
    // 仅在打开 / 文件夹首次加载时重置
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, foldersQ.isSuccess]);

  const confirm = () => {
    request?.onPick(selected);
    close();
  };

  const submitCreate = () => {
    const name = newName.trim();
    if (!name || createMut.isPending) return;
    createMut.mutate(name, {
      onSuccess: (folder) => {
        setSelected(folder.id); // 新建后自动选中,用户直接「完成收藏」
        setCreating(false);
        setNewName('');
      },
      onError: (e) => toast.error(toApiError(e).message || '新建失败'),
    });
  };

  const body = (
    <div className="flex max-h-[70vh] flex-col">
      {/* 头部 */}
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-border px-5 pb-3.5 pt-0.5">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-lg font-bold text-foreground">收藏到文献集</h2>
          <p className="text-xs text-muted-foreground">
            {request?.paperTitle ? `把《${request.paperTitle}》保存到一个文献集` : '将这篇论文保存到一个文献集'}
          </p>
        </div>
        <button
          type="button"
          aria-label="关闭"
          onClick={close}
          className="flex size-7 shrink-0 items-center justify-center rounded-pill bg-surface-2 text-muted-foreground active:opacity-70"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* 列表 */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {/* 新建文献集 */}
        {creating ? (
          <div className="flex items-center gap-2 rounded-md border border-border-button bg-surface-card p-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitCreate()}
              placeholder="新文献集名称"
              maxLength={32}
              className="min-w-0 flex-1 bg-transparent px-1.5 text-md text-foreground outline-none placeholder:text-faint"
            />
            <button
              type="button"
              onClick={submitCreate}
              disabled={!newName.trim() || createMut.isPending}
              className="flex h-8 items-center gap-1 rounded-sm bg-brand-red px-3 text-xs font-medium text-on-brand active:opacity-90 disabled:opacity-50"
            >
              {createMut.isPending ? <Loader2 className="size-3.5 animate-spin" /> : '创建'}
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="px-1.5 text-xs text-muted-foreground active:opacity-60"
            >
              取消
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex w-full items-center gap-3 rounded-md border border-border-button bg-surface-card p-3 text-left active:bg-surface-1"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-sm border border-border bg-surface-1">
              <Plus className="size-5 text-brand-green" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-semibold text-foreground">新建文献集</span>
              <span className="text-xs text-faint">创建一个新的论文分组</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-faint" />
          </button>
        )}

        {foldersQ.isLoading ? (
          <div className="flex h-20 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-faint" />
          </div>
        ) : (
          folders.map((f, i) => (
            <FolderRow
              key={f.id}
              folder={f}
              index={i}
              selected={selected === f.id}
              onSelect={() => setSelected(f.id)}
            />
          ))
        )}
      </div>

      {/* 完成收藏 */}
      <div className="shrink-0 border-t border-border px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-3">
        <button
          type="button"
          onClick={confirm}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-brand-red text-base font-semibold text-on-brand active:opacity-90"
        >
          <BookmarkCheck className="size-4" />
          完成收藏
        </button>
      </div>
    </div>
  );

  if (isPhoneDevice()) {
    // MobileBottomSheet 用 m.*,必须有 LazyMotion 祖先。本组件挂在 providers(MobileShell 之外,
    // 拿不到壳里的 LazyMotion),故自带一层(domMax 与 MobileShell 同款,同模块零额外体积),
    // 否则滑入/退场动画与拖拽关闭全失效。
    return (
      <LazyMotion features={domMax}>
        <MobileBottomSheet open={open} onOpenChange={(v) => !v && close()} title="收藏到文献集">
          {body}
        </MobileBottomSheet>
      </LazyMotion>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">收藏到文献集</DialogTitle>
        {body}
      </DialogContent>
    </Dialog>
  );
}

const SPINE_COLORS = ['bg-brand-green', 'bg-brand-amber', 'bg-brand-red', 'bg-[#7C9E82]'];

function FolderRow({
  folder,
  index,
  selected,
  onSelect,
}: {
  folder: UserLibraryFolderItem;
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-3 rounded-md border bg-surface-card p-2.5 text-left transition-colors',
        selected ? 'border-[1.5px] border-brand-green' : 'border-border active:bg-surface-1'
      )}
    >
      {/* 文件夹封面(简化版堆叠封面:色脊 + 折角) */}
      <span className="relative flex size-10 shrink-0 items-center justify-center rounded-sm bg-surface-1">
        <Library className={cn('size-5', selected ? 'text-brand-green' : 'text-muted-foreground')} />
        <span
          className={cn('absolute left-0 top-0 h-1.5 w-full rounded-t-sm', SPINE_COLORS[index % SPINE_COLORS.length])}
        />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold text-foreground">
          {folder.name}
          {folder.is_default && <span className="ml-1.5 text-2xs font-normal text-faint">默认</span>}
        </span>
        <span className="text-xs text-muted-foreground">{folder.paper_count} 篇论文</span>
      </span>
      <span
        className={cn(
          'flex size-[22px] shrink-0 items-center justify-center rounded-pill border-[1.5px]',
          selected ? 'border-brand-green bg-brand-green text-on-brand' : 'border-border-button'
        )}
      >
        {selected && <Check className="size-3.5" />}
      </span>
    </button>
  );
}
