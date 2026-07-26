import { useMemo } from 'react';
import { toast } from 'sonner';
import { ArrowUpRight, Copy } from 'lucide-react';
import { copyToClipboard } from '@/shared/lib/clipboard';
import { useOpenAccess } from '../../api/open-access';
import type { Paper } from '@/shared/api/types';

/**
 * 论文 metadata 块 —— Hero 第二层。label-value 表格,只渲染有值的字段,
 * 不同源给的字段完整度差很多,空段静默不占位。
 *
 * 字段:DOI / 发表 / 计数(citationCount + referenceCount) / 开放 / 学科 / 原始页
 */
export function PaperMetadataBlock({ paper }: { paper: Paper }) {
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

  // 至少一项有值才渲染整块,避免空块占位
  // 注:`paper.url`(原始页)入口已合并到 ActionRow 的"原始链接",这里不再重复展示
  const hasAny =
    !!doi ||
    !!publishedDate ||
    !!paper.citationCount ||
    !!paper.referenceCount ||
    !!paper.isOpenAccess ||
    hasMinicodPdf ||
    !!foundOA ||
    fields.length > 0;
  if (!hasAny) return null;

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm text-subtle">
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
                <span className="font-semibold">
                  {paper.citationCount.toLocaleString()}
                </span>{' '}
                次
              </span>
            )}
            {paper.referenceCount != null && paper.referenceCount > 0 && (
              <span className="tabular-nums">
                参考文献{' '}
                <span className="font-semibold">
                  {paper.referenceCount.toLocaleString()}
                </span>{' '}
                条
              </span>
            )}
          </span>
        </MetadataRow>
      )}

      {(paper.isOpenAccess || hasMinicodPdf || foundOA) && (
        <MetadataRow label="开放">
          <span className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded-sm bg-brand-green/12 text-2xs font-bold text-brand-green">
              OA
            </span>
            {paper.openAccessPdf?.url ? (
              <a
                href={paper.openAccessPdf.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-brand-amber hover:text-brand-red hover:underline"
                title="直接下载 OA PDF"
              >
                PDF 直链
                <ArrowUpRight className="size-3" />
              </a>
            ) : (
              foundOA && (
                <a
                  href={foundOA.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-brand-amber hover:text-brand-red hover:underline"
                  title="经 Unpaywall 找到的合法开放获取版本"
                >
                  {foundOA.is_pdf ? '免费全文 PDF' : '免费全文'}
                  <ArrowUpRight className="size-3" />
                  <span className="text-faint">via Unpaywall</span>
                </a>
              )
            )}
          </span>
        </MetadataRow>
      )}

      {fields.length > 0 && (
        <MetadataRow label="学科">
          <span className="flex flex-wrap items-center gap-1.5">
            {fields.slice(0, 12).map((f) => (
              <span
                key={f}
                className="inline-flex items-center px-1.5 py-0.5 rounded-sm bg-surface-1 border border-border-soft text-2xs text-subtle"
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
      <dt className="text-2xs font-bold uppercase text-faint pt-0.5">
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
      className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-faint hover:bg-surface-2 hover:text-foreground transition-colors shrink-0"
      title={`复制 ${label}`}
      aria-label={`复制 ${label}`}
    >
      <Copy className="size-3" />
    </button>
  );
}
