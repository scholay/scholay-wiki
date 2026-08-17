import { useMemo } from 'react';
import { toast } from 'sonner';
import { Copy } from 'lucide-react';
import { copyToClipboard } from '@/shared/lib/clipboard';
import { PaperPdfChip } from '@/shared/components/PaperPdfChip';
import { useOpenAccess } from '../../api/open-access';
import type { Paper, UserLibraryPaper } from '@/shared/api/types';

/**
 * 论文 metadata 块 —— Hero 第二层。label-value 表格,只渲染有值的字段,
 * 不同源给的字段完整度差很多,空段静默不占位。
 *
 * 字段:DOI / 发表 / 计数(citationCount + referenceCount) / 开放 / 学科 / 原始页
 */
export function PaperMetadataBlock({
  paper,
  libRow,
}: {
  paper: Paper;
  libRow?: UserLibraryPaper | null;
}) {
  // DOI 从 externalIds 抽 —— STC 用 "DOI",OLX 用 "doi",兜底大小写
  const doi = useMemo<string | undefined>(() => {
    const ext = paper.externalIds;
    if (!ext) return undefined;
    for (const k of ['DOI', 'doi', 'Doi']) {
      const v = ext[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return undefined;
  }, [paper.externalIds]);

  // 发表日期:精确到 day 比 year 更有用,但 year 兜底
  const publishedDate =
    paper.publicationDate || (paper.year ? String(paper.year) : '');

  // 学科 chip
  const fields = paper.fieldsOfStudy ?? [];

  // 合法 OA 兜底:Minicod 没给 openAccessPdf 时,按 DOI 问后端(Unpaywall)。
  // 有 DOI 且本就没 PDF 直链才查,避免无谓请求。hook 必须在任何 return 之前调。
  const hasMinicodPdf = !!paper.openAccessPdf?.url;
  const oaQ = useOpenAccess(doi, !!doi && !hasMinicodPdf);
  const foundOA = oaQ.data?.is_oa ? oaQ.data : null;
  const chipPaper =
    !hasMinicodPdf && foundOA?.url
      ? { ...paper, openAccessPdf: { url: foundOA.url, status: 'green' as const } }
      : paper;

  // 注:`paper.url`(原始页)入口已合并到 ActionRow 的"原始链接",这里不再重复展示

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-14 text-subtle">
      {doi && (
        <MetadataRow label="DOI">
          <a
            href={`https://doi.org/${encodeURIComponent(doi)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-foreground hover:text-brand-red hover:underline break-all"
            title="在 doi.org 打开"
          >
            {doi}
          </a>
          <CopyIconButton text={doi} label="DOI" />
        </MetadataRow>
      )}

      {publishedDate && (
        <MetadataRow label="发表">
          <span className="tabular-nums text-foreground">{publishedDate}</span>
        </MetadataRow>
      )}

      {(paper.citationCount != null || paper.referenceCount != null) && (
        <MetadataRow label="计数">
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-foreground">
            {paper.citationCount != null && (
              <span className="tabular-nums">
                被引用{' '}
                <span className="font-medium">
                  {paper.citationCount.toLocaleString()}
                </span>{' '}
                次
              </span>
            )}
            {paper.referenceCount != null && paper.referenceCount > 0 && (
              <span className="tabular-nums">
                参考文献{' '}
                <span className="font-medium">
                  {paper.referenceCount.toLocaleString()}
                </span>{' '}
                条
              </span>
            )}
          </span>
        </MetadataRow>
      )}

      <MetadataRow label="开放">
        <PaperPdfChip paper={chipPaper} libRow={libRow} />
      </MetadataRow>

      {fields.length > 0 && (
        <MetadataRow label="学科">
          <span className="flex flex-wrap items-center gap-1.5">
            {fields.slice(0, 12).map((f) => (
              <span
                key={f}
                className="inline-flex items-center px-1.5 py-0.5 rounded-4 bg-surface-1 border border-border-soft text-12 text-subtle"
              >
                {f}
              </span>
            ))}
          </span>
        </MetadataRow>
      )}

      {/* "原始页" 入口已下移到 ActionRow 的"原始链接",避免与下方按钮重复 */}
    </dl>
  );
}

function MetadataRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-12 font-medium uppercase text-faint pt-0.5">
        {label}
      </dt>
      <dd className="flex flex-wrap items-center gap-2 min-w-0">{children}</dd>
    </>
  );
}

function CopyIconButton({ text, label }: { text: string; label: string }) {
  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await copyToClipboard(text);
        if (ok) toast.success(`${label} 已复制`);
        else toast.error('复制失败,请检查浏览器剪贴板权限');
      }}
      className="inline-flex h-5 w-5 items-center justify-center rounded-4 text-faint hover:bg-surface-2 hover:text-foreground transition-colors shrink-0"
      title={`复制 ${label}`}
      aria-label={`复制 ${label}`}
    >
      <Copy className="size-3" />
    </button>
  );
}
