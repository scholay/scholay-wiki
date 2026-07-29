import { useMemo, useState } from 'react';
import { ExternalLink, Minimize2 } from 'lucide-react';
import { FavoritePaperButton } from '@/shared/components/FavoritePaperButton';
import { TranslatePaperButton } from '@/shared/components/TranslatePaperButton';
import { PdfChatPaperButton } from '@/shared/components/PdfChatPaperButton';
import { TruncatedText } from '@/shared/components/TruncatedText';
import {
  useOpenPaperDetail,
  useOpenJournalDetail,
  useOpenPdfChat,
  useIsPdfChatActive,
} from '@/shared/hooks/useOpenInSearchPanel';
import { useSearchRightPanelStore } from '@/stores/search-right-panel.store';
import { Checkbox } from '@/shared/ui/checkbox';
import { cn } from '@/shared/lib/utils';
import type { Paper } from '@/shared/api/types';
import type { JournalEnrichment } from '@/shared/api/journal-enrichment';
import { type TranslatePaperResult } from '@/shared/api/translate';
import { MetaLine } from './MetaLine';
import { needsTranslation, pickTags, renderHighlight } from './tags';

/**
 * 标准卡 — 左侧复选框只控制暂存;折叠由 action 行「折叠」按钮单独控制。
 */
export function DefaultCard({
  paper,
  isStaged,
  isFavorited,
  journalEnrichment,
  onToggleStage,
  onFold,
  highlightQuery,
  hideStage,
}: {
  paper: Paper;
  isStaged: boolean;
  isFavorited: boolean;
  journalEnrichment?: JournalEnrichment | null;
  onToggleStage: () => void;
  onFold: () => void;
  highlightQuery?: string;
  hideStage?: boolean;
}) {
  const tags = pickTags(paper, journalEnrichment);
  const openPaperDetail = useOpenPaperDetail();
  const openJournalDetail = useOpenJournalDetail();
  const openPdfChat = useOpenPdfChat();
  const isPdfChatActive = useIsPdfChatActive();
  const embedMode = useSearchRightPanelStore((s) => s.embedMode);
  const isDetailSelected = useSearchRightPanelStore((s) =>
    s.isActivePaper(paper.paperId),
  );
  const [zh, setZh] = useState<TranslatePaperResult | null>(null);
  const [showZh, setShowZh] = useState(false);

  const hasTranslatable = useMemo(
    () => needsTranslation(paper.title) || needsTranslation(paper.abstract),
    [paper.title, paper.abstract],
  );

  const displayTitle =
    showZh && zh?.title_zh ? zh.title_zh : (paper.title ?? '');
  const displayAbstract =
    showZh && zh?.abstract_zh ? zh.abstract_zh : (paper.abstract ?? '');

  const oaPdfUrl = paper.openAccessPdf?.url?.trim();
  const journalTagKeys = new Set(['jcr', 'if', 'cas', 'xr', 'ccf', 'warn']);

  const openJournalFromEnrichment = () => {
    if (!journalEnrichment?.id) return;
    openJournalDetail({
      id: journalEnrichment.id,
      canonical_name: journalEnrichment.canonical_name,
      jcr_quartile: journalEnrichment.jcr_quartile,
      jcr_impact_factor: journalEnrichment.jcr_impact_factor,
      fqb_quartile: journalEnrichment.fqb_quartile,
      ccf_rank: journalEnrichment.ccf_rank,
      openalex_h_index: journalEnrichment.openalex_h_index,
      gjqk_warning: journalEnrichment.gjqk_warning,
      is_oa: journalEnrichment.is_oa,
    });
  };

  return (
    <article
      data-paper-id={paper.paperId}
      className={cn(
        'group flex items-start gap-2.5 border-b border-border px-3.5 py-3.5',
        isDetailSelected && 'bg-brand-red/5',
        isStaged && !isDetailSelected && 'bg-brand-green/5',
      )}
    >
      {!hideStage && (
        <Checkbox
          checked={isStaged}
          onCheckedChange={() => onToggleStage()}
          aria-label={isStaged ? '取消暂存' : '加入暂存区'}
          title={isStaged ? '取消勾选以移出暂存区' : '勾选以加入暂存区'}
          className="mt-1 shrink-0"
        />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <h3
            onClick={() => openPaperDetail(paper)}
            className={cn(
              'flex-1 min-w-0 text-md font-semibold leading-snug cursor-pointer transition-colors',
              isDetailSelected
                ? 'text-brand-red'
                : 'text-foreground hover:text-brand-red',
            )}
            title="查看参考文献详情"
          >
            {highlightQuery && !showZh
              ? renderHighlight(displayTitle, highlightQuery)
              : displayTitle || '无标题'}
          </h3>
          {oaPdfUrl && (
            <a
              href={oaPdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title="查看 Open Access 原始 PDF(新窗口)"
              className="shrink-0 inline-flex items-center gap-1 h-6 px-2 rounded-sm border border-brand-green/30 bg-brand-green/10 text-brand-green text-2xs font-bold hover:bg-brand-green/15 transition-colors"
            >
              <ExternalLink className="size-2.5" strokeWidth={2.5} />
              OA PDF
            </a>
          )}
        </div>
        <MetaLine paper={paper} journalEnrichment={journalEnrichment} />
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {tags.map((t) => {
              const clickableJournal =
                !!journalEnrichment?.id && journalTagKeys.has(t.key);
              const className = cn(
                'inline-flex items-center px-1.5 h-[18px] rounded-sm text-2xs font-bold',
                t.tone === 'solid-green' && 'bg-brand-green text-white',
                t.tone === 'solid-amber' && 'bg-brand-amber text-white',
                t.tone === 'solid-red' && 'bg-brand-red text-white',
                t.tone === 'red' && 'bg-danger-soft text-brand-red',
                t.tone === 'green' && 'bg-brand-green/10 text-brand-green',
                t.tone === 'blue' && 'bg-brand-blue-soft text-brand-blue',
                t.tone === 'neutral' && 'bg-surface-2 text-subtle font-semibold',
                clickableJournal &&
                  'cursor-pointer hover:opacity-85 underline decoration-dotted underline-offset-2',
              );
              if (clickableJournal) {
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openJournalFromEnrichment();
                    }}
                    className={className}
                    title="查看期刊详情"
                  >
                    {t.label}
                  </button>
                );
              }
              return (
                <span key={t.key} className={className}>
                  {t.label}
                </span>
              );
            })}
          </div>
        )}
        {displayAbstract && (
          <TruncatedText
            lines={2}
            className="mt-2 text-sm text-subtle leading-relaxed"
          >
            {displayAbstract}
          </TruncatedText>
        )}
        <div className="@container mt-2.5 flex items-center gap-1.5">
          <FavoritePaperButton
            paper={paper}
            isFavorited={isFavorited}
            variant="chip"
            size="md"
            collapseLabel
          />

          {hasTranslatable && (
            <TranslatePaperButton
              title={paper.title}
              abstract={paper.abstract}
              hasCache={!!zh}
              showingTranslated={showZh}
              onTranslated={(r) => {
                setZh(r);
                setShowZh(true);
              }}
              onToggle={() => setShowZh((v) => !v)}
              variant="chip"
              size="md"
              collapseLabel
            />
          )}

          {embedMode && !hideStage && (
            <PdfChatPaperButton
              active={isPdfChatActive}
              onClick={() =>
                openPdfChat({
                  ensureStaged: () => {
                    if (!isStaged) onToggleStage();
                  },
                })
              }
              collapseLabel
            />
          )}

          <button
            type="button"
            onClick={onFold}
            className="hidden group-hover:inline-flex group-focus-within:inline-flex ml-auto items-center justify-center gap-1 h-6 px-2 rounded-sm border border-border text-xs text-subtle whitespace-nowrap shrink-0 hover:bg-surface-1 hover:text-foreground transition-colors @max-[260px]:w-6 @max-[260px]:px-0 @max-[260px]:gap-0"
            title="把这张卡折叠成单行"
          >
            <Minimize2 className="size-2.5 shrink-0" strokeWidth={2.5} />
            <span className="@max-[260px]:hidden">折叠</span>
          </button>
        </div>
      </div>
    </article>
  );
}
