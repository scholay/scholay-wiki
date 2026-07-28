import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  MessageSquare,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { EmptyState } from '@/shared/components/EmptyState';
import type { Paper } from '../../api/papers';
import { useAuthStore } from '@/stores/auth.store';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { usePdfChatBridge } from '@/stores/pdf-chat-bridge.store';
import { useWorkspaceFolderUi } from '@/stores/workspace-folder.store';
import { useIsPdfChatActive } from '@/shared/hooks/useOpenInSearchPanel';
import { PdfChatMockPage } from './PdfChatMockPage';

/** 工作区 · PDF Chat —— 仅 PDF 预览;文献列表由左侧工作区承担,对话由智能助手承担 */
export function PdfChatPanel({ staged }: { staged: Paper[] }) {
  const selectedPaperId = useWorkspaceFolderUi((s) => s.selectedPaperId);
  const setSelectedPaperId = useWorkspaceFolderUi((s) => s.setSelectedPaperId);
  const engagedPaperId = usePdfChatBridge((s) => s.engagedPaperId);
  const beginPdfChat = usePdfChatBridge((s) => s.beginPdfChat);
  const clearEngagement = usePdfChatBridge((s) => s.clearEngagement);
  const isPdfChatActive = useIsPdfChatActive();
  const token = useAuthStore((s) => s.token);
  const openDialog = useAuthDialog((s) => s.openDialog);
  const [zoom, setZoom] = useState(100);

  useEffect(() => {
    if (!isPdfChatActive) clearEngagement();
  }, [isPdfChatActive, clearEngagement]);

  useEffect(() => {
    if (staged.length === 0) {
      setSelectedPaperId(null);
      return;
    }
    if (
      !selectedPaperId ||
      !staged.some((p) => p.paperId === selectedPaperId)
    ) {
      setSelectedPaperId(staged[0]?.paperId ?? null);
    }
  }, [staged, selectedPaperId, setSelectedPaperId]);

  const selectedPaper = useMemo(
    () =>
      staged.find((p) => p.paperId === selectedPaperId) ?? staged[0] ?? null,
    [staged, selectedPaperId],
  );

  const bumpZoom = useCallback((delta: number) => {
    setZoom((z) => Math.max(72, Math.min(140, z + delta)));
  }, []);

  const showChatOverlay =
    !!selectedPaper && engagedPaperId !== selectedPaper.paperId;

  const handleBeginChat = useCallback(() => {
    if (!selectedPaper) return;
    if (!token) {
      openDialog('login');
      return;
    }
    beginPdfChat(selectedPaper);
  }, [selectedPaper, token, openDialog, beginPdfChat]);

  if (staged.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-background">
        <div className="flex flex-1 items-center justify-center p-6">
          <EmptyState
            icon={FileText}
            title="还没有可预览的 PDF"
            description="在工作区选择文献,或先把论文加入暂存区"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
        <div className="flex min-w-0 items-center gap-2">
          <MessageSquare
            className="size-4 shrink-0 text-brand-red"
            strokeWidth={2.5}
          />
          <span className="truncate text-xs font-semibold text-foreground">
            {selectedPaper?.title || 'PDF 预览'}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <ToolbarIconButton label="缩小" onClick={() => bumpZoom(-8)}>
            <ZoomOut className="size-3.5" />
          </ToolbarIconButton>
          <span className="w-10 text-center text-2xs tabular-nums text-subtle">
            {zoom}%
          </span>
          <ToolbarIconButton label="放大" onClick={() => bumpZoom(8)}>
            <ZoomIn className="size-3.5" />
          </ToolbarIconButton>
          <span className="mx-1 h-4 w-px bg-border" />
          <ToolbarIconButton label="上一页">
            <ChevronLeft className="size-3.5" />
          </ToolbarIconButton>
          <span className="text-2xs tabular-nums text-subtle">1 / 12</span>
          <ToolbarIconButton label="下一页">
            <ChevronRight className="size-3.5" />
          </ToolbarIconButton>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-auto bg-surface-2 p-6">
        <div
          className="origin-top transition-transform duration-200"
          style={{ transform: `scale(${zoom / 100})` }}
        >
          <PdfChatMockPage paper={selectedPaper} />
        </div>

        {showChatOverlay && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/65 backdrop-blur-[2px]">
            <div className="mx-6 flex max-w-sm flex-col items-center gap-4 text-center">
              <p className="text-sm leading-relaxed text-subtle">
                左侧可能仍在文献检索;开始对话后将自动切到
                <span className="font-semibold text-foreground"> 智能助手 </span>
                并针对当前 PDF 发起新会话。
              </p>
              <button
                type="button"
                onClick={handleBeginChat}
                className="inline-flex h-10 items-center gap-2 rounded-pill bg-brand-red px-5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-red/90"
              >
                <MessageSquare className="size-4" strokeWidth={2.5} />
                开始 PDF 对话
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ToolbarIconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="inline-flex size-7 items-center justify-center rounded-sm text-subtle transition-colors hover:bg-surface-1 hover:text-foreground"
    >
      {children}
    </button>
  );
}
