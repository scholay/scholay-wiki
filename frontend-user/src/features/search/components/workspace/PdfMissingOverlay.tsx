import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  BookMarked,
  CheckCircle2,
  FileSearch,
  Loader2,
  Megaphone,
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
import { usePdfHelpRequest } from '@/stores/pdf-help-request.store';
import type { Paper, UpstreamSource } from '@/shared/api/types';

/**
 * 三方文库直链(mock:合规风险,正式环境应由后端配置开关下发,可整体下线)。
 * 文案统一用中性词「第三方文库」,不在 UI 上硬编码品牌名。
 */
const THIRD_PARTY_LIBRARY = {
  buildUrl: (doi: string) => `https://sci-hub.se/${encodeURIComponent(doi)}`,
};

/** 每篇论文自动获取只跑一次(页面生命周期内),防切换论文来回触发刷接口。 */
const autoAttempted = new Set<string>();

/**
 * 缺 PDF 漏斗 —— 四渠道从属关系:
 *   1. 平台自动获取(状态,不是按钮):进面板即静默跑一遍重取 + DOI 查 OA;
 *   2. 第三方文库(外链)→ 下载后回来上传;
 *   3. 社区求助(表单,mock 挂起态)→ 有人上传后站内信通知;
 *   4. 本地上传 = 唯一「完成动作」,永远是主区。2 和 3 都是为 4 服务的。
 */
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
  /** 渠道1:进面板自动获取的阶段。idle = 未跑/已跑过,running = 进行中,failed = 没找到 */
  const [autoPhase, setAutoPhase] = useState<'idle' | 'running' | 'failed'>(
    () => (autoAttempted.has(paper.paperId) ? 'failed' : 'idle'),
  );

  // 渠道3:社区求助(mock 本地挂起态)
  const helpRequest = usePdfHelpRequest((s) => s.requested[paper.paperId]);
  const submitHelp = usePdfHelpRequest((s) => s.submit);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpNote, setHelpNote] = useState('');

  useEffect(() => {
    setHelpOpen(false);
    setHelpNote('');
    setChannelsOpen(false);
  }, [paper.paperId]);

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

  /** 渠道1 主体:重取详情 + 文献集行 + DOI 查 OA。silent = 自动获取(失败不弹 toast)。 */
  const runRetryAll = useCallback(
    async ({ silent = false } = {}): Promise<boolean> => {
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
          return true;
        }

        const ok = await tryResolveFromSources(detailRes.data ?? null, oaUrl);
        if (!ok && !silent) {
          toast.message('仍未找到可用 PDF', {
            description: '可从下方渠道拿到文件后上传，或向社区求助',
          });
        }
        return ok;
      } finally {
        setRetrying(false);
      }
    },
    [qc, paper, doi, detailQ, libQ, tryResolveFromSources, onPdfResolved],
  );

  // 自动获取要用最新的 runRetryAll,但不能把它放进 effect deps(query 更新会换 identity)。
  const runRetryAllRef = useRef(runRetryAll);
  runRetryAllRef.current = runRetryAll;

  // 渠道1:进面板即自动跑一遍(每篇一次)。找到 → onPdfResolved 让父级换掉面板;
  // 没找到 → 亮出「自动获取未找到」,把用户导向 2/3/4。
  useEffect(() => {
    if (autoAttempted.has(paper.paperId)) return;
    autoAttempted.add(paper.paperId);
    let cancelled = false;
    setAutoPhase('running');
    void runRetryAllRef.current({ silent: true }).then((ok) => {
      if (!cancelled) setAutoPhase(ok ? 'idle' : 'failed');
    });
    return () => {
      cancelled = true;
    };
  }, [paper.paperId]);

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

  const handleSubmitHelp = useCallback(() => {
    submitHelp(paper.paperId, helpNote);
    setHelpOpen(false);
    setHelpNote('');
    toast.success('求助已发布到社区', {
      description: '有人上传这篇 PDF 后，会通过站内信通知你',
    });
  }, [submitHelp, paper.paperId, helpNote]);

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
    doiUrl ? { label: 'DOI 页面', href: doiUrl, hint: doi } : undefined,
  ].filter((c): c is NonNullable<typeof c> => c != null);

  const busy =
    retrying || detailQ.isFetching || oaQ.isFetching || libQ.isFetching;
  const autoRunning = autoPhase === 'running';

  return (
    <div className="flex h-full min-h-0 w-full items-start justify-center overflow-auto p-5">
      <div className="my-auto w-full max-w-xl rounded-16 border border-border bg-background p-6 shadow-sm">
        {/* 标题区:渠道1 是状态不是按钮 —— 自动获取的进展/结果直接在这里说 */}
        <div className="text-center">
          <h3 className="text-md font-bold text-foreground">暂无可用 PDF</h3>
          {autoRunning ? (
            <p className="mx-auto mt-1.5 flex max-w-md items-center justify-center gap-1.5 text-xs leading-relaxed text-subtle">
              <Loader2 className="size-3 animate-spin" />
              正在从开放渠道自动获取全文…
            </p>
          ) : (
            <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-subtle">
              {autoPhase === 'failed'
                ? '已自动检索开放渠道，未找到全文。'
                : '可能是网络未取到全文，也可能本篇没有开放获取版本。'}
              <br />
              建议上传本地 PDF；拿不到文件可先走下方渠道。
            </p>
          )}
        </div>

        {/* 渠道4(主路径):本地上传 —— 唯一「完成动作」,永远最大面积 */}
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

        {/* 渠道2 + 3:都是为「拿到文件再上传」服务的取件路径 */}
        <div className="mt-5 border-t border-border pt-4">
          <p className="text-2xs font-semibold text-faint">
            拿不到文件？先从这些渠道取
          </p>

          <div className="mt-2.5 space-y-2">
            {doi && (
              <a
                href={THIRD_PARTY_LIBRARY.buildUrl(doi)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-3 rounded-8 border border-border px-3 py-2.5 transition-colors hover:bg-surface-1"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <BookMarked className="size-4 shrink-0 text-subtle" />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-foreground">
                      第三方文库获取
                    </span>
                    <span className="block truncate text-2xs text-faint">
                      按 DOI 打开对应页面，下载后拖回上方即可开始对话
                    </span>
                  </span>
                </span>
                <ArrowUpRight className="size-3.5 shrink-0 text-faint" />
              </a>
            )}

            {helpRequest ? (
              <div className="flex items-center gap-2.5 rounded-8 border border-border bg-surface-1 px-3 py-2.5">
                <CheckCircle2 className="size-4 shrink-0 text-brand-green" />
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-foreground">
                    已发布求助 · 等待社区响应
                  </span>
                  <span className="block text-2xs text-faint">
                    有人上传这篇 PDF 后，会通过站内信通知你
                  </span>
                </span>
              </div>
            ) : helpOpen ? (
              <div className="rounded-8 border border-border px-3 py-2.5">
                <p className="text-xs font-semibold text-foreground">
                  向社区求助
                </p>
                <textarea
                  value={helpNote}
                  onChange={(e) => setHelpNote(e.target.value)}
                  placeholder="补充说明（可选）：需要的版本、章节等"
                  rows={2}
                  className="mt-2 w-full resize-none rounded-8 border border-border bg-surface-1 px-2.5 py-2 text-xs text-foreground placeholder:text-faint focus:outline-none focus:ring-1 focus:ring-brand-red/40"
                />
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setHelpOpen(false)}
                    className="inline-flex h-7 items-center rounded-sm px-2.5 text-2xs font-semibold text-subtle transition-colors hover:text-foreground"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmitHelp}
                    className="inline-flex h-7 items-center gap-1.5 rounded-sm bg-brand-red px-2.5 text-2xs font-bold text-white transition-colors hover:bg-brand-red/90"
                  >
                    <Megaphone className="size-3" />
                    发布求助
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setHelpOpen(true)}
                className="flex w-full items-center justify-between gap-3 rounded-8 border border-border px-3 py-2.5 text-left transition-colors hover:bg-surface-1"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <Megaphone className="size-4 shrink-0 text-subtle" />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-foreground">
                      向社区求助
                    </span>
                    <span className="block text-2xs text-faint">
                      发布求助帖，有人上传后通知你
                    </span>
                  </span>
                </span>
              </button>
            )}
          </div>

          {/* 兜底:手动重试 + 更多外链(异常路径,压缩视觉权重) */}
          <div className="mt-3 flex flex-wrap gap-2">
            <SecondaryButton
              label="重新拉取"
              icon={RefreshCw}
              loading={busy}
              onClick={() => void runRetryAll()}
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
