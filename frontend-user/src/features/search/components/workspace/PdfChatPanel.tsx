import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  MessageSquare,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/shared/components/EmptyState';
import { useFavoritePaper } from '@/shared/api/user-library-mutations';
import {
  UPLOAD_CANCELLED,
  useUploadPaperPdf,
} from '@/shared/api/paper-pdf-upload';
import { usePaperReadablePdf } from '@/shared/hooks/usePaperReadablePdf';
import type { Paper } from '../../api/papers';
import { useAuthStore } from '@/stores/auth.store';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { usePdfChatBridge } from '@/stores/pdf-chat-bridge.store';
import { useWorkspaceFolderUi } from '@/stores/workspace-folder.store';
import { useIsPdfChatActive } from '@/shared/hooks/useOpenInSearchPanel';
import { PdfChatMockPage } from './PdfChatMockPage';
import { PdfMissingOverlay } from './PdfMissingOverlay';

/** 工作区 · PDF Chat —— PDF 预览 + 缺 PDF 时多渠道重试/上传 */
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
  const [uploadProgress, setUploadProgress] = useState(0);
  const [pdfPatches, setPdfPatches] = useState<Record<string, Paper>>({});

  const favoriteMut = useFavoritePaper();
  const uploadMut = useUploadPaperPdf();
  const isUploading = favoriteMut.isPending || uploadMut.isPending;

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

  const effectivePaper = useMemo(() => {
    if (!selectedPaper) return null;
    const patch = pdfPatches[selectedPaper.paperId];
    return patch ? { ...selectedPaper, ...patch } : selectedPaper;
  }, [selectedPaper, pdfPatches]);

  const { hasPdf, isLoading: pdfStatusLoading } =
    usePaperReadablePdf(effectivePaper);

  const bumpZoom = useCallback((delta: number) => {
    setZoom((z) => Math.max(72, Math.min(140, z + delta)));
  }, []);

  const showMissingOverlay =
    !!effectivePaper && !pdfStatusLoading && !hasPdf;
  const showChatOverlay =
    !!effectivePaper &&
    hasPdf &&
    !pdfStatusLoading &&
    engagedPaperId !== effectivePaper.paperId;

  const handlePdfResolved = useCallback((patch: Paper) => {
    if (!patch.paperId) return;
    setPdfPatches((prev) => ({
      ...prev,
      [patch.paperId]: { ...prev[patch.paperId], ...patch },
    }));
  }, []);

  const handleBeginChat = useCallback(() => {
    if (!effectivePaper || !hasPdf) return;
    if (!token) {
      openDialog('login');
      return;
    }
    beginPdfChat(effectivePaper);
  }, [effectivePaper, hasPdf, token, openDialog, beginPdfChat]);

  const handleUploadPdf = useCallback(
    async (file: File) => {
      if (!effectivePaper) return;
      if (!token) {
        openDialog('login');
        return;
      }

      setUploadProgress(0);
      try {
        const favoriteResult = await favoriteMut.mutateAsync({
          paper: effectivePaper,
          silentSuccess: true,
        });
        await uploadMut.mutateAsync({
          paperId: favoriteResult.id,
          file,
          onProgress: setUploadProgress,
        });
        toast.success('PDF 已上传,可以开始对话');
        setUploadProgress(0);
      } catch (err) {
        setUploadProgress(0);
        const msg = err instanceof Error ? err.message : '上传失败';
        if (msg === UPLOAD_CANCELLED) return;
        toast.error(msg);
      }
    },
    [effectivePaper, token, openDialog, favoriteMut, uploadMut],
  );

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
            {effectivePaper?.title || 'PDF 预览'}
          </span>
        </div>
        {hasPdf && (
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
        )}
      </div>

      <div className="relative min-h-0 flex-1 overflow-auto bg-surface-2 p-6">
        <div
          className={
            hasPdf
              ? 'origin-top transition-transform duration-200'
              : 'origin-top opacity-90'
          }
          style={
            hasPdf
              ? { transform: `scale(${zoom / 100})` }
              : undefined
          }
        >
          <PdfChatMockPage paper={effectivePaper} />
        </div>

        {showMissingOverlay && effectivePaper && (
          <PdfMissingOverlay
            paper={effectivePaper}
            onUpload={(file) => void handleUploadPdf(file)}
            isUploading={isUploading}
            uploadProgress={uploadProgress}
            onPdfResolved={handlePdfResolved}
          />
        )}

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
