import { Search, Share2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

/**
 * Search Landing Hero 右侧 mock —— 仿 .pen `q0a0X HeroMock`:
 *   browser chrome (3 圆点 + URL) → 搜索框 (大问句 + Enter kbd) → 4 个 filter chip
 *   → 引文矩阵卡(4 行论文)→ 底部 graph badge
 *
 * 不做真交互,只做静态视觉模拟 —— 等价于设计稿截图,但是矢量的、能跟主题。
 */

const ROWS = [
  { tag: 'A12', title: 'Attention Is All You Need', meta: '2017 · 142k 引用' },
  { tag: 'B07', title: 'BERT: Pre-training of Deep Bidirectional Transformers', meta: '2019 · 89k 引用' },
  { tag: 'C03', title: 'GPT-3: Language Models are Few-Shot Learners', meta: '2020 · 32k 引用' },
  { tag: 'D24', title: 'LLaMA: Open and Efficient Foundation Language Models', meta: '2023 · 12k 引用' },
];

const CHIPS = [
  { label: '语义', active: true },
  { label: '引文矩阵', active: false },
  { label: '图谱', active: false },
  { label: '2022–2025', active: false },
];

export function SearchMatrixMock() {
  return (
    <div className={cn(
      'flex flex-col gap-4 p-5 rounded-12 bg-surface-1 border border-border',
      'shadow-[0_24px_48px_rgba(15,23,42,0.08)]'
    )}>
      {/* mock browser header */}
      <div className="flex items-center gap-2">
        <span className="size-2.5 rounded-pill bg-[#FF5F57]" />
        <span className="size-2.5 rounded-pill bg-[#FEBC2E]" />
        <span className="size-2.5 rounded-pill bg-[#28C840]" />
        <span className="flex-1" />
        <span className="text-xs text-faint">scholay.ai/search</span>
      </div>

      {/* search bar */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-md bg-background border border-border-soft">
        <Search className="size-4 text-muted-foreground shrink-0" />
        <span className="flex-1 text-sm text-foreground truncate">
          大语言模型在低资源语言上的对齐方法有哪些进展?
        </span>
        <kbd className="inline-flex items-center px-1.5 py-0.5 rounded-sm bg-prism-badge-bg text-2xs font-semibold text-prism-badge-fg">
          Enter
        </kbd>
      </div>

      {/* filter chips */}
      <div className="flex items-center gap-2">
        {CHIPS.map((c) => (
          <span
            key={c.label}
            className={cn(
              'inline-flex items-center px-2.5 py-1 rounded-pill text-2xs',
              c.active
                ? 'bg-foreground text-background font-semibold'
                : 'bg-background border border-border-soft text-subtle'
            )}
          >
            {c.label}
          </span>
        ))}
      </div>

      {/* matrix card */}
      <div className="rounded-md overflow-hidden bg-background border border-border-soft">
        <div className="flex items-center justify-between px-4 py-2.5 bg-surface-1 border-b border-border-soft">
          <span className="text-xs font-semibold text-foreground">引文矩阵</span>
          <span className="text-xs text-muted-foreground tabular-nums">12 篇结果</span>
        </div>
        <ul className="divide-y divide-border-soft">
          {ROWS.map((r) => (
            <li key={r.tag} className="flex items-center gap-3 px-4 py-2.5">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm bg-prism-badge-bg text-2xs font-semibold text-prism-badge-fg tabular-nums w-12 justify-center">
                {r.tag}
              </span>
              <div className="flex-1 min-w-0">
                <div className="truncate text-sm font-medium text-foreground">{r.title}</div>
                <div className="text-xs text-muted-foreground">{r.meta}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* graph badge */}
      <div className="inline-flex items-center self-start gap-2 px-3 py-2 rounded-md bg-background border border-border-soft">
        <Share2 className="size-3.5 text-brand-green" strokeWidth={2.2} />
        <span className="text-xs font-semibold text-subtle">已检测到 3 条跨论文关联 →</span>
      </div>
    </div>
  );
}
