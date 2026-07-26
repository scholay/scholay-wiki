import { type ReactNode } from 'react';
import { ChevronRight, Search, User } from 'lucide-react';
import { SourceBadge } from '@/shared/components/SourceBadge';
import { cn } from '@/shared/lib/utils';
import type {
  AuthorSuggestion,
  PaperSuggestion,
} from '@/shared/api/types';
import type { JournalSuggestion } from '@/shared/api/suggestions';

/**
 * SearchAutocomplete 下拉里的 3 个分组 + 期刊检索替代行 + 共享 helpers。
 *
 * 切分原因:SearchAutocomplete.tsx 包含主框 / picker / 联想 dropdown 三层逻辑
 * 已 ~250 行,各 section 加起来又 ~250 行,合并就过 500 行硬阈值。Sections
 * 都是纯展示(props in、callback out),无内部状态,挪出来无任何耦合损失。
 */

// ============================================================================
// 期刊检索替代行(hover 主搜索按钮时出现)
// ============================================================================

/**
 * 视觉与主搜索框完全一致:48h、同 padding (pl-5 pr-2)、同字号。
 * 唯一区别:外边框 brand-amber + 右侧按钮文字"期刊搜索"。
 * 不放图标 / 不放说明文案,极简对齐主框形态。
 */
export function JournalSearchAlternateRow({
  query,
  onClick,
}: {
  query: string;
  onClick: () => void;
}) {
  return (
    <div
      className={cn(
        // 形态完全复刻主框:48h / pl-5 pr-2 / rounded-16
        'flex h-12 items-center gap-3 pl-5 pr-2 bg-surface-card border border-brand-amber rounded-16',
        // 轻微阴影,与主框区分悬浮层级
        'shadow-overlay'
      )}
    >
      {/* 查询文字 —— 不可编辑,只是 echo 主框 query 让用户确认 */}
      <span className="flex-1 min-w-0 truncate text-base text-foreground">
        {query}
      </span>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'inline-flex h-9 items-center justify-center px-4 rounded-8',
          'bg-brand-amber text-on-brand text-sm font-semibold whitespace-nowrap',
          'hover:bg-brand-amber/95 transition-colors'
        )}
      >
        期刊搜索
      </button>
    </div>
  );
}

// ============================================================================
// 论文 / 学者 / 期刊 三个分组
// ============================================================================

export function PaperSection({
  query,
  papers,
  onPick,
}: {
  query: string;
  papers: PaperSuggestion[];
  onPick: (p: PaperSuggestion) => void;
}) {
  return (
    <div className="py-1.5">
      <SectionHeader>论文</SectionHeader>
      {papers.map((p) => (
        <button
          key={`${p.source ?? ''}-${p.id}`}
          type="button"
          onClick={() => onPick(p)}
          className="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-surface-1 transition-colors"
        >
          <Search className="size-3.5 shrink-0 text-faint" />
          <span className="flex-1 min-w-0 truncate text-md">
            {highlightQuery(p.title, query)}
          </span>
          <SourceBadge source={p.source} variant="letter" size="sm" />
        </button>
      ))}
    </div>
  );
}

export function AuthorSection({
  query,
  authors,
  onPick,
}: {
  query: string;
  authors: AuthorSuggestion[];
  onPick: (a: AuthorSuggestion) => void;
}) {
  return (
    <div className="py-1.5">
      <SectionHeader>学者</SectionHeader>
      {authors.map((a) => {
        const aff = a.affiliations?.[0];
        return (
          <button
            key={`${a.source ?? ''}-${a.authorId ?? a.name}`}
            type="button"
            onClick={() => onPick(a)}
            className="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-surface-1 transition-colors"
          >
            <User className="size-3.5 shrink-0 text-faint" />
            <div className="flex-1 min-w-0">
              <div className="text-md truncate">
                {highlightQuery(a.name ?? '未知作者', query)}
              </div>
              {(aff || a.paperCount != null || a.hIndex != null) && (
                <div className="mt-0.5 text-xs text-faint truncate">
                  {aff}
                  {aff && (a.paperCount != null || a.hIndex != null) && ' · '}
                  {a.paperCount != null && <>{a.paperCount} 篇</>}
                  {a.paperCount != null && a.hIndex != null && ' · '}
                  {a.hIndex != null && <>h-index {a.hIndex}</>}
                </div>
              )}
            </div>
            <SourceBadge source={a.source} variant="letter" size="sm" />
          </button>
        );
      })}
    </div>
  );
}

/**
 * 期刊封面色系 —— .pen `hAqM6 / tk0LP / X4FWu` 三种品牌色 + 暗一档描边。
 * 用品牌色 + black/15 作统一描边,视觉与 .pen 几乎无差。
 */
const COVER_PALETTE = ['bg-brand-red', 'bg-brand-green', 'bg-brand-amber'];

export function JournalSection({
  journals,
  onPick,
}: {
  journals: JournalSuggestion[];
  onPick: (j: JournalSuggestion) => void;
}) {
  return (
    // .pen `a17q5P` 米黄软底,与 papers 区视觉区分(token: journal-soft)
    <div className="bg-journal-soft py-2">
      <div className="flex items-center px-5 py-1.5">
        <span className="text-xs font-bold text-brand-red">期刊推荐</span>
      </div>
      {journals.map((j, i) => (
        <button
          key={j.id}
          type="button"
          onClick={() => onPick(j)}
          className="flex w-full items-center gap-3.5 px-5 py-3 text-left hover:bg-foreground/[0.03] transition-colors"
        >
          <JournalCover name={j.canonical_name} index={i} />
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-md font-bold text-foreground truncate">
                {j.canonical_name}
              </span>
              <span className="shrink-0 inline-flex items-center rounded-pill bg-danger-soft text-brand-red text-2xs font-semibold px-1.5 py-0.5">
                期刊
              </span>
            </div>
            <div className="text-sm text-muted-foreground truncate">
              {j.issn_l ? `ISSN ${j.issn_l} · ` : ''}
              {j.source_count ?? 0} 个来源 · {j.openalex_works_count ?? 0} 篇收录
            </div>
          </div>
          <ChevronRight className="size-5 text-faint shrink-0" />
        </button>
      ))}
    </div>
  );
}

function JournalCover({ name, index }: { name: string; index: number }) {
  const bg = COVER_PALETTE[index % COVER_PALETTE.length];
  // 取首 2-4 字符做封面文字(去掉空格 / 标点)
  const initials = name
    .replace(/[^a-zA-Z一-龥]/g, '')
    .slice(0, 4)
    .toUpperCase();
  return (
    <div
      className={cn(
        'shrink-0 inline-flex items-center justify-center w-11 h-14 rounded-8 border border-foreground/15 text-background font-display font-bold text-md',
        bg
      )}
    >
      {initials}
    </div>
  );
}

// ============================================================================
// helpers
// ============================================================================

function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <div className="px-5 py-1.5 text-xs font-semibold text-faint">{children}</div>
  );
}

/**
 * 在 text 中找到 query 首次出现的位置并加粗(大小写不敏感)。
 * 对照 .pen `p1text`:命中 query 部分 bold/foreground,其余 regular/subtle。
 */
function highlightQuery(text: string, query: string): ReactNode {
  if (!query) return <span className="text-foreground">{text}</span>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) {
    return <span className="text-subtle">{text}</span>;
  }
  const before = text.slice(0, idx);
  const hit = text.slice(idx, idx + query.length);
  const after = text.slice(idx + query.length);
  return (
    <>
      {before && <span className="text-subtle">{before}</span>}
      <span className="text-foreground font-semibold">{hit}</span>
      {after && <span className="text-subtle">{after}</span>}
    </>
  );
}
