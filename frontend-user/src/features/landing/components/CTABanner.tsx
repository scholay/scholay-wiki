import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { LandingFeature, TitleLine } from '../data/landings';

/**
 * 页面底部黑底大 CTA banner —— .pen 各页底部统一形态:
 *   eyebrow(brand amber)→ Playfair italic 64px 居中标题 → 副文 → 双 CTA → meta chips
 */

function isInternal(href: string) {
  return href.startsWith('/') && !href.startsWith('//');
}

function CTAInner({
  href,
  label,
  primary,
}: {
  href: string;
  label: string;
  primary: boolean;
}) {
  const cls = cn(
    'inline-flex items-center gap-2 h-12 px-6 rounded-sm text-md font-semibold transition-colors whitespace-nowrap',
    primary
      ? 'bg-surface-card text-foreground hover:bg-surface-1'
      : 'bg-transparent border border-background text-background hover:bg-surface-card/10'
  );
  const Inner = (
    <span className={cls}>
      {label}
      {primary && <ArrowRight className="size-4" strokeWidth={2.25} />}
    </span>
  );
  return isInternal(href) ? (
    <Link to={href}>{Inner}</Link>
  ) : (
    <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
      {Inner}
    </a>
  );
}

function CTATitle({ lines }: { lines: TitleLine[] }) {
  return (
    <h2 className="font-display text-background text-center max-w-4xl mx-auto">
      {lines.map((line, i) => (
        <span
          key={i}
          className={cn(
            'block text-[clamp(36px,5vw,64px)] font-semibold',
            line.italic && 'italic'
          )}
        >
          {line.text}
        </span>
      ))}
    </h2>
  );
}

export function CTABanner({ feature }: { feature: LandingFeature }) {
  const { finalCTA } = feature;
  return (
    <section className="bg-foreground py-20 lg:py-28">
      <div className="max-w-7xl mx-auto px-6 lg:px-12 flex flex-col items-center gap-8 text-center">
        <span className="text-2xs font-semibold uppercase text-brand-amber">
          {finalCTA.eyebrow}
        </span>
        <CTATitle lines={finalCTA.titleLines} />
        <p className="text-lg leading-paragraph text-faint max-w-2xl">{finalCTA.sub}</p>
        <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
          <CTAInner
            href={finalCTA.primaryCTA.href}
            label={finalCTA.primaryCTA.label}
            primary
          />
          {finalCTA.secondaryCTA && (
            <CTAInner
              href={finalCTA.secondaryCTA.href}
              label={finalCTA.secondaryCTA.label}
              primary={false}
            />
          )}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-2">
          {finalCTA.metaChips.map((m) => (
            <span key={m} className="text-xs text-faint">
              {m}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
