import { useState } from 'react';
import { Plus, Minus } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { SectionHeader } from './SectionHeader';
import type { LandingFeature } from '../data/landings';

/**
 * 常见问题 —— .pen `FAQ` section:
 *   每条 + / − 切换的手风琴,展开后正文 14px line-height 1.7
 *
 * 受控本地 state,默认第一条展开(更友好的初见体验)。
 * 暂不需要 a11y full WAI Tabs 模式 —— 用 button + aria-expanded 即可。
 */
function FAQItem({
  q,
  a,
  open,
  onToggle,
}: {
  q: string;
  a: string;
  open: boolean;
  onToggle: () => void;
}) {
  const Icon = open ? Minus : Plus;
  return (
    <div className="border-t border-border-soft">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-6 py-5 text-left hover:bg-surface-1 transition-colors px-2 -mx-2 rounded-sm"
      >
        <span className="text-md font-semibold text-foreground">{q}</span>
        <Icon className="size-4 text-muted-foreground shrink-0" strokeWidth={2} />
      </button>
      <div
        className={cn(
          'overflow-hidden transition-all duration-200',
          open ? 'max-h-96 pb-6' : 'max-h-0'
        )}
      >
        <p className="text-md leading-paragraph text-subtle pr-10">{a}</p>
      </div>
    </div>
  );
}

export function FAQAccordion({ feature }: { feature: LandingFeature }) {
  const [openIdx, setOpenIdx] = useState(0);
  return (
    <section className="bg-background py-20 lg:py-24">
      <div className="max-w-4xl mx-auto px-6 lg:px-12 flex flex-col gap-12">
        <SectionHeader
          eyebrow={feature.faqHeader.eyebrow}
          title={feature.faqHeader.title}
          sub={feature.faqHeader.sub}
          align="left"
        />
        <div className="border-b border-border-soft">
          {feature.faqs.map((f, i) => (
            <FAQItem
              key={f.q}
              q={f.q}
              a={f.a}
              open={openIdx === i}
              onToggle={() => setOpenIdx(openIdx === i ? -1 : i)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
