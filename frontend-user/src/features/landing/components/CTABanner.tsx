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
    'inline-flex items-center gap-2 h-12 px-6 rounded-8 text-14 font-medium transition-colors whitespace-nowrap',
    primary
      ? 'bg-surface-card text-foreground hover:bg-surface-1'
      : 'bg-transparent border border-on-dark/40 text-on-dark hover:bg-surface-card/10'
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
    <h2 className="font-display text-on-dark text-center max-w-4xl mx-auto">
      {lines.map((line, i) => (
        <span
          key={i}
          className={cn(
            // 展示级标题随视口缩放 —— clamp 无法用离散字号 token 表达,保留 arbitrary(同 SectionHeader)。
            'block text-[clamp(36px,5vw,64px)] font-medium',
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
  // data-surface="dark" —— 把焦点环换成浅色系(globals.css §13 的 [data-surface='dark'] 覆写)。
  // 不挂这个属性时 --ring 是 rgba(31,31,35,.5),压在本段的 bg-foreground #1F1F23 上
  // 实测对比度 **1.000:1** —— 键盘焦点完全不可见(2026-07-28 真实渲染取证:
  // 失焦↔聚焦像素比对 0/11968,肉眼与机器都看不出区别),违反 WCAG 1.4.11(要求 ≥3:1)。
  // 覆写机制本来就建好了,只是全仓从没有任何 DOM 节点设过这个属性。
  // CSS 变量沿 DOM 继承,挂在暗段容器上即可,内部所有元素自动生效。
  return (
    <section data-surface="dark" className="bg-foreground py-20 lg:py-28">
      <div className="max-w-7xl mx-auto px-6 lg:px-12 flex flex-col items-center gap-8 text-center">
        <span className="text-12 font-medium uppercase text-brand-amber">
          {finalCTA.eyebrow}
        </span>
        <CTATitle lines={finalCTA.titleLines} />
        <p className="text-16 leading-paragraph text-faint max-w-2xl">{finalCTA.sub}</p>
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
            <span key={m} className="text-12 text-faint">
              {m}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
