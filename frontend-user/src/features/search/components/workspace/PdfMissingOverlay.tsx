import { useCallback, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  FileSearch,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PdfUploadDropzone } from '@/shared/components/PdfUploadDropzone';
import { useFetchPaperDetail } from '@/shared/api/paper-detail';
import {
  fetchOpenAccessByDoi,
  useOpenAccess,
} from '@/shared/api/open-access';
import { useLibraryPaperByUpstream } from '@/shared/api/user-library-papers';
import {
  extractPaperArxivId,
  extractPaperDoi,
} from '@/shared/lib/paper-doi';
import { paperHasOaPdf, libraryRowHasUploadedPdf } from '@/shared/lib/paper-pdf';
import { cn } from '@/shared/lib/utils';
import type { Paper, UpstreamSource } from '@/shared/api/types';

export function PdfMissingOverlay({
  paper,
  onUpload,
  isUploading = false,
  uploadProgress = 0,
  onPdfResolved,
}: {
  paper: Paper;
  onUpload: (file: File) => void;
  isUploading?: boolean;
  uploadProgress?: number;
  /** 重试/渠道拉取到可读 PDF 后回调 */
  onPdfResolved: (patch: Paper) => void;
}) {
  const qc = useQueryClient();
  const [retrying, setRetrying] = useState(false);
  const [channelsOpen, setChannelsOpen] = useState(false);

  const doi = extractPaperDoi(paper.externalIds);
  const arxivId = extractPaperArxivId(paper.externalIds);
  const hasMinicodPdf = paperHasOaPdf(paper);

  const upstreamSource =
    paper.source && paper.source !== 'local'
      ? (paper.source as UpstreamSource)
      : undefined;

  const detailQ = useFetchPaperDetail({
    source: upstreamSource ?? 'stc',
    paperId: paper.paperId,
    enabled: !!upstreamSource && !!paper.paperId,
  });
  const oaQ = useOpenAccess(doi, !!doi && !hasMinicodPdf);
  const libQ = useLibraryPaperByUpstream(paper.source, paper.paperId);

  const mergedPaper = useMemo(
    () => (detailQ.data ? { ...paper, ...detailQ.data } : paper),
    [paper, detailQ.data],
  );

  const oaPdfUrl = mergedPaper.openAccessPdf?.url?.trim();
  const unpaywallUrl =
    oaQ.data?.is_oa && oaQ.data.url ? oaQ.data.url.trim() : undefined;
  const publisherUrl = mergedPaper.url?.trim();
  const doiUrl = doi ? `https://doi.org/${encodeURIComponent(doi)}` : undefined;
  const arxivUrl = arxivId
    ? `https://arxiv.org/abs/${encodeURIComponent(arxivId)}`
    : undefined;
  const arxivPdfUrl = arxivId
    ? `https://arxiv.org/pdf/${encodeURIComponent(arxivId)}.pdf`
    : undefined;

  const tryResolveFromSources = useCallback(
    async (freshDetail?: Paper | null, freshOaUrl?: string) => {
      const detail = freshDetail ?? detailQ.data ?? paper;
      const merged = { ...paper, ...detail };

      if (libraryRowHasUploadedPdf(libQ.data)) {
        onPdfResolved(merged);
        toast.success('已找到文献集中上传的 PDF');
        return true;
      }

      const direct = merged.openAccessPdf?.url?.trim();
      if (direct) {
        onPdfResolved(merged);
        toast.success('已获取 PDF 直链');
        return true;
      }

      const oaUrl =
        freshOaUrl ??
        (oaQ.data?.is_oa && oaQ.data.url ? oaQ.data.url.trim() : undefined);
      if (oaUrl) {
        onPdfResolved({
          ...merged,
          openAccessPdf: { url: oaUrl, status: 'green' },
          isOpenAccess: true,
        });
        toast.success('已通过 DOI 找到 OA 全文');
        return true;
      }

      return false;
    },
    [detailQ.data, libQ.data, oaQ.data, onPdfResolved, paper],
  );

  const handleRetryAll = useCallback(async () => {
    setRetrying(true);
    try {
      await qc.invalidateQueries({
        queryKey: ['library', 'by-upstream', paper.source, paper.paperId],
      });
      const [detailRes, libRes] = await Promise.all([
        detailQ.refetch(),
        libQ.refetch(),
      ]);

      let oaUrl: string | undefined;
      if (doi) {
        await qc.invalidateQueries({ queryKey: ['oa', 'resolve', doi] });
        try {
          const oa = await fetchOpenAccessByDoi(doi);
          if (oa.is_oa && oa.url) oaUrl = oa.url.trim();
        } catch {
          // OA 查找失败不阻塞其他渠道
        }
      }

      if (libraryRowHasUploadedPdf(libRes.data)) {
        onPdfResolved(detailRes.data ? { ...paper, ...detailRes.data } : paper);
        toast.success('已找到文献集中上传的 PDF');
        return;
      }

      const ok = await tryResolveFromSources(detailRes.data ?? null, oaUrl);
      if (!ok) {
        toast.message('仍未找到可用 PDF', {
          description: '可尝试外部下载渠道，或直接本地上传',
        });
      }
    } finally {
      setRetrying(false);
    }
  }, [qc, paper, doi, detailQ, libQ, tryResolveFromSources, onPdfResolved]);

  const handleRetryOa = useCallback(async () => {
    if (!doi) return;
    setRetrying(true);
    try {
      await qc.invalidateQueries({ queryKey: ['oa', 'resolve', doi] });
      const oa = await fetchOpenAccessByDoi(doi);
      if (oa.is_oa && oa.url) {
        await tryResolveFromSources(null, oa.url.trim());
      } else {
        toast.message('未找到 OA 全文', {
          description: '可尝试出版商页面，或直接本地上传',
        });
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'OA 检索失败，请稍后重试',
      );
    } finally {
      setRetrying(false);
    }
  }, [doi, qc, tryResolveFromSources]);

  const channels = [
    oaPdfUrl
      ? { label: 'OA PDF 直链', href: oaPdfUrl, hint: '开放获取原文' }
      : null,
    unpaywallUrl && unpaywallUrl !== oaPdfUrl
      ? {
          label: 'Unpaywall 全文',
          href: unpaywallUrl,
          hint: oaQ.data?.host_type ?? 'OA 仓库',
        }
      : null,
    arxivPdfUrl
      ? { label: 'arXiv PDF', href: arxivPdfUrl, hint: `arXiv:${arxivId}` }
      : null,
    publisherUrl
      ? { label: '出版商原文页', href: publisherUrl, hint: '跳转后下载' }
      : null,
    arxivUrl && arxivUrl !== arxivPdfUrl
      ? { label: 'arXiv 摘要页', href: arxivUrl, hint: '跳转后下载' }
      : null,
    doiUrl ? { label: 'DOI 页面', href: doiUrl, hint: doi } : null,
  ].filter((c): c is NonNullable<typeof c> => c !== null);

  const busy =
    retrying || detailQ.isFetching || oaQ.isFetching || libQ.isFetching;

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center overflow-auto bg-background/60 p-5 backdrop-blur-[2px]">
      <div className="my-auto w-full max-w-xl rounded-16 border border-border bg-background p-6 shadow-lg">
        {/* 标题区：短、清楚 */}
        <div className="text-center">
          <h3 className="text-md font-bold text-foreground">暂无可用 PDF</h3>
          <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-subtle">
            可能是网络未取到全文，也可能本篇没有开放获取版本。
            <br />
            建议先上传本地 PDF，再开始对话。
          </p>
        </div>

        {/* 主路径：本地上传 —— 最大面积、默认展开 */}
        <div className="mt-5">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-foreground">本地上传 PDF</p>
            <span className="rounded-pill bg-brand-red/10 px-2 py-0.5 text-2xs font-bold text-brand-red">
              推荐
            </span>
          </div>
          <PdfUploadDropzone
            onUpload={onUpload}
            isPending={isUploading}
            progress={uploadProgress}
            size="lg"
            className="max-w-none"
          />
        </div>

        {/* 次路径：重试 + 外链，压缩视觉权重 */}
        <div className="mt-5 border-t border-border pt-4">
          <p className="text-2xs font-semibold text-faint">
            或者，试试重新获取 / 外部下载
          </p>

          <div className="mt-2.5 flex flex-wrap gap-2">
            <SecondaryButton
              label="重新拉取"
              icon={RefreshCw}
              loading={busy}
              onClick={() => void handleRetryAll()}
            />
            {doi && (
              <SecondaryButton
                label="DOI 查 OA"
                icon={FileSearch}
                loading={busy}
                onClick={() => void handleRetryOa()}
              />
            )}
            {channels.length > 0 && (
              <SecondaryButton
                label={channelsOpen ? '收起下载渠道' : `其他下载渠道 (${channels.length})`}
                onClick={() => setChannelsOpen((v) => !v)}
              />
            )}
          </div>

          {channelsOpen && channels.length > 0 && (
            <ul className="mt-2.5 divide-y divide-border overflow-hidden rounded-8 border border-border">
              {channels.map((c) => (
                <li key={c.label}>
                  <a
                    href={c.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-3 px-3 py-2 text-xs transition-colors hover:bg-surface-1"
                  >
                    <span className="font-medium text-foreground">{c.label}</span>
                    <span className="flex min-w-0 items-center gap-1 text-faint">
                      <span className="truncate">{c.hint}</span>
                      <ArrowUpRight className="size-3 shrink-0" />
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function SecondaryButton({
  label,
  icon: Icon,
  loading,
  onClick,
}: {
  label: string;
  icon?: typeof RefreshCw;
  loading?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={loading}
      onClick={onClick}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-sm border border-border bg-surface-1 px-2.5 text-2xs font-semibold text-subtle transition-colors hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60',
      )}
    >
      {loading ? (
        <Loader2 className="size-3 animate-spin" />
      ) : Icon ? (
        <Icon className="size-3" strokeWidth={2.25} />
      ) : null}
      {label}
    </button>
  );
}
