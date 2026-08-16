import { OpenAccessMark } from '@/shared/components/brand/OpenAccessMark';
import { useOpenPdfDetail } from '@/shared/hooks/useOpenInSearchPanel';
import { libraryRowHasUploadedPdf } from '@/shared/lib/paper-pdf';
import { cn } from '@/shared/lib/utils';
import type { Paper, UserLibraryPaper } from '@/shared/api/types';

const PDF_CHIP_CLS =
  'inline-flex items-center justify-center rounded-sm border shrink-0 whitespace-nowrap font-semibold transition-colors h-6 px-2.5 text-xs gap-1.5 @max-[260px]:w-6 @max-[260px]:px-0 @max-[260px]:gap-0 border-brand-red bg-brand-red text-white hover:bg-brand-red/90';

const PDF_RAIL_CLS =
  'inline-flex h-7 w-full items-center justify-center rounded-8 border font-medium transition-colors px-1.5 text-12 gap-1';

const PDF_RAIL_READY =
  'border-brand-red bg-brand-red text-white hover:bg-brand-red/90';

const PDF_RAIL_NONE =
  'border-border bg-background text-subtle hover:bg-surface-1 hover:text-foreground';

function scholarPdfSearchUrl(title: string): string {
  return `https://scholar.google.com/scholar?q=${encodeURIComponent(title)}`;
}

/**
 * Paper PDF status chip — same control on result cards and paper detail.
 *   Scholay = uploaded to this account · OA = open-access URL · None = not found
 */
export function PaperPdfChip({
  paper,
  libRow,
  onFindPdf,
  collapseLabel = false,
  layout = 'chip',
  className,
}: {
  paper: Paper;
  libRow?: UserLibraryPaper | null;
  /** Override the None-state action (search page opens PDF Chat). */
  onFindPdf?: () => void;
  collapseLabel?: boolean;
  /** `rail` = fixed-width file-area button; `chip` = inline result-card control. */
  layout?: 'chip' | 'rail';
  className?: string;
}) {
  const openPdfDetail = useOpenPdfDetail();
  const oaPdfUrl = paper.openAccessPdf?.url?.trim();
  const hasUpload = libraryRowHasUploadedPdf(libRow);
  const isRail = layout === 'rail';
  const labelCls = !isRail && collapseLabel ? '@max-[260px]:hidden' : undefined;
  const readyCls = isRail ? cn(PDF_RAIL_CLS, PDF_RAIL_READY) : PDF_CHIP_CLS;
  const noneCls = isRail ? cn(PDF_RAIL_CLS, PDF_RAIL_NONE) : PDF_CHIP_CLS;

  const handleFindPdf = () => {
    if (onFindPdf) {
      onFindPdf();
      return;
    }
    const q = paper.title?.trim();
    if (!q) return;
    window.open(scholarPdfSearchUrl(q), '_blank', 'noopener,noreferrer');
  };

  if (hasUpload && libRow) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          openPdfDetail({
            libPaperId: libRow.id,
            title: paper.title || '无标题',
          });
        }}
        title="打开系统内已保存的 PDF"
        className={cn(readyCls, className)}
      >
        <OpenAccessMark width={13} height={13} />
        <span className={labelCls}>Scholay</span>
      </button>
    );
  }

  if (oaPdfUrl) {
    return (
      <a
        href={oaPdfUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        title="查看 Open Access 原始 PDF(新窗口)"
        className={cn(readyCls, className)}
      >
        <OpenAccessMark width={13} height={13} />
        <span className={labelCls}>OA</span>
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        handleFindPdf();
      }}
      title="查找这篇论文的 PDF"
      className={cn(noneCls, className)}
    >
      <OpenAccessMark width={13} height={13} />
      <span className={labelCls}>{isRail ? 'Search' : 'None'}</span>
    </button>
  );
}
