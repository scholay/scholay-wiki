import { useMemo, useState } from 'react';
import { Check, ExternalLink, Minimize2, Plus } from 'lucide-react';
import { useOpenPaperInBrowser } from '@/shared/hooks';
import { TruncatedText } from '@/shared/components/TruncatedText';
import { FavoritePaperButton } from '@/shared/components/FavoritePaperButton';
import { TranslatePaperButton } from '@/shared/components/TranslatePaperButton';
import { cn } from '@/shared/lib/utils';
import type { Paper } from '@/shared/api/types';
import type { JournalEnrichment } from '@/shared/api/journal-enrichment';
import { type TranslatePaperResult } from '@/shared/api/translate';
import { MetaLine } from './MetaLine';
import { needsTranslation, pickTags, renderHighlight } from './tags';

/**
 * 标准卡 — .pen `CMKIx`,论文搜索结果列表里默认形态。
 * 包含:标题 + OA PDF 按钮 + meta 行 + 期刊/引用 tags + 摘要 + 操作行。
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
  const openPaper = useOpenPaperInBrowser();
  // 翻译结果缓存:同一篇文章只跑一次,之后按钮在"原文"/"译文"间切换
  // 缓存留在父组件,因为 displayTitle/displayAbstract 需要 zh 数据
  const [zh, setZh] = useState<TranslatePaperResult | null>(null);
  const [showZh, setShowZh] = useState(false);

  // 只要标题或摘要存在英文/非汉字字母,就给翻译按钮
  const hasTranslatable = useMemo(
    () => needsTranslation(paper.title) || needsTranslation(paper.abstract),
    [paper.title, paper.abstract]
  );

  const displayTitle =
    showZh && zh?.title_zh ? zh.title_zh : (paper.title ?? '');
  const displayAbstract =
    showZh && zh?.abstract_zh ? zh.abstract_zh : (paper.abstract ?? '');

  // OA PDF 直链 —— 后端 minicod.Paper.openAccessPdf.url 透传
  const oaPdfUrl = paper.openAccessPdf?.url?.trim();

  return (
    <article
      data-paper-id={paper.paperId}
      className="group border-b border-border px-3.5 py-3.5"
    >
      {/* 标题行:标题撑空间,右上 OA PDF 按钮(若上游有 openAccessPdf.url) */}
      <div className="flex items-start gap-2">
        <h3
          onClick={() => openPaper(paper)}
          className="flex-1 min-w-0 text-14 font-medium text-foreground cursor-pointer hover:text-brand-red transition-colors"
          title="打开论文详情"
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
            className="shrink-0 inline-flex items-center gap-1 h-6 px-2 rounded-8 border border-brand-green/30 bg-brand-green/10 text-brand-green text-12 font-medium hover:bg-brand-green/15 transition-colors"
          >
            <ExternalLink className="size-2.5" strokeWidth={2.5} />
            OA PDF
          </a>
        )}
      </div>
      <MetaLine paper={paper} journalEnrichment={journalEnrichment} />
      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {tags.map((t) => (
            <span
              key={t.key}
              className={cn(
                'inline-flex items-center px-1.5 h-[18px] rounded-4 text-12 font-medium',
                t.tone === 'solid-green' && 'bg-brand-green text-on-brand',
                t.tone === 'solid-amber' && 'bg-brand-amber text-on-brand',
                t.tone === 'solid-red' && 'bg-brand-red text-on-brand',
                t.tone === 'red' && 'bg-danger-soft text-brand-red',
                t.tone === 'green' && 'bg-brand-green/10 text-brand-green',
                t.tone === 'blue' && 'bg-cat-blue-soft text-cat-blue',
                t.tone === 'neutral' && 'bg-surface-2 text-subtle font-medium'
              )}
            >
              {t.label}
            </span>
          ))}
        </div>
      )}
      {displayAbstract && (
        <TruncatedText
          lines={2}
          className="mt-2 text-12 text-subtle leading-paragraph"
        >
          {displayAbstract}
        </TruncatedText>
      )}
      {/* action 行 —— .pen `glM0G`:
         - @container:以本行宽度做容器查询基准。行 < 260px(≈卡片 < 288px,例如
           窄屏 / 智能搜索侧栏)时,所有按钮自动塌成"只剩图标",而不是让文案在按钮
           里换行(响应式降级)。容器查询 ⇒ 跟卡片真实宽度走,不依赖视口宽。
         - whitespace-nowrap + shrink-0:任何宽度下文案都不换行、按钮不被挤变形。
         - 折叠按钮平时不显,卡片 hover 才出(group / group-hover)。 */}
      <div className="@container mt-2.5 flex items-center gap-1.5">
        {!hideStage && (
          <button
            type="button"
            onClick={onToggleStage}
            aria-pressed={isStaged}
            className={cn(
              'inline-flex items-center justify-center gap-1 h-6 px-2.5 rounded-8 text-12 font-medium whitespace-nowrap shrink-0 transition-colors',
              // 窄容器:塌成 24×24 纯图标方块
              '@max-[260px]:w-6 @max-[260px]:px-0 @max-[260px]:gap-0',
              isStaged
                ? 'bg-brand-green text-on-brand hover:bg-brand-green/85'
                : 'bg-brand-red text-on-brand hover:bg-brand-red/90'
            )}
            title={isStaged ? '点击取消暂存' : '加入当前活跃暂存区'}
          >
            {isStaged ? (
              <Check className="size-3 shrink-0" strokeWidth={3} />
            ) : (
              <Plus className="size-3 shrink-0" strokeWidth={3} />
            )}
            <span className="@max-[260px]:hidden">{isStaged ? '已暂存' : '暂存'}</span>
          </button>
        )}

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

        {/* 折叠 —— 仅 hover / 键盘聚焦本卡时出现。用 display 切换(hidden→inline-flex)
            而非 opacity:idle 时彻底不占布局,所以它绝不会在窄卡片里反向撑出宽度 / 溢出;
            group-focus-within 保证键盘 tab 到卡内任一按钮时也能露出(可达性)。
            ml-auto 顶到行尾;窄容器同样塌成纯图标方块。 */}
        <button
          type="button"
          onClick={onFold}
          className="hidden group-hover:inline-flex group-focus-within:inline-flex ml-auto items-center justify-center gap-1 h-6 px-2 rounded-8 border border-border text-12 text-subtle whitespace-nowrap shrink-0 hover:bg-surface-1 hover:text-foreground transition-colors @max-[260px]:w-6 @max-[260px]:px-0 @max-[260px]:gap-0"
          title="把这张卡折叠成单行"
        >
          <Minimize2 className="size-2.5 shrink-0" strokeWidth={2.5} />
          <span className="@max-[260px]:hidden">折叠</span>
        </button>
      </div>
    </article>
  );
}
