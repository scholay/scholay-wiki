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
import { PdfPreviewCard } from './PdfPreviewCard';

/**
 * 本地上传 · State 2 —— 找到匹配建议 / 等待确认
 *
 * 对照设计稿 scholay0523.pen 帧 `M6NQBY` 第三段 State 2:
 *   - 顶部状态条:State 2 · 找到匹配建议 · 等待确认
 *   - 左列:同 State 1 的 PdfPreviewCard
 *   - 右列:
 *      - 顶 banner(amber):找到 N 条高匹配结果...
 *      - 最佳建议卡(✨ + 匹配度 96% chip + 标题 + 作者 + DOI/期刊/badges + [接受并填充][拒绝])
 *      - "其他候选项 (N)" 可折叠列表,每行 [标题 + 元数据 + 匹配 X% chip + 采用按钮]
 *
 * 匹配度数字是**前端 mock**(后端尚未返回 score)—— 按候选位置线性递减,
 * 视觉先做到位,后端补 score 后只换映射函数即可。
 */

interface PdfUploadDecideProps {
  file: File;
  parsed: ParsedEvent | null;
  searchHits: SearchHit[];
  isPending: boolean;
  /** 选择某个上游候选 → 走 confirm({decision:'link', link}) */
  onPickHit: (hit: SearchHit) => void;
  /** 拒绝所有候选 → 走 confirm({decision:'free'}),AI 自由文件兜底 */
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
      <div className="rounded-md border border-border-soft bg-surface-1 px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-pill bg-brand-amber text-background text-2xs font-bold tabular-nums">
            2
          </span>
          <span className="text-sm font-semibold text-foreground">
            找到匹配建议 · 等待确认
          </span>
          <span className="text-faint">·</span>
          <span className="text-xs text-muted-foreground">
            系统返回最佳建议 / 其他候选项 / 用户接受 / 拒绝 / 查看更多 / 跳过
          </span>
        </div>
      </div>

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
              <TopBanner total={searchHits.length} topScore={scoreFor(0)} />

              {/* 最佳建议卡片 */}
              {best && (
                <BestMatchCard
                  hit={best}
                  score={scoreFor(0)}
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
                  scoreFor={(i) => scoreFor(i + 1)}
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

function TopBanner({ total, topScore }: { total: number; topScore: number }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-brand-amber/30 bg-warning-soft px-4 py-3">
      <Info className="size-4 text-brand-amber shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-foreground">
          找到 {total} 条匹配结果,请确认是否填充
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          通过 PDF 全文 + DOI 比对 · 最高匹配度 {topScore}%
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
  score,
  enrichment,
  disabled,
  onAccept,
  onReject,
}: {
  hit: SearchHit;
  score: number;
  enrichment: JournalEnrichmentMaybe;
  disabled: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  const externalUrl = hit.doi ? `https://doi.org/${hit.doi}` : undefined;
  const authorsLine = formatAuthors(hit.authors);

  return (
    <div className="rounded-md border border-border bg-background overflow-hidden">
      {/* 头部:✨ 最佳建议 + 匹配度 badge + 外链 */}
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border-soft bg-surface-1">
        <div className="flex items-center gap-2">
          <Sparkles className="size-3.5 text-brand-amber" strokeWidth={2.25} />
          <span className="text-xs font-bold text-foreground">最佳建议</span>
          <ScoreBadge score={score} />
        </div>
        {externalUrl && (
          <a
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-brand-blue hover:underline underline-offset-2"
          >
            <ExternalLink className="size-3" />
            查看{sourceLabel(hit.source)}原文
          </a>
        )}
      </div>

      {/* 主体:标题 + 作者 + DOI/期刊/badges + 接受/拒绝按钮 */}
      <div className="px-4 py-3.5 space-y-2">
        <div className="text-sm font-bold text-foreground leading-relaxed">
          {hit.title || '无标题'}
        </div>
        {authorsLine && (
          <div className="text-xs text-muted-foreground">{authorsLine}</div>
        )}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-faint">
          {hit.doi && (
            <span className="font-mono">
              <span className="font-bold tracking-wide mr-1">DOI</span>
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
              'inline-flex items-center gap-1.5 h-8 px-3.5 rounded-sm bg-brand-green text-background text-sm font-bold',
              'hover:bg-brand-green/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors'
            )}
          >
            {disabled ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" strokeWidth={2.5} />
            )}
            接受并填充
          </button>
          <button
            type="button"
            onClick={onReject}
            disabled={disabled}
            className={cn(
              'inline-flex items-center gap-1 h-8 px-3 rounded-sm text-sm font-semibold text-subtle',
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
  scoreFor,
  disabled,
  onPickHit,
}: {
  open: boolean;
  onToggle: () => void;
  hits: SearchHit[];
  scoreFor: (index: number) => number;
  disabled: boolean;
  onPickHit: (hit: SearchHit) => void;
}) {
  return (
    <div className="rounded-md border border-border bg-background overflow-hidden">
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
          {hits.map((h, i) => (
            <li
              key={`${h.source}:${h.source_paper_id}`}
              className="flex items-start gap-3 px-4 py-2.5"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-background border border-border shrink-0 mt-0.5">
                <FileText className="size-3 text-subtle" strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground line-clamp-2">
                  {h.title || '无标题'}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-muted-foreground">
                  {(() => {
                    const line = formatAuthors(h.authors);
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
                <ScoreBadge score={scoreFor(i)} subtle />
                <button
                  type="button"
                  onClick={() => onPickHit(h)}
                  disabled={disabled}
                  className={cn(
                    'inline-flex items-center h-7 px-2.5 rounded-sm border border-brand-blue text-brand-blue text-xs font-semibold',
                    'hover:bg-brand-blue-soft disabled:opacity-60 transition-colors'
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
    <div className="rounded-md border border-border-soft bg-surface-1 px-4 py-5 text-center space-y-3">
      <div className="inline-flex h-9 w-9 mx-auto items-center justify-center rounded-pill bg-warning-soft">
        <Info className="size-4 text-brand-amber" />
      </div>
      <div>
        <div className="text-sm font-semibold text-foreground">
          三源没找到匹配的论文
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          可能是新论文未被索引,或扫描件 / 罕见排版导致解析不全
        </div>
      </div>
      <button
        type="button"
        onClick={onReject}
        disabled={isPending}
        className={cn(
          'inline-flex items-center gap-1.5 h-8 px-3 rounded-sm bg-foreground text-background text-sm font-semibold',
          'hover:bg-foreground/85 disabled:opacity-60 transition-colors'
        )}
      >
        {isPending && <Loader2 className="size-3.5 animate-spin" />}
        保存为自由文件
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 子件:匹配度 chip / 期刊 badges
// ────────────────────────────────────────────────────────────────────────────

function ScoreBadge({ score, subtle }: { score: number; subtle?: boolean }) {
  const tone =
    score >= 90 ? 'green' : score >= 70 ? 'amber' : score >= 50 ? 'neutral' : 'red';
  const colorMap = {
    green: subtle
      ? 'bg-brand-green/10 text-brand-green'
      : 'bg-brand-green text-background',
    amber: subtle
      ? 'bg-warning-soft text-brand-amber'
      : 'bg-brand-amber text-background',
    neutral: 'bg-surface-2 text-subtle',
    red: subtle
      ? 'bg-danger-soft text-brand-red'
      : 'bg-brand-red text-background',
  } as const;
  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded-pill text-[10px] font-bold leading-none tabular-nums',
        colorMap[tone]
      )}
    >
      匹配度 {score}%
    </span>
  );
}

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
            'inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-bold leading-none whitespace-nowrap',
            b.tone === 'solid-green' && 'bg-brand-green text-white',
            b.tone === 'solid-amber' && 'bg-brand-amber text-white',
            b.tone === 'solid-red' && 'bg-brand-red text-white',
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

function sourceLabel(s: string): string {
  if (s === 'olx') return ' OpenAlex ';
  if (s === 'pmd') return ' PubMed ';
  if (s === 'stc') return ' Crossref ';
  return ' 上游 ';
}

function formatAuthors(authors: unknown): string {
  if (!Array.isArray(authors)) return '';
  const names = authors
    .map((a) => {
      if (typeof a === 'string') return a;
      if (a && typeof a === 'object' && 'name' in a) {
        const n = (a as { name?: unknown }).name;
        return typeof n === 'string' ? n : '';
      }
      return '';
    })
    .filter(Boolean);
  if (names.length === 0) return '';
  const head = names.slice(0, 5).join(', ');
  return names.length > 5
    ? `${head}, et al. (${names.length} authors)`
    : head;
}

/**
 * 匹配度 mock —— 按位置线性递减。后端补 score 后这里换成
 * 真实读取即可,组件 API 不变。
 *   pos 0 → 96
 *   pos 1 → 78
 *   pos 2 → 72
 *   pos 3 → 65
 *   pos i → max(40, 96 - i*8)(下限 40)
 */
function scoreFor(pos: number): number {
  if (pos === 0) return 96;
  if (pos === 1) return 78;
  if (pos === 2) return 72;
  if (pos === 3) return 65;
  return Math.max(40, 60 - (pos - 3) * 5);
}
