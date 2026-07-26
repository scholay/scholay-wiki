import { useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  Info,
  Loader2,
  Sparkles,
  X,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useJournalEnrichments } from '@/shared/api/journal-enrichment';
import type { ParsedEvent, SearchHit } from '../../api/upload-resolve';
import {
  formatAuthorsDisplay,
  keyOfHit,
  sourceBrandLabel,
} from '../../lib/resolve-paper';
import { StepBanner } from '../shared/dialog-chrome';
import { PdfPreviewCard } from './PdfPreviewCard';

/**
 * 本地上传 · State 2 —— 找到匹配建议 / 等待确认
 *
 * 对照设计稿 scholay0523.pen 帧 `M6NQBY` 第三段 State 2:
 *   - 顶部状态条:State 2 · 找到匹配建议 · 等待确认
 *   - 左列:同 State 1 的 PdfPreviewCard
 *   - 右列:
 *      - 顶 banner(amber):找到 N 条匹配结果,已按相关度排序
 *      - 最佳建议卡(✨ + 标题 + 作者 + DOI/期刊/badges + [接受并入库][拒绝])
 *      - "其他候选项 (N)" 可折叠列表,每行 [标题 + 元数据 + 采用按钮]
 *
 * 选定(接受/采用/拒绝)后由父级立即 confirm 入库,然后工作台切到该行的
 * 管理语境继续完善。置信度徽章(match_type + match_score)由后端 resolveUploadCandidates
 * 返回:DOI 精确 / 标题精确 = 高置信;低相似度的搜索候选会提醒用户核对,不再盲信第一条。
 */

/** 候选置信度分档 —— 由 match_type + match_score 推导,驱动徽章文案/配色 + 是否提醒核对。 */
type Confidence = { label: string; tone: 'exact' | 'likely' | 'weak' };

function matchConfidence(hit: SearchHit): Confidence {
  const score = hit.match_score ?? 0;
  if (hit.match_type === 'doi') return { label: 'DOI 精确匹配', tone: 'exact' };
  if (hit.match_type === 'title_match') {
    return score >= 0.7
      ? { label: '标题精确匹配', tone: 'exact' }
      : { label: '标题匹配 · 建议核对', tone: 'likely' };
  }
  // search 兜底候选:按相似度分「相近」/「低相似 · 请核对」
  if (score >= 0.6) return { label: '搜索相近', tone: 'likely' };
  return { label: '低相似度 · 请核对', tone: 'weak' };
}

const CONFIDENCE_CLS: Record<Confidence['tone'], string> = {
  exact: 'bg-brand-green/10 text-brand-green',
  likely: 'bg-surface-2 text-muted-foreground',
  weak: 'bg-warning-soft text-brand-amber',
};

function MatchConfidenceBadge({ hit }: { hit: SearchHit }) {
  const { label, tone } = matchConfidence(hit);
  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded-4 text-[10px] font-bold leading-none',
        CONFIDENCE_CLS[tone]
      )}
    >
      {label}
    </span>
  );
}

interface PdfUploadDecideProps {
  file: File;
  parsed: ParsedEvent | null;
  searchHits: SearchHit[];
  isPending: boolean;
  /** 选择某个上游候选 → confirm({decision:'link', link}) 入库 */
  onPickHit: (hit: SearchHit) => void;
  /** 拒绝所有候选 → confirm({decision:'free'}) 存为自由文件 */
  onReject: () => void;
}

export function PdfUploadDecide({
  file,
  parsed,
  searchHits,
  isPending,
  onPickHit,
  onReject,
}: PdfUploadDecideProps) {
  const [othersOpen, setOthersOpen] = useState(true);

  const best = searchHits[0];
  const others = searchHits.slice(1);

  // 期刊增强(JCR/IF/中科院/CCF)—— 把所有候选的 venue 一次性 batch 查
  const venues = Array.from(
    new Set(searchHits.map((h) => h.venue?.trim()).filter((v): v is string => !!v))
  );
  const enrichments = useJournalEnrichments(venues);

  return (
    <div className="flex flex-col gap-4">
      {/* 状态条 */}
      <StepBanner
        step={3}
        title="确认匹配"
        desc="从候选中选出这份 PDF 对应的论文;都不对的话,跳过直接保存也可以"
      />

      <div className="grid grid-cols-[minmax(0,300px)_1fr] gap-4 items-start">
        {/* 左列:PDF 预览(与 State 1 共享) */}
        <PdfPreviewCard file={file} parsed={parsed} />

        {/* 右列:推荐 + 候选 */}
        <div className="flex flex-col gap-3">
          {searchHits.length === 0 ? (
            <NoMatchBanner onReject={onReject} isPending={isPending} />
          ) : (
            <>
              {/* 顶 banner */}
              <TopBanner total={searchHits.length} />

              {/* 最佳建议卡片 */}
              {best && (
                <BestMatchCard
                  hit={best}
                  enrichment={
                    best.venue ? (enrichments[best.venue.trim()] ?? null) : null
                  }
                  disabled={isPending}
                  onAccept={() => onPickHit(best)}
                  onReject={onReject}
                />
              )}

              {/* 其他候选项 —— 可折叠;enrichments 当前只在最佳卡用,
                  这里行高紧凑暂不显期刊 badge,以后想加直接传 prop 即可 */}
              {others.length > 0 && (
                <OtherCandidatesSection
                  open={othersOpen}
                  onToggle={() => setOthersOpen((v) => !v)}
                  hits={others}
                  disabled={isPending}
                  onPickHit={onPickHit}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 顶 banner
// ────────────────────────────────────────────────────────────────────────────

function TopBanner({ total }: { total: number }) {
  return (
    <div className="flex items-start gap-3 rounded-12 border border-brand-amber/30 bg-warning-soft px-4 py-3">
      <Info className="size-4 text-brand-amber shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-foreground">
          找到 {total} 条匹配结果,请确认
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          根据 PDF 内容在在线论文库中检索,已按相关度排序
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 最佳建议卡片(突出展示)
// ────────────────────────────────────────────────────────────────────────────

function BestMatchCard({
  hit,
  enrichment,
  disabled,
  onAccept,
  onReject,
}: {
  hit: SearchHit;
  enrichment: JournalEnrichmentMaybe;
  disabled: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  const externalUrl = hit.doi ? `https://doi.org/${hit.doi}` : undefined;
  const authorsLine = formatAuthorsDisplay(hit.authors);

  return (
    <div className="rounded-12 border border-border bg-surface-card overflow-hidden">
      {/* 头部:✨ 最佳建议 + 来源 badge + 外链 */}
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border-soft bg-surface-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Sparkles className="size-3.5 text-brand-amber" strokeWidth={2.25} />
          <span className="text-xs font-bold text-foreground">最佳建议</span>
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-4 bg-surface-2 text-subtle text-[10px] font-bold leading-none uppercase">
            {sourceBrandLabel(hit.source)}
          </span>
          <MatchConfidenceBadge hit={hit} />
        </div>
        {externalUrl && (
          <a
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-brand-amber hover:underline underline-offset-2"
          >
            <ExternalLink className="size-3" />
            查看原文
          </a>
        )}
      </div>

      {/* 主体:标题 + 作者 + DOI/期刊/badges + 接受/拒绝按钮 */}
      <div className="px-4 py-3.5 space-y-2">
        <div className="text-sm font-bold text-foreground leading-paragraph">
          {hit.title || '无标题'}
        </div>
        {authorsLine && (
          <div className="text-xs text-muted-foreground">{authorsLine}</div>
        )}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-faint">
          {hit.doi && (
            <span className="font-mono">
              <span className="font-bold mr-1">DOI</span>
              {hit.doi}
            </span>
          )}
          {hit.venue && (
            <>
              <span>·</span>
              <span className="text-muted-foreground">{hit.venue}</span>
            </>
          )}
          {hit.year && (
            <>
              <span>·</span>
              <span className="tabular-nums">{hit.year}</span>
            </>
          )}
          {typeof hit.citation_count === 'number' && hit.citation_count > 0 && (
            <>
              <span>·</span>
              <span className="tabular-nums">{hit.citation_count} 引用</span>
            </>
          )}
        </div>
        {enrichment && <JournalBadges enrichment={enrichment} />}

        {/* 按钮组 */}
        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={onAccept}
            disabled={disabled}
            className={cn(
              'inline-flex items-center gap-1.5 h-8 px-3.5 rounded-8 bg-brand-green text-background text-sm font-bold',
              'hover:bg-brand-green/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors'
            )}
          >
            {disabled ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" strokeWidth={2.5} />
            )}
            接受并加入
          </button>
          <button
            type="button"
            onClick={onReject}
            disabled={disabled}
            className={cn(
              'inline-flex items-center gap-1 h-8 px-3 rounded-8 text-sm font-semibold text-subtle',
              'hover:bg-surface-2 hover:text-foreground disabled:opacity-60 transition-colors'
            )}
          >
            <X className="size-3.5" />
            拒绝
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 其他候选项(可折叠)
// ────────────────────────────────────────────────────────────────────────────

function OtherCandidatesSection({
  open,
  onToggle,
  hits,
  disabled,
  onPickHit,
}: {
  open: boolean;
  onToggle: () => void;
  hits: SearchHit[];
  disabled: boolean;
  onPickHit: (hit: SearchHit) => void;
}) {
  return (
    <div className="rounded-12 border border-border bg-surface-card overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center justify-between w-full px-4 py-2.5 hover:bg-surface-1 transition-colors"
      >
        <span className="text-xs font-bold text-foreground">
          其他候选项 ({hits.length})
        </span>
        {open ? (
          <ChevronUp className="size-4 text-faint" />
        ) : (
          <ChevronDown className="size-4 text-faint" />
        )}
      </button>
      {open && (
        <ul className="divide-y divide-border-soft border-t border-border-soft">
          {hits.map((h) => (
            <li key={keyOfHit(h)} className="flex items-start gap-3 px-4 py-2.5">
              <div className="flex h-6 w-6 items-center justify-center rounded-8 bg-surface-card border border-border shrink-0 mt-0.5">
                <FileText className="size-3 text-subtle" strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground line-clamp-2">
                  {h.title || '无标题'}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-muted-foreground">
                  {(() => {
                    const line = formatAuthorsDisplay(h.authors);
                    return line ? <span>{line}</span> : null;
                  })()}
                  {h.venue && (
                    <>
                      <span className="text-faint">·</span>
                      <span>{h.venue}</span>
                    </>
                  )}
                  {h.year && (
                    <>
                      <span className="text-faint">·</span>
                      <span className="tabular-nums">{h.year}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-4 bg-surface-2 text-subtle text-[10px] font-bold leading-none uppercase">
                  {sourceBrandLabel(h.source)}
                </span>
                <button
                  type="button"
                  onClick={() => onPickHit(h)}
                  disabled={disabled}
                  className={cn(
                    'inline-flex items-center h-7 px-2.5 rounded-8 border border-brand-amber text-brand-amber text-xs font-semibold',
                    'hover:bg-brand-amber-soft disabled:opacity-60 transition-colors'
                  )}
                >
                  采用
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 无匹配(0 hits)兜底
// ────────────────────────────────────────────────────────────────────────────

function NoMatchBanner({
  onReject,
  isPending,
}: {
  onReject: () => void;
  isPending: boolean;
}) {
  return (
    <div className="rounded-12 border border-border-soft bg-surface-1 px-4 py-5 text-center space-y-3">
      <div className="inline-flex h-9 w-9 mx-auto items-center justify-center rounded-pill bg-warning-soft">
        <Info className="size-4 text-brand-amber" />
      </div>
      <div>
        <div className="text-sm font-semibold text-foreground">
          没有找到匹配的在线论文
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          可能是论文太新还没被收录,也可能是扫描件不便识别
        </div>
      </div>
      <button
        type="button"
        onClick={onReject}
        disabled={isPending}
        className={cn(
          'inline-flex items-center gap-1.5 h-8 px-3 rounded-8 bg-foreground text-background text-sm font-semibold',
          'hover:bg-foreground/85 disabled:opacity-60 transition-colors'
        )}
      >
        {isPending && <Loader2 className="size-3.5 animate-spin" />}
        直接保存
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 子件:期刊 badges
// ────────────────────────────────────────────────────────────────────────────

type JournalEnrichmentMaybe = ReturnType<
  typeof useJournalEnrichments
>[string];

function JournalBadges({ enrichment }: { enrichment: NonNullable<JournalEnrichmentMaybe> }) {
  const badges: { label: string; tone: 'solid-green' | 'solid-amber' | 'solid-red' | 'neutral' }[] = [];

  if (enrichment.jcr_quartile) {
    badges.push({
      label: `JCR ${enrichment.jcr_quartile}`,
      tone: quartileTone(enrichment.jcr_quartile),
    });
  }
  if (typeof enrichment.jcr_impact_factor === 'number' && enrichment.jcr_impact_factor > 0) {
    badges.push({
      label: `IF ${enrichment.jcr_impact_factor.toFixed(enrichment.jcr_impact_factor >= 10 ? 1 : 2)}`,
      tone: 'neutral',
    });
  }
  if (enrichment.fqb_quartile && /^[1-4]$/.test(enrichment.fqb_quartile)) {
    badges.push({
      label: `中科院 ${enrichment.fqb_quartile} 区`,
      tone: quartileTone(`Q${enrichment.fqb_quartile}`),
    });
  }
  if (enrichment.ccf_rank) {
    badges.push({
      label: `CCF ${enrichment.ccf_rank.toUpperCase()}`,
      tone: quartileTone(`Q${enrichment.ccf_rank === 'A' ? '1' : enrichment.ccf_rank === 'B' ? '2' : '3'}`),
    });
  }

  if (badges.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
      {badges.map((b) => (
        <span
          key={b.label}
          className={cn(
            'inline-flex items-center px-1.5 py-0.5 rounded-4 text-[10px] font-bold leading-none whitespace-nowrap',
            b.tone === 'solid-green' && 'bg-brand-green text-on-brand',
            b.tone === 'solid-amber' && 'bg-brand-amber text-on-brand',
            b.tone === 'solid-red' && 'bg-brand-red text-on-brand',
            b.tone === 'neutral' && 'bg-surface-2 text-subtle'
          )}
        >
          {b.label}
        </span>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 辅助
// ────────────────────────────────────────────────────────────────────────────

function quartileTone(q: string): 'solid-green' | 'solid-amber' | 'solid-red' {
  const upper = q.toUpperCase();
  if (upper === 'Q1') return 'solid-green';
  if (upper === 'Q2') return 'solid-amber';
  return 'solid-red';
}

// 来源品牌名 / 作者展示串 / 候选 key 统一走 lib/resolve-paper(单一真源),
// 本文件原私有副本(sourceLabel 曾把 stc 误标为 Crossref)已删除。
