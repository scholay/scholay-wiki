import { lazy, memo, Suspense, useEffect, useRef, useState } from 'react';
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
import { pickEffectiveFields } from '@/shared/lib/pick-field';
import { useUnlinkPaper } from '../../api/relink';

// 统一工作台弹窗的「管理」语境(元数据 / PDF / 在线关联三 tab)—— lazy + 条件
// mount:用户没点 chip 上任一动作前根本不下载也不实例化,首屏轻很多。
const PaperWorkbenchDialog = lazy(() =>
  import('../PaperWorkbenchDialog').then((m) => ({ default: m.PaperWorkbenchDialog })),
);
import type { ManageTab } from '../PaperWorkbenchDialog';
import { AuthorsRow } from './AuthorsRow';
import { MetaRow } from './MetaRow';
import { RowActionsMenu } from './RowActionsMenu';
import { BasicInfoChip } from './chips/BasicInfoChip';
import { PdfChip } from './chips/PdfChip';
import { formatAddedDate, formatAddedDateFull } from './format-added-date';

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
  const addedDateFull = formatAddedDateFull(paper.created_at);

  // 统一管理弹窗:chip 上的"在线关联 / 编辑 / 换 PDF"都开它,只是 initialTab 不同。
  //
  // ⚠️ Radix 铁律(见 frontend CLAUDE.md):Dialog 绝不能在 open 仍为 true 时被
  // unmount(body pointer-events 锁泄漏 → 全站点击失灵)。这里「先关再卸」:manageOpen
  // 只控 open;关闭先置 false 让 Radix 跑清理,延一拍再卸 lazy 组件(manageMounted);
  // manageSeq 作 key 保证延迟窗口内重开也 remount 拿到新 initialTab。
  const [manageOpen, setManageOpen] = useState(false);
  const [manageMounted, setManageMounted] = useState(false);
  const [manageSeq, setManageSeq] = useState(0);
  const [manageTab, setManageTab] = useState<ManageTab>('metadata');
  const manageCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openManage = (tab: ManageTab) => {
    if (manageCloseTimer.current) {
      clearTimeout(manageCloseTimer.current);
      manageCloseTimer.current = null;
    }
    setManageTab(tab);
    setManageSeq((n) => n + 1);
    setManageMounted(true);
    setManageOpen(true);
  };
  const closeManage = () => {
    setManageOpen(false);
    if (manageCloseTimer.current) clearTimeout(manageCloseTimer.current);
    manageCloseTimer.current = setTimeout(() => setManageMounted(false), 250);
  };
  useEffect(
    () => () => {
      if (manageCloseTimer.current) clearTimeout(manageCloseTimer.current);
    },
    []
  );

  // 取消关联:后端快照式 unlink —— og 空字段自动固化当前展示值再清上游元数据,
  // 显示内容不变,行退回 free。是直接动作(非弹窗),先确认再调。
  const unlinkMut = useUnlinkPaper();
  const confirm = useConfirm();
  const apiToast = useApiToast();
  const handleUnlink = async () => {
    const ok = await confirm({
      title: '取消关联?',
      description:
        '取消后,这篇文献的信息和 PDF 都会保留,只是不再关联在线论文;随时可以重新关联。',
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
          'shrink-0 mt-1 inline-flex h-4 w-4 items-center justify-center rounded-4 border transition-all cursor-pointer',
          selected
            ? 'bg-brand-red border-brand-red text-on-brand opacity-100'
            : 'bg-surface-card border-border-strong text-transparent opacity-0 group-hover:opacity-100 hover:!border-foreground'
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
            className="flex-1 min-w-0 text-15 font-semibold text-foreground hover:text-brand-red transition-colors line-clamp-2 cursor-pointer"
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
            className="text-xs text-subtle leading-paragraph"
            popoverClassName="max-w-md text-xs leading-paragraph"
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
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-8 border border-brand-amber/50 text-2xs font-semibold text-brand-amber hover:bg-brand-amber/[0.05] transition-colors shrink-0"
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
            <span
              className="ml-auto text-2xs text-faint"
              title={`加入于 ${addedDateFull}`}
            >
              加入于 {addedDate}
            </span>
          )}
        </div>
      </div>

      {/* 统一工作台弹窗 ·「管理」语境 —— lazy + 延迟卸载(先关再卸,见上):
          首次打开才下载 chunk;open 由 manageOpen 控制,manageMounted 控挂载。
          弹窗内部用 by-upstream 订阅行数据保活,PATCH 后不会读到这里的陈旧 paper。
          (linked 行的"取消关联"是 chip 菜单的 onUnlink 直接动作,不走本弹窗。) */}
      {manageMounted && (
        <Suspense fallback={null}>
          <PaperWorkbenchDialog
            key={manageSeq}
            open={manageOpen}
            onOpenChange={(v) => !v && closeManage()}
            initial={{ mode: 'manage', paper, tab: manageTab }}
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
        className="shrink-0 mt-0.5 inline-flex items-center h-4 px-1.5 rounded-4 bg-surface-2 text-faint text-2xs font-bold"
        title="这篇文献还没有关联在线论文,内容由你自己维护"
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
