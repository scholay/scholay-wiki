import { Link } from 'react-router-dom';
import { ArrowRight, Play } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { CTAButton } from '../data/landings';

/**
 * Hero 区双 CTA 按钮组 —— .pen `BBFg3 / f00hM`:
 *   主 CTA:黑底白字,arrow-right 后置,rounded-8 padding [14,24]
 *   次 CTA:白底黑边,play icon 前置,同尺寸
 *
 * primaryCTA.href 以 / 开头走内部路由(Link),否则走 <a>(锚点 / mailto / 外链)。
 */
function isInternal(href: string) {
  return href.startsWith('/') && !href.startsWith('//');
}

function CTAButton2({
  cta,
  variant,
}: {
  cta: CTAButton;
  variant: 'primary' | 'secondary';
}) {
  const isPrimary = variant === 'primary';
  const Inner = (
    <span
      className={cn(
        'inline-flex items-center gap-2 h-12 px-6 rounded-8 text-14 font-medium transition-colors whitespace-nowrap',
        isPrimary
          ? 'bg-foreground text-background hover:bg-foreground/85'
          : 'bg-surface-card border border-foreground text-foreground hover:bg-surface-1'
      )}
    >
      {!isPrimary && <Play className="size-4" strokeWidth={2.2} />}
      {cta.label}
      {isPrimary && <ArrowRight className="size-4" strokeWidth={2.25} />}
    </span>
  );
  if (isInternal(cta.href)) {
    return <Link to={cta.href}>{Inner}</Link>;
  }
  return (
    <a href={cta.href} target={cta.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
      {Inner}
    </a>
  );
}

export function HeroCTAs({
  primary,
  secondary,
  className,
}: {
  primary: CTAButton;
  secondary?: CTAButton;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-3', className)}>
      <CTAButton2 cta={primary} variant="primary" />
      {secondary && <CTAButton2 cta={secondary} variant="secondary" />}
    </div>
  );
}
