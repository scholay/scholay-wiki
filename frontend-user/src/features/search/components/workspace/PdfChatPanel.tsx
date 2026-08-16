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
import { paperHasOaPdf } from '@/shared/lib/paper-pdf';
import type { Paper } from '../../api/papers';
import { useAuthStore } from '@/stores/auth.store';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { usePdfChatBridge } from '@/stores/pdf-chat-bridge.store';
import { useSmartSearchSessionStore } from '@/stores/smart-search-session.store';
import { useWorkspaceFolderUi } from '@/stores/workspace-folder.store';
import { PdfChatMockPage } from './PdfChatMockPage';
import { PdfMissingOverlay } from './PdfMissingOverlay';

/** 工作区 · PDF Chat —— PDF 预览 + 缺 PDF 时多渠道重试/上传 */
export function PdfChatPanel({ staged }: { staged: Paper[] }) {
  const selectedPaperId = useWorkspaceFolderUi((s) => s.selectedPaperId);
  const setSelectedPaperId = useWorkspaceFolderUi((s) => s.setSelectedPaperId);
  const checkedPaperIds = useWorkspaceFolderUi((s) => s.checkedPaperIds);
  const visibleStaged = useMemo(
    () => staged.filter((p) => checkedPaperIds.includes(p.paperId)),
    [staged, checkedPaperIds],
  );
  const engagedSessions = usePdfChatBridge((s) => s.engagedSessions);
  const beginPdfChat = usePdfChatBridge((s) => s.beginPdfChat);
  const resumePdfChat = usePdfChatBridge((s) => s.resumePdfChat);
  const leftBusy = useSmartSearchSessionStore((s) => s.busy);
  const activeSessionId = useSmartSearchSessionStore((s) => s.activeSessionId);
  const token = useAuthStore((s) => s.token);
  const openDialog = useAuthDialog((s) => s.openDialog);
  const [zoom, setZoom] = useState(100);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [pdfPatches, setPdfPatches] = useState<Record<string, Paper>>({});
  /** 左栏回答中点「开始/继续」→ 先就地确认一次(破坏性:会切走当前会话)。 */
  const [confirming, setConfirming] = useState(false);

  const favoriteMut = useFavoritePaper();
  const uploadMut = useUploadPaperPdf();
  const isUploading = favoriteMut.isPending || uploadMut.isPending;

  useEffect(() => {
    if (visibleStaged.length === 0) {
      setSelectedPaperId(null);
      return;
    }
    if (
      !selectedPaperId ||
      !visibleStaged.some((p) => p.paperId === selectedPaperId)
    ) {
      setSelectedPaperId(visibleStaged[0]?.paperId ?? null);
    }
  }, [visibleStaged, selectedPaperId, setSelectedPaperId]);

  const selectedPaper = useMemo(
    () =>
      visibleStaged.find((p) => p.paperId === selectedPaperId) ??
      visibleStaged[0] ??
      null,
    [visibleStaged, selectedPaperId],
  );

  const headerTitle = useMemo(() => {
    const title = selectedPaper?.title?.trim() || 'PDF 预览';
    const n = visibleStaged.length;
    if (n > 1) return `${title} 等 ${n} 篇文献`;
    return title;
  }, [selectedPaper, visibleStaged.length]);

  const effectivePaper = useMemo(() => {
    if (!selectedPaper) return null;
    const patch = pdfPatches[selectedPaper.paperId];
    return patch ? { ...selectedPaper, ...patch } : selectedPaper;
  }, [selectedPaper, pdfPatches]);

  const { hasPdf, isLoading: pdfStatusLoading } =
    usePaperReadablePdf(effectivePaper);

  const checkedPaperCount = visibleStaged.length;
  const checkedPdfCount = useMemo(() => {
    const ids = new Set(
      visibleStaged
        .filter((p) => {
          const patch = pdfPatches[p.paperId];
          return paperHasOaPdf(patch ? { ...p, ...patch } : p);
        })
        .map((p) => p.paperId),
    );
    if (effectivePaper && hasPdf) ids.add(effectivePaper.paperId);
    return ids.size;
  }, [visibleStaged, pdfPatches, effectivePaper, hasPdf]);

  const startChatHint = `根据左侧 ${checkedPaperCount} 篇论文，共计 ${checkedPdfCount} 个 PDF 开启对话`;

  const bumpZoom = useCallback((delta: number) => {
    setZoom((z) => Math.max(72, Math.min(140, z + delta)));
  }, []);

  const showMissingOverlay =
    !!effectivePaper && !pdfStatusLoading && !hasPdf;

  // 已有过 PDF 对话的论文 → CTA 变「继续对话」;当前会话就是这篇的 → 不再打扰。
  const engagedSessionId = effectivePaper
    ? engagedSessions[effectivePaper.paperId]
    : undefined;
  const chatActiveForPaper =
    !!engagedSessionId && engagedSessionId === activeSessionId;
  const canResume = !!engagedSessionId && !chatActiveForPaper;
  const showCtaBar =
    !!effectivePaper && hasPdf && !pdfStatusLoading && !chatActiveForPaper;

  // 换论文 / 左栏空闲下来 → 收起未决的确认条。
  useEffect(() => {
    setConfirming(false);
  }, [effectivePaper?.paperId, leftBusy]);

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
    if (leftBusy && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    if (canResume) resumePdfChat(effectivePaper);
    else beginPdfChat(effectivePaper);
  }, [
    effectivePaper,
    hasPdf,
    token,
    openDialog,
    leftBusy,
    confirming,
    canResume,
    resumePdfChat,
    beginPdfChat,
  ]);

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

  if (staged.length === 0 || visibleStaged.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-background">
        <div className="flex flex-1 items-center justify-center p-6">
          <EmptyState
            icon={FileText}
            title={
              staged.length === 0
                ? '还没有可预览的 PDF'
                : '还没有勾选文献'
            }
            description={
              staged.length === 0
                ? '在工作区选择文献,或先把论文加入暂存区'
                : '在左侧勾选文献后,即可预览 PDF 并开始对话'
            }
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
            {headerTitle}
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

      {showMissingOverlay && effectivePaper ? (
        <div className="min-h-0 flex-1 overflow-hidden bg-background">
          <PdfMissingOverlay
            paper={effectivePaper}
            onUpload={(file) => void handleUploadPdf(file)}
            isUploading={isUploading}
            uploadProgress={uploadProgress}
            onPdfResolved={handlePdfResolved}
          />
        </div>
      ) : (
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="h-full overflow-auto bg-surface-2 p-6 pb-24">
          <div
            className="origin-top transition-transform duration-200"
            style={{ transform: `scale(${zoom / 100})` }}
          >
            <PdfChatMockPage paper={effectivePaper} />
          </div>
        </div>

        {/* 预览可读可滚,CTA 降级为底部悬浮条 —— 不再用全屏蒙层挡住 PDF。 */}
        {showCtaBar && (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center px-4">
            <div className="pointer-events-auto w-full max-w-md rounded-16 border border-border bg-background/95 p-3 shadow-lg backdrop-blur-sm">
              {confirming ? (
                <div className="flex flex-col gap-2.5">
                  <p className="text-xs leading-relaxed text-subtle">
                    左侧回答仍在进行。
                    {canResume ? '继续对话会切换会话' : '开始 PDF 对话会开启新会话'}
                    ,当前会话随时可在历史中找回。
                  </p>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirming(false)}
                      className="inline-flex h-8 items-center rounded-pill border border-border px-3.5 text-xs font-semibold text-subtle transition-colors hover:bg-surface-1 hover:text-foreground"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={handleBeginChat}
                      className="inline-flex h-8 items-center gap-1.5 rounded-pill bg-brand-red px-3.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-brand-red/90"
                    >
                      {canResume ? '仍要继续' : '仍要开始'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 text-xs leading-relaxed text-subtle">
                    {canResume
                      ? '此前已针对这篇 PDF 开启过对话'
                      : startChatHint}
                  </p>
                  <button
                    type="button"
                    onClick={handleBeginChat}
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-pill bg-brand-red px-3.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-brand-red/90"
                  >
                    <MessageSquare className="size-3.5" strokeWidth={2.5} />
                    {canResume ? '继续对话' : '开始 PDF 对话'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      )}
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
