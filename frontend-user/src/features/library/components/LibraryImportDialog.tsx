import { useEffect, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Plus, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Dialog } from '@/shared/ui/dialog';
import type { LibraryFolderFilter } from '../api/papers';
import { IMPORT_TABS, type ImportTab } from './library-import-dialog/types';
import { PdfUploadTab } from './library-import-dialog/PdfUploadTab';
import { OnlineSearchTab } from './library-import-dialog/OnlineSearchTab';
import { ComingSoonTab } from './library-import-dialog/ComingSoonTab';

/**
 * 文献集 · 统一导入弹窗。
 *
 * 4 个入口按钮(在线搜索 / 上传 PDF / Zotero / Endnote)打开同一个 Dialog,
 * 只是 `initialTab` 不同,Dialog 内部 tab 仍可自由切换。
 *
 * 对照设计稿 scholay0523.pen 帧 `M6NQBY`:
 *   - header: 图标 + 主标 + 副标
 *   - tab 条:4 个 tab(active 橙色下划线)
 *   - body:各 tab 独立组件,有自己的 state machine(PDF tab 有 0~5 子状态)
 *   - footer:左 hint / 右取消按钮
 *
 * 各 tab 内部状态在切换时**重置**(unmount/remount)—— 设计意图是"换入口
 * 等于换思路重来",不保留半截输入。
 */
export interface LibraryImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 打开时定位到哪个 tab。Dialog 内部 tab 仍可切换 */
  initialTab: ImportTab;
  /** 当前文件夹定位(决定加入哪个文件夹) */
  currentFilter: LibraryFolderFilter;
  currentFolderName: string;
}

export function LibraryImportDialog({
  open,
  onOpenChange,
  initialTab,
  currentFilter,
  currentFolderName,
}: LibraryImportDialogProps) {
  const [tab, setTab] = useState<ImportTab>(initialTab);

  // 每次打开都同步到调用方指定的 initialTab —— 上一次关闭时的 tab 不影响下次
  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-foreground/30 backdrop-blur-[2px]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[860px] max-w-[calc(100vw-32px)]',
            '-translate-x-1/2 -translate-y-1/2',
            'flex flex-col max-h-[88vh] overflow-hidden',
            'rounded-lg border border-border bg-background',
            'shadow-[0_8px_24px_rgba(15,23,42,0.12)]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95'
          )}
        >
          {/* ─── header ─────────────────────────────────────────────── */}
          <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 shrink-0 border-b border-border-soft">
            <div className="flex items-start gap-3 min-w-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-sm bg-surface-2 shrink-0">
                <Plus className="size-4 text-foreground" strokeWidth={2.25} />
              </div>
              <div className="min-w-0">
                <DialogPrimitive.Title className="text-base font-semibold text-foreground">
                  添加文献
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-0.5 text-xs text-muted-foreground">
                  通过 本地上传 / Zotero / Endnote 等多种途径添加文献到{' '}
                  <span className="font-semibold text-foreground">
                    「{currentFolderName}」
                  </span>
                </DialogPrimitive.Description>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="关闭"
              className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-faint hover:bg-surface-2 hover:text-foreground shrink-0"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* ─── tab 条 ─────────────────────────────────────────────── */}
          <div
            role="tablist"
            aria-label="导入方式"
            className="flex items-center gap-1 px-6 border-b border-border shrink-0"
          >
            {IMPORT_TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'relative inline-flex items-center h-10 px-3 text-sm font-semibold transition-colors',
                    active
                      ? 'text-brand-amber'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {t.label}
                  {t.comingSoon && (
                    <span
                      aria-hidden="true"
                      className="ml-1.5 inline-flex items-center h-3.5 px-1 rounded-pill bg-brand-amber text-background text-[9px] font-bold leading-none whitespace-nowrap"
                    >
                      即将
                    </span>
                  )}
                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute bottom-0 left-2 right-2 h-0.5 rounded-pill bg-brand-amber"
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* ─── body —— 各 tab 独立组件,unmount 自然清理状态 ─────── */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {tab === 'search' && (
              <OnlineSearchTab
                currentFilter={currentFilter}
                currentFolderName={currentFolderName}
                onDone={() => onOpenChange(false)}
              />
            )}
            {tab === 'pdf' && (
              <PdfUploadTab
                currentFilter={currentFilter}
                currentFolderName={currentFolderName}
                onDone={() => onOpenChange(false)}
              />
            )}
            {tab === 'zotero' && <ComingSoonTab name="Zotero" />}
            {tab === 'endnote' && <ComingSoonTab name="Endnote" />}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}
