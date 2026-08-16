import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { BrandMarkNest } from '@/shared/components/BrandMarkNest';
import { RHINO_NAME } from '@/shared/mascot/rhino-name';
import { cn } from '@/shared/lib/utils';

/**
 * End-of-turn invite on smart search: go to 智能助手.
 * Compact row — copy on the left, 牛犀犀 nest sitting on the right edge.
 */
export function SmartSearchClawHandoff() {
  return (
    <Link
      to="/claw"
      aria-label="前往智能助手"
      className={cn(
        'group mt-6 flex w-full items-end overflow-visible rounded-16 border border-border',
        'bg-surface-card outline-none transition-[border-color,box-shadow]',
        'hover:border-brand-amber/40 hover:shadow-md',
        'focus-visible:ring-2 focus-visible:ring-ring/30',
      )}
    >
      <div className="min-w-0 flex-1 px-4 py-3.5">
        <span className="text-xs font-semibold tracking-wide text-brand-amber">
          scholay {RHINO_NAME}
        </span>
        <h3 className="mt-1 font-serif text-18 font-bold tracking-tight text-foreground">
          检索到这里，深挖去智能助手
        </h3>
        <span
          className={cn(
            'mt-2.5 inline-flex w-fit items-center gap-1.5 rounded-8 bg-foreground px-3.5 py-2',
            'text-14 font-semibold text-background transition-colors',
            'group-hover:bg-foreground/90',
          )}
        >
          前往智能助手
          <ArrowRight className="size-3.5" strokeWidth={2.25} />
        </span>
      </div>

      <div
        className="relative flex shrink-0 items-end px-2 pb-0.5"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <BrandMarkNest
          playOnceKey="scholay.search-handoff-nest"
          size="xl"
          markOnly
          well
          wellClassName="size-20 items-end"
        />
      </div>
    </Link>
  );
}
