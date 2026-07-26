import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { CitationProse } from '@/shared/components/CitationProse';
import {
  CITATION_FORMAT_LABELS,
  CITATION_FORMATS,
  generateCitation,
  isMonoCitation,
  readDefaultCitationFormat,
  setDefaultCitationFormat,
  stripItalic,
  type CitationFormat,
} from '@/shared/lib/citation';
import { cn } from '@/shared/lib/utils';
import { copyToClipboard } from '@/shared/lib/clipboard';
import type { Paper } from '@/shared/api/types';

/**
 * Footer —— 引用本文 + GB/T 7714/BibTeX/APA/MLA/Chicago + 复制 + 讨论占位 + meta 行。
 *
 * 格式集合与默认格式持久化都走 [[CITATION_FORMATS]] / [[readDefaultCitationFormat]]
 * 单一真源(localStorage scholay.cite-format,双击 = 设为默认)。
 */
export function PaperFooter({ paper }: { paper: Paper }) {
  const [format, setFormat] = useState<CitationFormat>(() =>
    readDefaultCitationFormat('bibtex')
  );

  const citation = useMemo(
    () => generateCitation(paper, format),
    [paper, format]
  );
  const isMono = isMonoCitation(format);

  const copyCurrent = async () => {
    const ok = await copyToClipboard(stripItalic(citation));
    if (ok) toast.success(`${CITATION_FORMAT_LABELS[format]} 已复制`);
    else toast.error('复制失败,请检查浏览器剪贴板权限');
  };

  const setAsDefault = (f: CitationFormat) => {
    setDefaultCitationFormat(f);
    toast.success(`已设为默认: ${CITATION_FORMAT_LABELS[f]}`);
  };

  return (
    <section id="cite-block" className="mt-16 space-y-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="space-y-1.5">
          <div className="text-2xs font-bold uppercase text-faint">
            HOW TO CITE
          </div>
          <h2 className="font-display font-bold text-xl text-foreground">
            引用本文
          </h2>
        </div>

        {/* 格式 tab —— 单击切换,双击设为默认 */}
        <div className="flex items-center gap-1 flex-wrap">
          {CITATION_FORMATS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFormat(f)}
              onDoubleClick={() => setAsDefault(f)}
              className={cn(
                'h-7 px-3 rounded-8 text-xs font-bold transition-colors',
                format === f
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-surface-1 hover:text-foreground'
              )}
              title="单击切换 · 双击设为默认"
            >
              {CITATION_FORMAT_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      {/* 当前格式正文 —— BibTeX 走 mono pre,其余走 prose;
          min-w-0 防御性 grid item 守门(与 CitationDialog 同款) */}
      <div className="relative min-w-0">
        {isMono ? (
          <pre className="w-full rounded-16 bg-surface-1 border border-border px-5 py-4 font-mono text-xs leading-paragraph text-subtle overflow-x-auto whitespace-pre">
            {citation}
          </pre>
        ) : (
          <p className="rounded-16 bg-surface-1 border border-border px-5 py-4 text-base leading-paragraph text-subtle break-words">
            <CitationProse text={citation} />
          </p>
        )}
        <button
          type="button"
          onClick={copyCurrent}
          className="absolute top-2 right-2 inline-flex items-center gap-1 h-7 px-2.5 rounded-8 bg-surface-card border border-border text-2xs font-bold text-subtle hover:border-foreground hover:text-foreground transition-colors"
          aria-label={`复制 ${CITATION_FORMAT_LABELS[format]}`}
        >
          <Copy className="size-3" strokeWidth={2.5} />
          复制
        </button>
      </div>

      <p className="text-2xs text-faint">
        单击切换格式 · 双击格式名设为默认 ·{' '}
        <Link
          to="/citation-generator"
          className="text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          引用生成器(支持 DOI / 手动录入)
        </Link>
      </p>

      <div className="h-px bg-border mt-6" />

      {/* 讨论行 */}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <div className="text-base font-bold text-foreground inline-flex items-center gap-2">
            <MessageSquare
              className="size-4 text-muted-foreground"
              strokeWidth={2}
            />
            读者笔记与讨论
          </div>
          <p className="text-sm text-faint">
            研究论坛即将上线,届时支持笔记与回复
          </p>
        </div>
        <button
          type="button"
          onClick={() => toast.info('研究论坛正在开发中,敬请期待')}
          className="text-sm font-bold text-foreground hover:text-brand-red transition-colors"
        >
          查看全部 →
        </button>
      </div>

      {/* meta 行 */}
      <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-faint">
        {paper.year && <span>发表于 {paper.year}</span>}
        {paper.publicationDate && (
          <>
            <span className="text-border-strong">·</span>
            <span>{paper.publicationDate}</span>
          </>
        )}
        {paper.citationCount != null && (
          <>
            <span className="text-border-strong">·</span>
            <span>被引 {paper.citationCount.toLocaleString()} 次</span>
          </>
        )}
        {paper.isOpenAccess && (
          <>
            <span className="text-border-strong">·</span>
            <span className="text-brand-green font-bold">Open Access</span>
          </>
        )}
        {/* 不展示 stc/olx/pmd 数据源品牌名 —— 对终端用户没意义,顶部 metadata 区
            "原始页"行已经提供了通用"原始链接" */}
      </div>
    </section>
  );
}
