import { File as FileIcon } from 'lucide-react';
import { useOpenPdfDetail } from '@/shared/hooks/useOpenInSearchPanel';
import { libraryRowHasUploadedPdf } from '@/shared/lib/paper-pdf';
import { cn } from '@/shared/lib/utils';
import type { Paper, UserLibraryPaper } from '@/shared/api/types';
import {
  STATUS_CHIP_RAIL_SHELL,
  STATUS_CHIP_SHELL,
  STATUS_CHIP_TONE,
} from './status-chip-styles';

function scholarPdfSearchUrl(title: string): string {
  return `https://scholar.google.com/scholar?q=${encodeURIComponent(title)}`;
}

/**
 * 检索卡 / 详情上的 PDF 入口。外观以文献集 StatusChip 为准:
 *   已上传 → 绿「PDF」;否则灰「PDF·缺失」。
 * 点击仍是检索侧动作(打开已上传 / 打开 OA / 查找),不做文献集管理菜单。
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
  const complete = hasUpload;
  const tone = complete ? STATUS_CHIP_TONE.complete : STATUS_CHIP_TONE.missing;
  const label = complete ? 'PDF' : 'PDF·缺失';
  const labelCls = !isRail && collapseLabel ? '@max-[260px]:hidden' : undefined;
  const shell = isRail ? STATUS_CHIP_RAIL_SHELL : STATUS_CHIP_SHELL;

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
        className={cn(shell, tone, className)}
      >
        <FileIcon className="size-3" strokeWidth={2} />
        <span className={cn('text-12 font-medium whitespace-nowrap', labelCls)}>
          {label}
        </span>
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
        className={cn(shell, tone, className)}
      >
        <FileIcon className="size-3" strokeWidth={2} />
        <span className={cn('text-12 font-medium whitespace-nowrap', labelCls)}>
          {label}
        </span>
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
      className={cn(shell, tone, className)}
    >
      <FileIcon className="size-3" strokeWidth={2} />
      <span className={cn('text-12 font-medium whitespace-nowrap', labelCls)}>
        {label}
      </span>
    </button>
  );
}
