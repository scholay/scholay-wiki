import {
  ArrowUpRight,
  Download,
  FileText,
  Loader2,
  Quote,
} from 'lucide-react';
import { FavoritePaperButton } from '@/shared/components/FavoritePaperButton';
import { TranslatePaperButton } from '@/shared/components/TranslatePaperButton';
import {
  needsTranslation,
  type TranslatePaperResult,
} from '@/shared/api/translate';
import { useOpenPdfDetail } from '@/shared/hooks';
import { cn } from '@/shared/lib/utils';
import type { Paper, UserLibraryPaper } from '@/shared/api/types';

/**
 * Hero 第三层 —— 我的 PDF / OA / 原始链接 / 引用 / 笔记 + 收藏 + AI 翻译。
 *
 * 内部一组 link 式 action(由静态数组渲染),收藏 / 翻译走对应共享组件。
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
  const pdfUrl =
    paper.openAccessPdf?.url || (paper.isOpenAccess ? paper.url : undefined);
  const origin = paper.url;

  const hasUploadedPdf = !!libRow?.pdf_uploaded_at;
  const isFavorited = !!libRow;
  // 翻译按钮仅当 ORIGINAL paper 含可翻译文字时显示;不能用 displayPaper 否则
  // 已切到中文时按钮会消失。
  const canTranslate =
    needsTranslation(paper.title) || needsTranslation(paper.abstract);

  const openPdf = useOpenPdfDetail();
  const handleViewPdf = () => {
    if (!libRow) return;
    openPdf({ libPaperId: libRow.id, title: paper.title || '无标题' });
  };

  // 静态 link 式 actions(href / onClick 二选一,可选 primary / loading)
  // —— 收藏 / 翻译 已下沉到 FavoritePaperButton / TranslatePaperButton,不在这里
  const actions: Array<{
    label: string;
    icon: typeof Download;
    href?: string;
    onClick?: () => void;
    primary?: boolean;
    loading?: boolean;
  }> = [
    hasUploadedPdf
      ? {
          label: '查看 PDF',
          icon: FileText,
          onClick: handleViewPdf,
          primary: true,
        }
      : null,
    pdfUrl
      ? {
          label: 'OA 原文',
          icon: Download,
          href: pdfUrl,
          primary: !hasUploadedPdf,
        }
      : null,
    // 上游论文页 —— 用通用文案"原始链接",对终端用户不暴露 stc/olx/pmd 品牌名
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
    // 笔记功能暂未实现 —— 等研究论坛 / 笔记模块上线后再加回
  ].filter((a): a is NonNullable<typeof a> => a !== null);

  return (
    <div className="space-y-4">
      <div className="flex items-center flex-wrap gap-x-3 gap-y-2 text-sm">
        {actions.map((a, idx) => {
          const Icon = a.icon;
          const inner = (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 text-sm transition-colors',
                a.primary
                  ? 'font-bold text-foreground hover:text-brand-red'
                  : 'font-medium text-foreground hover:text-brand-red',
                a.loading && 'opacity-70 cursor-not-allowed'
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
              {idx > 0 && <span className="text-border-strong">·</span>}
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

        {/* 收藏 —— link 变体,与上面 actions 视觉一致;非上游 source('local') 不展示 */}
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

        {/* AI 翻译 —— 仅含拉丁字母时显示 */}
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
