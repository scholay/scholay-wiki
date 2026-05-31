import { useEffect, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { FileText, Link2, Paperclip, Settings2, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Dialog } from '@/shared/ui/dialog';
import { pickEffectiveFields } from '../lib/pick-field';
import { RelinkPanel } from './manage/RelinkPanel';
import { MetadataPanel } from './manage/MetadataPanel';
import { PdfPanel } from './manage/PdfPanel';
import type { UserLibraryPaper } from '@/shared/api/types';

/**
 * 论文信息管理 —— 统一弹窗(替代原 PaperRelinkDialog / PaperEditDialog / PdfAttachDialog 三个独立弹窗)。
 *
 * 三个 row 入口流程(在线关联 / 手动编辑 / 补充·更换 PDF)最终都作用于同一行,这里收进一个弹窗的
 * 三个 tab,各入口只是 seed 不同的 initialTab:
 *   - BasicInfoChip 在线关联 → 'relink'   · 手动编辑 → 'metadata'
 *   - PdfChip 本地上传 / 更换 PDF → 'pdf'
 * 共用数据层(lib/resolve-paper)+ 元数据表单(MetadataFields / useMetadataForm)。
 */

export type ManageTab = 'relink' | 'metadata' | 'pdf';

const TABS: Array<{ id: ManageTab; label: string; icon: typeof Link2 }> = [
  { id: 'relink', label: '在线关联', icon: Link2 },
  { id: 'metadata', label: '元数据', icon: FileText },
  { id: 'pdf', label: 'PDF', icon: Paperclip },
];

interface PaperManageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paper: UserLibraryPaper;
  initialTab?: ManageTab;
}

export function PaperManageDialog({
  open,
  onOpenChange,
  paper,
  initialTab = 'metadata',
}: PaperManageDialogProps) {
  const [tab, setTab] = useState<ManageTab>(initialTab);
  // 每次打开 → 跳到入口指定的 tab
  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  const title = pickEffectiveFields(paper).title || '(无标题)';
  const close = () => onOpenChange(false);

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
            'fixed left-1/2 top-1/2 z-50 w-[960px] max-w-[calc(100vw-32px)]',
            '-translate-x-1/2 -translate-y-1/2',
            'flex flex-col h-[640px] max-h-[90vh] overflow-hidden',
            'rounded-lg border border-border bg-background',
            'shadow-[0_8px_24px_rgba(15,23,42,0.12)]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95'
          )}
        >
          {/* ─── header ─────────────────────────────────────────────── */}
          <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-3 border-b border-border-soft shrink-0">
            <div className="flex items-start gap-3 min-w-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-sm bg-warning-soft shrink-0">
                <Settings2 className="size-4 text-brand-amber" strokeWidth={2.25} />
              </div>
              <div className="min-w-0">
                <DialogPrimitive.Title className="text-base font-semibold text-foreground">
                  论文信息管理
                </DialogPrimitive.Title>
                <DialogPrimitive.Description
                  className="mt-0.5 text-xs text-muted-foreground line-clamp-1"
                  title={title}
                >
                  {title}
                </DialogPrimitive.Description>
              </div>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="关闭"
              className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-faint hover:bg-surface-2 hover:text-foreground shrink-0"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* ─── 顶级 tab 条 ───────────────────────────────────────── */}
          <div role="tablist" aria-label="管理类别" className="flex items-center gap-1 px-6 border-b border-border shrink-0">
            {TABS.map((t) => {
              const active = tab === t.id;
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'relative inline-flex items-center gap-1.5 h-11 px-3.5 text-sm font-semibold transition-colors',
                    active ? 'text-brand-amber' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="size-4" strokeWidth={2.25} />
                  {t.label}
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

          {/* ─── body —— 当前 tab 的 panel(各自含 footer) ────────── */}
          {tab === 'relink' && <RelinkPanel paper={paper} onClose={close} />}
          {tab === 'metadata' && <MetadataPanel paper={paper} onClose={close} />}
          {tab === 'pdf' && (
            <PdfPanel paper={paper} onClose={close} onRequestEditMeta={() => setTab('metadata')} />
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}
