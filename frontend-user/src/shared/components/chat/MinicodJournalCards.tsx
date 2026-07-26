import { useMemo, type ReactNode } from 'react';
import { BookText } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import {
  parseJournalsFromToolResult,
  type MinicodJournal,
} from '@/shared/lib/minicod-results';

/**
 * minicod 期刊工具结果(search_journals / get_journal / compare_journals / suggest_journals)
 * 的卡片列表 —— 替代非论文结果的「回退 JSON」。smart-search / claw / admin 会话监控共用(纯只读展示,
 * 无用户态交互)。视觉与 PaperListReadonly / PaperResultCard 同骨架(外框 + 顶栏计数 + 分隔行 + tag chip)。
 *
 * 数据:content ─ parseJournalsFromToolResult ─▶ MinicodJournal[](防御式取值,取不到不显示该项)。
 * 品牌铁律:只展示中性的期刊元数据(名称/分区/IF/出版商/国家),不出现任何原始数据源名。
 */

// tag chip —— 与 PaperResultCard DefaultCard 的 tags 同款尺寸(h-[18px] 视觉基准一致)。
type Tone = 'solid-green' | 'green' | 'amber' | 'neutral' | 'danger';
const TONE_CLASS: Record<Tone, string> = {
  'solid-green': 'bg-brand-green text-on-brand',
  green: 'bg-brand-green/10 text-brand-green',
  amber: 'bg-brand-amber/10 text-brand-amber',
  neutral: 'bg-surface-2 text-subtle',
  danger: 'bg-danger-soft text-brand-red',
};

function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 h-[18px] rounded-4 text-12 font-medium',
        TONE_CLASS[tone],
      )}
    >
      {children}
    </span>
  );
}

/** 分区数字 → tone:1/2 区为佳(绿),3/4 区中性。 */
function regionTone(digit: string): Tone {
  return digit === '1' || digit === '2' ? 'green' : 'neutral';
}
function quartileTone(q: string): Tone {
  return q === 'Q1' ? 'solid-green' : q === 'Q2' ? 'green' : 'neutral';
}

function JournalCard({ journal: j }: { journal: MinicodJournal }) {
  const meta = [j.publisher, j.country, j.issn].filter(Boolean).join(' · ');
  const hasChips =
    j.impactFactor ||
    j.jcrQuartile ||
    j.scimagoQuartile ||
    j.casRegion ||
    j.xrRegion ||
    j.isOA ||
    typeof j.hIndex === 'number' ||
    j.warning;

  return (
    <div className="border-b border-border-soft px-3.5 py-3 last:border-0">
      <p className="text-14 font-medium text-foreground">{j.name}</p>
      {meta && <p className="mt-0.5 truncate text-12 text-faint">{meta}</p>}
      {hasChips && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {j.impactFactor && <Chip tone="amber">IF {j.impactFactor}</Chip>}
          {j.jcrQuartile && (
            <Chip tone={quartileTone(j.jcrQuartile)}>JCR {j.jcrQuartile}</Chip>
          )}
          {j.scimagoQuartile && (
            <Chip tone={quartileTone(j.scimagoQuartile)}>SCImago {j.scimagoQuartile}</Chip>
          )}
          {j.casRegion && (
            <Chip tone={regionTone(j.casRegion)}>中科院 {j.casRegion}区</Chip>
          )}
          {j.xrRegion && (
            <Chip tone={regionTone(j.xrRegion)}>中科院新锐 {j.xrRegion}区</Chip>
          )}
          {j.isOA && <Chip tone="green">OA</Chip>}
          {typeof j.hIndex === 'number' && (
            <Chip tone="neutral">h-index {j.hIndex}</Chip>
          )}
          {j.warning && <Chip tone="danger">预警</Chip>}
        </div>
      )}
    </div>
  );
}

export function MinicodJournalCards({ content }: { content: unknown }) {
  const journals = useMemo(() => parseJournalsFromToolResult(content), [content]);
  if (journals.length === 0) return null;

  const overflow = journals.length > 3;
  return (
    <div className="rounded-16 border border-border bg-surface-1 overflow-hidden">
      <header className="flex items-center gap-1.5 h-9 px-2.5 border-b border-border-soft bg-surface-2/40 text-12 text-muted-foreground">
        <BookText className="size-3" strokeWidth={2} />
        <span className="font-medium text-foreground">{journals.length} 个期刊</span>
      </header>
      <div
        className={overflow ? 'overflow-y-auto' : ''}
        style={overflow ? { maxHeight: 420 } : undefined}
      >
        {journals.map((j, i) => (
          <JournalCard key={`${j.name}-${i}`} journal={j} />
        ))}
      </div>
    </div>
  );
}
