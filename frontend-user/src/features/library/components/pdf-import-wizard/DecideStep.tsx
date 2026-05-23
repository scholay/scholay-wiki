import { BookmarkCheck, FilePlus, FileText, Loader2 } from 'lucide-react';
import { HighlightedText } from '@/shared/components/HighlightedText';
import { cn } from '@/shared/lib/utils';
import type { ParsedEvent, SearchHit } from '../../api/upload-resolve';

/**
 * Step 3 —— 解析结果 + 三源候选;用户选一条 link 或 "都不是" 走自由文件。
 *
 * 解析结果区(ParsedSummary)永远展示,即使所有字段都空也明确告诉用户"未识别",
 * 否则用户分不清"后端挂了 vs PDF 本身识别不出"。
 */
export function DecideStep({
  searchHits,
  parsed,
  isPending,
  onPickHit,
  onPickFree,
}: {
  searchHits: SearchHit[];
  parsed: ParsedEvent | null;
  isPending: boolean;
  onPickHit: (h: SearchHit) => void;
  onPickFree: () => void;
}) {
  return (
    <div className="space-y-5">
      {parsed && (
        <ParsedSummary parsed={parsed} hasHits={searchHits.length > 0} />
      )}

      {/* 三源搜索结果 */}
      {searchHits.length > 0 ? (
        <section>
          <SectionTitle
            icon={<FileText className="size-3.5" />}
            label="来自三源的候选论文"
            hint="已收藏的会优先排在前面"
          />
          <ul className="mt-2 divide-y divide-border-soft border border-border-soft rounded-sm">
            {searchHits.map((h) => (
              <HitRow
                key={`${h.source}:${h.source_paper_id}`}
                hit={h}
                // 传数组 → 每个字段(title / DOI / arXiv)各自作 phrase token
                // 整段命中时连续高亮整段(含空格),区别于只高亮独立单词的"漏色"效果
                query={[
                  parsed?.title,
                  parsed?.extracted_doi,
                  parsed?.arxiv_id,
                ].filter((s): s is string => !!s)}
                disabled={isPending}
                onPick={() => onPickHit(h)}
              />
            ))}
          </ul>
        </section>
      ) : (
        <section className="rounded-sm border border-border-soft px-4 py-3 text-xs text-muted-foreground">
          三源没找到匹配的论文 —— 可直接保存为自由文件,稍后再补关联
        </section>
      )}

      {/* 兜底:不匹配任何上游候选,直接落库为自由文件(用 heuristic 抽到的标题/摘要) */}
      <button
        type="button"
        onClick={onPickFree}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 h-9 px-4 rounded-sm bg-background border border-border text-sm font-semibold text-subtle hover:bg-surface-1 hover:text-foreground disabled:opacity-60 transition-colors"
      >
        {isPending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <FilePlus className="size-3.5" />
        )}
        都不是 · 直接保存为自由文件
      </button>
    </div>
  );
}

// ============================================================================
// Sub —— ParsedSummary / ParsedField / SectionTitle / HitRow
// ============================================================================

/** 让用户看清后端究竟解析到了啥(空 / 部分 / 全部),减少"系统挂了"误解 */
function ParsedSummary({
  parsed,
  hasHits,
}: {
  parsed: ParsedEvent;
  hasHits: boolean;
}) {
  const allEmpty =
    !parsed.title &&
    !parsed.extracted_doi &&
    !parsed.arxiv_id &&
    !parsed.authors?.length &&
    !parsed.year &&
    !parsed.venue;
  // 注意:解析结果区不高亮(用户反馈)——高亮只发生在下方搜索 hits 里,
  // 用来对比"哪些被命中"。这里只展示纯文本即可。
  return (
    <section className="rounded-sm border border-border-soft bg-surface-1/50 px-4 py-3 space-y-1.5 text-xs">
      <div className="flex items-center justify-between mb-1">
        <span className="text-2xs font-bold tracking-wider uppercase text-faint">
          解析结果
        </span>
        {allEmpty && (
          <span className="text-2xs text-brand-red">
            未识别 — 可能是扫描件 / 加密 PDF / 罕见排版
          </span>
        )}
      </div>
      <ParsedField label="DOI" value={parsed.extracted_doi} mono />
      <ParsedField label="arXiv" value={parsed.arxiv_id} mono />
      <ParsedField label="标题" value={parsed.title} />
      <ParsedField
        label="作者"
        value={
          parsed.authors && parsed.authors.length > 0
            ? parsed.authors.join(', ')
            : undefined
        }
      />
      <ParsedField
        label="年份"
        value={parsed.year ? String(parsed.year) : undefined}
        mono
      />
      <ParsedField label="期刊" value={parsed.venue} />
      {parsed.abstract && (
        <ParsedField
          label="摘要"
          value={
            parsed.abstract.length > 280
              ? parsed.abstract.slice(0, 280) + '…'
              : parsed.abstract
          }
          multiline
        />
      )}
      {!allEmpty && !hasHits && (
        <div className="mt-2 text-2xs text-faint">
          解析出标题但三源都没匹配 — 可能是新论文未被索引,或换个关键词试试
        </div>
      )}
    </section>
  );
}

function ParsedField({
  label,
  value,
  query,
  mono,
  multiline,
}: {
  label: string;
  value?: string;
  /** 传入则用 HighlightedText 渲染 —— 让"解析结果"和"搜索命中"的高亮视觉一致 */
  query?: string;
  mono?: boolean;
  multiline?: boolean;
}) {
  const empty = !value || value.trim() === '';
  return (
    <div
      className={cn(
        'flex gap-2',
        multiline ? 'items-start' : 'items-center'
      )}
    >
      <span className="shrink-0 w-12 text-faint">{label}</span>
      {empty ? (
        <span className="text-faint italic">— 未识别</span>
      ) : (
        <span
          className={cn(
            'flex-1 min-w-0 text-foreground',
            mono && 'font-mono',
            multiline ? 'leading-relaxed' : 'truncate'
          )}
          title={value}
        >
          {query ? <HighlightedText text={value!} query={query} /> : value}
        </span>
      )}
    </div>
  );
}

function SectionTitle({
  icon,
  label,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-foreground uppercase">
        {icon}
        {label}
      </div>
      {hint && <div className="text-2xs text-faint">{hint}</div>}
    </div>
  );
}

function HitRow({
  hit,
  query,
  disabled,
  onPick,
}: {
  hit: SearchHit;
  /**
   * 高亮关键词。传 string[] 时每个元素既作为 phrase token(整段命中连续高亮)
   * 又拆词,适合"title + DOI + arxiv"多字段场景。
   */
  query: string | string[];
  disabled: boolean;
  onPick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        disabled={disabled}
        className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-surface-1 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-background border border-border shrink-0">
          <FileText className="size-3 text-subtle" strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-2xs font-bold uppercase tracking-wide text-faint">
              {hit.source}
            </span>
            {hit.already_saved && (
              <span className="inline-flex items-center gap-1 px-1.5 py-px rounded-pill bg-brand-green/12 text-2xs font-bold text-brand-green">
                <BookmarkCheck className="size-2.5" strokeWidth={2.5} />
                已收藏
              </span>
            )}
          </div>
          <div
            className="text-sm font-medium text-foreground line-clamp-2"
            title={hit.title}
          >
            <HighlightedText text={hit.title || '无标题'} query={query} />
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-2xs text-muted-foreground truncate">
            {hit.year && <span className="tabular-nums">{hit.year}</span>}
            {hit.venue && <span className="truncate">{hit.venue}</span>}
            {typeof hit.citation_count === 'number' &&
              hit.citation_count > 0 && (
                <span className="shrink-0 tabular-nums">
                  {hit.citation_count} 引用
                </span>
              )}
          </div>
          {hit.doi && (
            <div className="mt-0.5 text-2xs text-faint truncate" title={hit.doi}>
              <span className="font-bold tracking-wider mr-1">DOI</span>
              <HighlightedText text={hit.doi} query={query} />
            </div>
          )}
        </div>
      </button>
    </li>
  );
}
