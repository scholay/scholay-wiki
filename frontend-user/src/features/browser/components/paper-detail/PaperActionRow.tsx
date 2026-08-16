import {
  ArrowUpRight,
  Loader2,
  Quote,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { FavoritePaperButton } from '@/shared/components/FavoritePaperButton';
import { PdfChatPaperButton } from '@/shared/components/PdfChatPaperButton';
import { TranslatePaperButton } from '@/shared/components/TranslatePaperButton';
import {
  needsTranslation,
  type TranslatePaperResult,
} from '@/shared/api/translate';
import { useOpenPdfChat } from '@/shared/hooks/useOpenInSearchPanel';
import { paperHasReadablePdf } from '@/shared/lib/paper-pdf';
import { cn } from '@/shared/lib/utils';
import { usePdfChatBridge } from '@/stores/pdf-chat-bridge.store';
import { useSearchRightPanelStore } from '@/stores/search-right-panel.store';
import type { Paper, UserLibraryPaper } from '@/shared/api/types';

/**
 * Hero 第三层 —— PDF Chat / 原始链接 / 引用 + 收藏 + AI 翻译。
 *
 * PDF 状态芯片(Scholay / OA / None)在 metadata「开放」行,见 PaperMetadataBlock。
 */
export function PaperActionRow({
  paper,
  libRow,
  zh,
  showZh,
  onTranslated,
  onToggleZh,
}: {
  paper: Paper;
  libRow: UserLibraryPaper | null;
  zh: TranslatePaperResult | null;
  showZh: boolean;
  onTranslated: (r: TranslatePaperResult) => void;
  onToggleZh: () => void;
}) {
  const origin = paper.url;
  const navigate = useNavigate();
  const embedMode = useSearchRightPanelStore((s) => s.embedMode);
  const openPdfChat = useOpenPdfChat();
  const setActiveFunction = useSearchRightPanelStore((s) => s.setActiveFunction);
  const beginPdfChat = usePdfChatBridge((s) => s.beginPdfChat);

  const isFavorited = !!libRow;
  const canTranslate =
    needsTranslation(paper.title) || needsTranslation(paper.abstract);
  const needsUpload = !paperHasReadablePdf(paper, libRow);

  const handlePdfChat = () => {
    if (embedMode) {
      openPdfChat({ paperId: paper.paperId });
      return;
    }
    beginPdfChat(paper);
    setActiveFunction('pdf-chat');
    navigate('/search?mode=smart');
  };

  const actions: Array<{
    label: string;
    icon: typeof ArrowUpRight;
    href?: string;
    onClick?: () => void;
    loading?: boolean;
  }> = [
    origin
      ? {
          label: '原始链接',
          icon: ArrowUpRight,
          href: origin,
        }
      : null,
    {
      label: '引用',
      icon: Quote,
      onClick: () => {
        document
          .getElementById('cite-block')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
    },
  ].filter((a): a is NonNullable<typeof a> => a !== null);

  return (
    <div className="space-y-4">
      <div className="flex items-center flex-wrap gap-x-3 gap-y-2 text-12">
        <PdfChatPaperButton
          onClick={handlePdfChat}
          needsUpload={needsUpload}
          size="md"
        />

        {actions.map((a) => {
          const Icon = a.icon;
          const inner = (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 text-12 font-normal text-subtle transition-colors hover:text-brand-red',
                a.loading && 'opacity-70 cursor-not-allowed',
              )}
            >
              {a.loading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Icon className="size-3.5" strokeWidth={2} />
              )}
              {a.label}
            </span>
          );
          return (
            <span key={a.label} className="inline-flex items-center gap-3">
              <span className="text-border-strong">·</span>
              {a.href ? (
                <a href={a.href} target="_blank" rel="noopener noreferrer">
                  {inner}
                </a>
              ) : (
                <button
                  type="button"
                  onClick={a.onClick}
                  disabled={a.loading}
                >
                  {inner}
                </button>
              )}
            </span>
          );
        })}

        {paper.source !== 'local' && (
          <span className="inline-flex items-center gap-3">
            <span className="text-border-strong">·</span>
            <FavoritePaperButton
              paper={paper}
              isFavorited={isFavorited}
              variant="link"
              size="md"
              showToast
            />
          </span>
        )}

        {canTranslate && (
          <span className="inline-flex items-center gap-3">
            <span className="text-border-strong">·</span>
            <TranslatePaperButton
              title={paper.title}
              abstract={paper.abstract}
              hasCache={!!zh}
              showingTranslated={showZh}
              onTranslated={onTranslated}
              onToggle={onToggleZh}
              variant="link"
              size="md"
            />
          </span>
        )}
      </div>
      <div className="h-px bg-border" />
    </div>
  );
}
