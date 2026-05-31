import { lazy, memo, Suspense, useState } from 'react';
import { Check, Quote } from 'lucide-react';
import { toast } from 'sonner';
import { CitationDialog } from '@/shared/components/CitationDialog';
import { useConfirm } from '@/shared/components/ConfirmDialog';
import { SourceBadge } from '@/shared/components/SourceBadge';
import { TranslatePaperButton } from '@/shared/components/TranslatePaperButton';
import { TruncatedText } from '@/shared/components/TruncatedText';
import {
  useApiToast,
  useOpenJournalInBrowser,
  useOpenPaperInBrowser,
  useOpenPdfInBrowser,
} from '@/shared/hooks';
import type { JournalEnrichment } from '@/shared/api/journal-enrichment';
import {
  needsTranslation,
  type TranslatePaperResult,
} from '@/shared/api/translate';
import type {
  PaperAuthor,
  UpstreamSource,
  UserLibraryPaper,
} from '@/shared/api/types';
import { cn } from '@/shared/lib/utils';
import { pickEffectiveFields } from '../../lib/pick-field';
import { useUnlinkPaper } from '../../api/relink';

// 统一管理弹窗(在线关联 / 元数据 / PDF 三 tab)—— lazy + 条件 mount:用户没点
// chip 上任一动作前根本不下载也不实例化,首屏轻很多。
const PaperManageDialog = lazy(() =>
  import('../PaperManageDialog').then((m) => ({ default: m.PaperManageDialog })),
);
import type { ManageTab } from '../PaperManageDialog';
import { AuthorsRow } from './AuthorsRow';
import { MetaRow } from './MetaRow';
import { RowActionsMenu } from './RowActionsMenu';
import { BasicInfoChip } from './chips/BasicInfoChip';
import { PdfChip } from './chips/PdfChip';
import { formatAddedDate } from './format-added-date';

interface RowProps {
  paper: UserLibraryPaper;
  rowIndex: number;
  journalEnrichment?: JournalEnrichment | null;
  selected: boolean;
  onToggle: (paperId: number, idx: number, shift: boolean) => void;
}

/**
 * 文献集单行 —— 5 段竖排:[TypeBadge + title] / meta / abstract / 主操作 / 次操作。
 *
 * **主操作三种模式**(按 (link_state, origin) 分流):
 *
 *  A) linked + search   ← 从搜索/详情/QuickAdd 收藏来的上游论文
 *      type badge:  D/G/M (SourceBadge)
 *      status chip: 「无 PDF」 / 「PDF ✅」
 *      primary btn: 「补充 PDF」 / 「更换/移除 PDF」 → PdfUploadDialog
 *
 *  B) linked + upload   ← 用户先上传了 PDF,系统/用户后期关联到上游
 *      type badge:  D/G/M (SourceBadge)
 *      status chip: 「已关联」
 *      primary btn: 「编辑/移除论文」 → RelinkDialog(isLinked=true,带"移除关联")
 *
 *  C) free + upload     ← 用户上传 PDF 后没匹配到上游(本地文件)
 *      type badge:  「本地」
 *      status chip: 「无关联」
 *      primary btn: 「关联论文」 → RelinkDialog(isLinked=false)
 *
 * 次操作:我的 PDF 预览(若 uploaded)/ 引用 / OA 原文 / AI 翻译 —— 与模式无关。
 *
 * memo 化:父级用 enrichments Map 渲染列表;onToggle 父级稳定引用,行内传 id+idx。
 */
export const LibraryPaperRow = memo(function LibraryPaperRow({
  paper,
  rowIndex,
  journalEnrichment,
  selected,
  onToggle,
}: RowProps) {
  const openPaper = useOpenPaperInBrowser();
  const openJournal = useOpenJournalInBrowser();
  const openPdf = useOpenPdfInBrowser();

  // AI 翻译:与搜索页 DefaultCard 同款
  const [zh, setZh] = useState<TranslatePaperResult | null>(null);
  const [showZh, setShowZh] = useState(false);

  const isFree = paper.link_state === 'free';
  // 统一过 pickEffectiveFields —— og 优先 → 元数据 → 空。
  // 与"自由文件 / linked"无关, 所有行同一规则: 用户编辑的 (or PDF 抽到的) og_*
  // 比上游元数据优先级高。
  const eff = pickEffectiveFields(paper);
  const effectiveTitle = eff.title;
  const effectiveAbstract = eff.abstract;
  const effectiveYear = eff.year;
  const effectiveVenue = eff.venue;
  const effectiveDoi = eff.doi;
  const effectiveAuthors: PaperAuthor[] = eff.authors;

  const canTranslate =
    needsTranslation(effectiveTitle) || needsTranslation(effectiveAbstract);
  const displayTitle = showZh && zh?.title_zh ? zh.title_zh : effectiveTitle;
  const displayAbstract =
    showZh && zh?.abstract_zh ? zh.abstract_zh : effectiveAbstract;

  const openDetail = () => {
    openPaper({
      paperId: paper.source_paper_id,
      title: effectiveTitle,
      abstract: effectiveAbstract,
      year: effectiveYear,
      venue: effectiveVenue,
      citationCount: paper.citation_count,
      source: paper.source,
    });
  };

  const [citeOpen, setCiteOpen] = useState(false);
  const handleOpenCitation = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCiteOpen(true);
  };

  const addedDate = formatAddedDate(paper.created_at);

  // 统一管理弹窗:chip 上的"在线关联 / 编辑 / 换 PDF"都开它,只是 initialTab 不同。
  const [manageOpen, setManageOpen] = useState(false);
  const [manageTab, setManageTab] = useState<ManageTab>('metadata');
  const openManage = (tab: ManageTab) => {
    setManageTab(tab);
    setManageOpen(true);
  };

  // 取消关联:清上游元数据、退回 free,只保留 og_*。是直接动作(非弹窗),先确认再调。
  const unlinkMut = useUnlinkPaper();
  const confirm = useConfirm();
  const apiToast = useApiToast();
  const handleUnlink = async () => {
    const ok = await confirm({
      title: '取消关联?',
      description:
        '将清除该论文的上游元数据(标题/摘要/作者/期刊/DOI 等),仅保留你本地编辑或识别的信息;可随时重新在线关联。',
      confirmText: '取消关联',
    });
    if (!ok) return;
    unlinkMut.mutate(paper.id, {
      onSuccess: () => toast.success('已取消关联'),
      onError: (err) => apiToast.show(err, '取消关联失败'),
    });
  };

  return (
    <li
      className={cn(
        'group relative flex items-start gap-3 py-3.5 transition-colors pl-4',
        'before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:transition-colors',
        selected
          ? 'bg-danger-soft/40 before:bg-brand-red'
          : 'before:bg-transparent'
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={selected}
        aria-label={selected ? '取消选择该论文' : '选择该论文'}
        onClick={(e) => {
          e.stopPropagation();
          onToggle(paper.id, rowIndex, e.shiftKey);
        }}
        className={cn(
          'shrink-0 mt-1 inline-flex h-4 w-4 items-center justify-center rounded-sm border transition-all cursor-pointer',
          selected
            ? 'bg-brand-red border-brand-red text-white opacity-100'
            : 'bg-background border-border-strong text-transparent opacity-0 group-hover:opacity-100 hover:!border-foreground'
        )}
      >
        {selected && <Check className="size-3" strokeWidth={3} />}
      </button>

      <div className="flex-1 min-w-0 space-y-2">
        {/* 标题行 —— 左侧贴一颗类型徽章(D/G/M 或 本地),与标题同基线 */}
        <div className="flex items-start gap-2">
          <TypeBadge isFree={isFree} source={paper.source as UpstreamSource | 'local'} />
          <h3
            onClick={openDetail}
            className="flex-1 min-w-0 text-15 font-semibold leading-[1.4] text-foreground hover:text-brand-red transition-colors line-clamp-2 cursor-pointer"
            title="打开论文详情"
          >
            {displayTitle || '无标题'}
          </h3>
        </div>

        <AuthorsRow authors={effectiveAuthors} paperSource={paper.source} />

        <MetaRow
          doi={effectiveDoi}
          venue={effectiveVenue}
          year={effectiveYear}
          enrichment={journalEnrichment}
          onClickVenue={
            journalEnrichment?.id
              ? (e) => {
                  e.stopPropagation();
                  openJournal({
                    id: journalEnrichment.id,
                    canonical_name:
                      journalEnrichment.canonical_name ?? paper.venue ?? '',
                    jcr_quartile: journalEnrichment.jcr_quartile,
                    jcr_impact_factor: journalEnrichment.jcr_impact_factor,
                    fqb_quartile: journalEnrichment.fqb_quartile,
                    ccf_rank: journalEnrichment.ccf_rank,
                    openalex_h_index: journalEnrichment.openalex_h_index,
                    gjqk_warning: journalEnrichment.gjqk_warning,
                    is_oa: journalEnrichment.is_oa,
                  });
                }
              : undefined
          }
        />

        {displayAbstract && (
          <TruncatedText
            lines={2}
            className="text-xs text-subtle leading-[1.7]"
            popoverClassName="max-w-md text-xs leading-relaxed"
          >
            {displayAbstract}
          </TruncatedText>
        )}

        {/* 主操作行 —— 对照 .pen `of4Xd`:
            [基础信息 ✓ ▼]  [PDF ✓ ▼]  [引用]  [AI 翻译]   […]   加入于 X
            前两个是 hover-checklist 状态徽章 (chips/StatusChip), 后面是操作按钮。
            上传 PDF / 关联 / 编辑等"动作"都进了三点菜单 (RowActionsMenu), 卡片不堆 CTA。 */}
        <div className="flex items-center flex-wrap gap-x-2 gap-y-1.5 pt-0.5">
          {/* 状态徽章 —— hover 弹检查清单, click 弹操作菜单 (菜单项按 status 切换) */}
          <BasicInfoChip
            paper={paper}
            onEdit={() => openManage('metadata')}
            onRelink={() => openManage('relink')}
            onUnlink={handleUnlink}
          />
          <PdfChip
            paper={paper}
            onViewPdf={() =>
              openPdf({ libPaperId: paper.id, title: effectiveTitle || '无标题' })
            }
            onUploadPdf={() => openManage('pdf')}
          />

          {/* 操作徽章: 引用 (amber outline) */}
          <button
            type="button"
            onClick={handleOpenCitation}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-sm border border-brand-amber/50 text-2xs font-semibold text-brand-amber hover:bg-brand-amber/[0.05] transition-colors shrink-0"
            title="查看引用格式"
          >
            <Quote className="size-3" strokeWidth={2} />
            引用
          </button>

          {/* 操作徽章: AI 翻译 (灰 outline) */}
          {canTranslate && (
            <TranslatePaperButton
              title={effectiveTitle}
              abstract={effectiveAbstract}
              hasCache={!!zh}
              showingTranslated={showZh}
              onTranslated={(r) => {
                setZh(r);
                setShowZh(true);
              }}
              onToggle={() => setShowZh((v) => !v)}
              variant="chip"
              size="sm"
            />
          )}

          {/* 三点菜单: 编辑信息 / 上传 PDF / 关联 / 转移 / 删除 / 选中 */}
          {/* 三点菜单只保留行级"卷宗操作": 转移文件夹 / 删除 / 选中。
             编辑信息 / 上传 PDF / 在线关联 全部走 chip 的 click 菜单, 不重复入口。 */}
          <RowActionsMenu
            paperId={paper.id}
            rowIndex={rowIndex}
            currentFilter={paper.folder_id ?? 'root'}
            isSelected={selected}
            onToggle={onToggle}
          />

          {addedDate && (
            <span className="ml-auto text-2xs text-faint">加入于 {addedDate}</span>
          )}
        </div>
      </div>

      {/* 统一管理弹窗(在线关联 / 元数据 / PDF 三 tab)—— lazy + 条件 mount:
          open=false 时 chunk 不下载,open=true 才走 Suspense。各入口 chip 通过 manageTab 指定初始 tab。
          (linked 行的"取消关联"是 chip 菜单的 onUnlink 直接动作,不走本弹窗。) */}
      {manageOpen && (
        <Suspense fallback={null}>
          <PaperManageDialog
            open
            onOpenChange={setManageOpen}
            paper={paper}
            initialTab={manageTab}
          />
        </Suspense>
      )}

      <CitationDialog
        open={citeOpen}
        onOpenChange={setCiteOpen}
        paper={{
          title: effectiveTitle,
          year: effectiveYear,
          venue: effectiveVenue,
          authors: effectiveAuthors,
        }}
      />
    </li>
  );
});

// ============================================================================
// 子组件
// ============================================================================

/**
 * 类型徽章 —— 紧贴标题左侧:
 *   linked → 复用 SourceBadge(D/G/M 三字母,带 hover tooltip)
 *   free   → 「本地」灰底标签
 */
function TypeBadge({
  isFree,
  source,
}: {
  isFree: boolean;
  source: UpstreamSource | 'local';
}) {
  if (isFree || source === 'local') {
    return (
      <span
        className="shrink-0 mt-0.5 inline-flex items-center h-4 px-1.5 rounded-sm bg-surface-2 text-faint text-2xs font-bold"
        title="本地文件 —— 用户上传的 PDF,未关联到上游论文"
      >
        本地
      </span>
    );
  }
  return (
    <span className="shrink-0 mt-0.5">
      <SourceBadge source={source as UpstreamSource} variant="letter" size="sm" />
    </span>
  );
}

// (StatusChip / PrimaryButton 已移到 chips/StatusChip.tsx, 这里删掉旧本地版本)
