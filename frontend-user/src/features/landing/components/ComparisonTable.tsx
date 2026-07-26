import { Check, X, Minus } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { SectionHeader } from './SectionHeader';
import type {
  ComparisonCell,
  ComparisonSection,
} from '../data/landings';

/**
 * 比较表 —— .pen 各页通用,有暗 / 亮两套主题:
 *   - dark (Search/Library/Prism/Claw): #111 段背景 + #1A1A1A 表 + #2A2A2A 分隔
 *   - light (PeerReview Dvlne):白底 + #EEEEEE 分隔 + Scholay 列略加 #FAFAFA 强调
 *
 * 列数 3-5 可变,首列是「维度/能力」,后面 1 个或多个产品列(Scholay 列高亮)。
 * 单元类型:check / x / tilde icon / 纯文本 + tone(good/neutral/weak)/ icon+text 混合。
 *
 * 不用 <table>,因为响应式行为更难控;用 CSS Grid 1 + N 列即可。
 */

function CellIcon({ icon, dark }: { icon: 'check' | 'x' | 'tilde'; dark: boolean }) {
  if (icon === 'check') {
    return <Check className="size-4 text-brand-green" strokeWidth={2.5} />;
  }
  if (icon === 'x') {
    return <X className={cn('size-4', dark ? 'text-faint' : 'text-muted-foreground')} strokeWidth={2.5} />;
  }
  return <Minus className="size-4 text-brand-amber" strokeWidth={2.5} />;
}

function CellText({ text, tone, dark }: { text: string; tone?: 'good' | 'neutral' | 'weak'; dark: boolean }) {
  const cls = cn(
    'text-sm',
    tone === 'good' ? 'font-semibold' : 'font-normal',
    tone === 'good'
      ? (dark ? 'text-background' : 'text-brand-green')
      : tone === 'weak'
        ? (dark ? 'text-faint' : 'text-muted-foreground')
        : (dark ? 'text-background/85' : 'text-subtle')
  );
  return <span className={cls}>{text}</span>;
}

function Cell({ cell, dark }: { cell: ComparisonCell; dark: boolean }) {
  if (cell.kind === 'check' || cell.kind === 'x' || cell.kind === 'tilde') {
    return <CellIcon icon={cell.kind} dark={dark} />;
  }
  if (cell.kind === 'text') {
    return <CellText text={cell.text} tone={cell.tone} dark={dark} />;
  }
  // mixed
  return (
    <span className="inline-flex items-center gap-2">
      <CellIcon icon={cell.icon} dark={dark} />
      <CellText text={cell.text} tone={cell.tone} dark={dark} />
    </span>
  );
}

export function ComparisonTable({ section }: { section: ComparisonSection }) {
  const dark = section.theme === 'dark';
  const colCount = section.columns.length;
  // Grid 模板:首列「维度」宽固定,其余等分
  const gridCols = `minmax(160px, 1.4fr) repeat(${colCount - 1}, minmax(0, 1fr))`;

  return (
    <section
      className={cn(
        'py-20 lg:py-24',
        dark ? 'bg-foreground' : 'bg-background'
      )}
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-12 flex flex-col gap-12">
        <SectionHeader
          eyebrow={section.eyebrow}
          title={section.title}
          sub={section.sub}
          dark={dark}
        />

        <div
          className={cn(
            'rounded-lg overflow-hidden border',
            dark ? 'bg-landing-dark-1 border-landing-dark-divider' : 'bg-background border-border'
          )}
        >
          {/* 表头 */}
          <div
            className={cn(
              'grid items-center gap-6 px-7 py-5 border-b',
              dark ? 'bg-landing-dark-2 border-landing-dark-divider' : 'bg-surface-1 border-border-soft'
            )}
            style={{ gridTemplateColumns: gridCols }}
          >
            {section.columns.map((col, i) => (
              <div
                key={col.label + i}
                className={cn(
                  'flex items-center gap-2',
                  i === 0 ? 'justify-start' : 'justify-center'
                )}
              >
                <span
                  className={cn(
                    'text-2xs font-bold tracking-[0.2em] uppercase',
                    col.highlight
                      ? 'text-brand-amber font-display italic text-sm tracking-wider not-italic font-bold'
                      : dark
                        ? 'text-faint'
                        : 'text-muted-foreground'
                  )}
                >
                  {col.label}
                </span>
                {col.badge && (
                  <span
                    className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-sm text-2xs font-bold tracking-[0.15em]',
                      'bg-brand-amber text-foreground'
                    )}
                  >
                    {col.badge}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* 行 */}
          {section.rows.map((row, i) => (
            <div
              key={row.label + i}
              className={cn(
                'grid items-center gap-6 px-7 py-5',
                i < section.rows.length - 1 && (dark ? 'border-b border-landing-dark-divider' : 'border-b border-border-soft')
              )}
              style={{ gridTemplateColumns: gridCols }}
            >
              <div
                className={cn(
                  'text-sm font-semibold',
                  dark ? 'text-background' : 'text-foreground'
                )}
              >
                {row.label}
              </div>
              {row.cells.map((c, j) => (
                <div
                  key={j}
                  className={cn(
                    'flex items-center justify-center text-center',
                    // Scholay 列(highlight) 给一个柔和高亮
                    section.columns[j + 1]?.highlight &&
                      (dark ? 'bg-foreground/20 -mx-3 px-3 py-1 rounded-4' : 'bg-surface-1 -mx-3 px-3 py-1 rounded-4')
                  )}
                >
                  <Cell cell={c} dark={dark} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
