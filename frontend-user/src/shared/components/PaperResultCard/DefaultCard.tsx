import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Minimize2 } from 'lucide-react';
import { isModifiedClick, paperPath, useOpenPaperInBrowser } from '@/shared/hooks';
import { TruncatedText } from '@/shared/components/TruncatedText';
import { FavoritePaperButton } from '@/shared/components/FavoritePaperButton';
import { TranslatePaperButton } from '@/shared/components/TranslatePaperButton';
import { cn } from '@/shared/lib/utils';
import type { Paper } from '@/shared/api/types';
import type { JournalEnrichment } from '@/shared/api/journal-enrichment';
import { type TranslatePaperResult } from '@/shared/api/translate';
import { MetaLine } from './MetaLine';
import { StageToggle } from './StageToggle';
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
  readOnly = false,
}: {
  paper: Paper;
  isStaged: boolean;
  isFavorited: boolean;
  journalEnrichment?: JournalEnrichment | null;
  onToggleStage: () => void;
  onFold: () => void;
  highlightQuery?: string;
  hideStage?: boolean;
  readOnly?: boolean;
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
      {/* 标题行:行首暂存开关 + 标题。
          (原先右上角挂着「OA PDF」绿色胶囊,2026-07-27 已移进下方 action 行、改名「文档」——
           它本质是和收藏/翻译并列的一个卡片动作,不该单独占标题行的右上角。)
          ⚠️ 暂存开关放在**行首**而不是底部 action 行,是为了与折叠态 StagedRow 对齐 ——
             两边都是 px-3.5 + gap-2、控件都在行首,margin box 同为 14→30、标题同从 38 起。
             于是点击暂存、卡片收成一行时,这颗控件**原地不动**,只是空心变实心。
             (原先它是底部 action 行里一颗带文案的红/绿胶囊,与折叠态那颗绿点毫无关联。) */}
      <div className="flex items-start gap-2">
        {/* 外面这层 span 的作用是**把开关精确压在标题首行的中线上**。
            高度 = calc(--leading-sans × 1em),在 text-14 下正好等于 h3 首行的行盒(14×1.25=17.5px),
            再 items-center 居中 —— 于是无论标题一行还是多行,开关永远对齐第一行。

            为什么不靠 items-start 直接摆:那样得依赖"16px 控件 ≈ 17.5px 行盒"这种算术巧合,
            数字锁死在我假设的行高上,--leading-sans 或字号一改就悄悄错位、还没人会发现。
            这里改成引用 token 本身,行高变了对齐自动跟着变。
            用 em 而不是 CSS 的 lh 单位:em 是全兼容的,lh 要 Chrome109/Safari16.4/FF120 才有。 */}
        {!hideStage && (
          <span className="flex h-[calc(var(--leading-sans)*1em)] shrink-0 items-center text-14">
            <StageToggle staged={isStaged} title={displayTitle || '无标题'} onToggle={onToggleStage} />
          </span>
        )}
        {/* 标题是真实 <a href>(SEO 硬约束:水合后的 DOM 必须保留内链)。
            平点 = <Link> SPA 导航;handler 只做副作用(store 写 tab + 热点上报),
            不 preventDefault / 不 navigate;修饰键点击整个让给浏览器(新标签)。 */}
        <h3 className="flex-1 min-w-0 text-14 font-medium text-foreground">
          <Link
            to={paperPath(paper)}
            onClick={(e) => {
              if (isModifiedClick(e)) return;
              openPaper.prepare(paper);
            }}
            className="cursor-pointer hover:text-brand-red transition-colors"
            title="打开论文详情"
          >
            {highlightQuery && !showZh
              ? renderHighlight(displayTitle, highlightQuery)
              : displayTitle || '无标题'}
          </Link>
        </h3>
      </div>
      <MetaLine paper={paper} journalEnrichment={journalEnrichment} />
      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {tags.map((t) => (
            <span
              key={t.key}
              className={cn(
                /* 胶囊 + h-5:形状按 Figma §4.2(设计稿 Badge 是 46×23 胶囊),
                   h-5(20px)取代原先的 arbitrary value h-[18px]。
                   px-2 = Figma 的 padding 4px 8px 的横向值。
                   对比度依据见 tags.tsx 头注释,每一档都实算过。 */
                'inline-flex h-5 items-center rounded-pill px-2 text-12',
                // 顶级(Q1 / 1区 / CCF A)—— 描边 70% 才够 3:1,松青实测 3.94:1
                t.tone === 'tier-high' && 'border border-brand-green/70 text-brand-green font-medium',
                // 中档(Q2 / 2区 / CCF B)—— 不能用原色琥珀:它做描边 100% 也才 1.92:1
                t.tone === 'tier-mid' && 'border border-amber-soft-fg text-amber-soft-fg font-medium',
                // 中性:Q3-4 / IF / 引用数
                t.tone === 'neutral' && 'border border-faint text-subtle',
                // 唯一实底 —— 预警期刊
                t.tone === 'alert' && 'bg-brand-red text-on-brand font-medium',
                // 学科:最弱信号,不给 chip,只留 faint 文字
                t.tone === 'field' && 'px-0 text-faint'
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
        {!readOnly && (
          <FavoritePaperButton
            paper={paper}
            isFavorited={isFavorited}
            variant="chip"
            size="md"
            collapseLabel
          />
        )}

        {/* 文档 —— 上游 openAccessPdf.url 的直链(开放获取原文)。
            2026-07-27 从标题行右上角搬到这里,夹在「收藏」与「AI 翻译」之间:
            它本质就是一个和它们并列的卡片动作,单独占标题行会让标题区多一个视觉重心。
            样式**逐项对齐** FavoritePaperButton 的 chip idle 态(h-6 px-2.5 text-12 gap-1
            rounded-8 border-border text-subtle),而不是原来那身松青描边 —— 三颗按钮现在长一样。

            图标用 FileText:lucide **没有** PDF 专用图标,而 Adobe 那枚红色 PDF 标是注册商标,
            复刻进产品有法律风险;FileText 是本仓库既有的文档图标(全站 90 处),不另造一套。
            仍是 <a target="_blank">,新窗口打开这件事写在 title 里(图标本身不再带外链箭头)。 */}
        {oaPdfUrl && (
          <a
            href={oaPdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="查看开放获取原文 PDF(新窗口打开)"
            className="inline-flex h-6 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-8 border border-border px-2.5 text-12 text-subtle transition-colors hover:bg-surface-1 hover:text-foreground @max-[260px]:w-6 @max-[260px]:gap-0 @max-[260px]:px-0"
          >
            <FileText className="size-3 shrink-0" strokeWidth={2.2} />
            <span className="@max-[260px]:hidden">原文链接</span>
          </a>
        )}

        {!readOnly && hasTranslatable && (
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
