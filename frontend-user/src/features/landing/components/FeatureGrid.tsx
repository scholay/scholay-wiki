import { cn } from '@/shared/lib/utils';
import { SectionHeader } from './SectionHeader';
import type { FeatureCard, LandingFeature } from '../data/landings';

/**
 * 3 列特性卡 —— .pen Claw `为什么选择 CLAW` 那一段 + 各页类似变体:
 *   每张卡:eyebrow → Playfair italic 中标题 → 描述 → 底部 KPI tag
 *   中间卡可选 dark variant(黑底白字),让 3 卡有视觉节奏
 *
 * 卡片之间 24px gap,响应式:1 列 → 3 列(lg)
 */

const KPI_TONE: Record<NonNullable<FeatureCard['kpi']>['tone'], string> = {
  green: 'text-brand-green',
  amber: 'text-brand-amber',
  red: 'text-brand-red',
  neutral: 'text-foreground',
};

function Card({ card }: { card: FeatureCard }) {
  const dark = !!card.dark;
  return (
    // data-surface="dark" —— 暗卡是【整块暗底】(不是浅底上的深色按钮),环画在卡片自身底色上。
    // 默认 --ring rgb(31 31 35 / .50) 压在 bg-foreground #1F1F23 上 = 1.000:1 完全隐形
    // (globals.css §13 的 [data-surface='dark'] 覆写把它换成 --ring-on-dark-emphasis)。
    <div
      data-surface={dark ? 'dark' : undefined}
      className={cn(
        'flex flex-col gap-5 p-8 rounded-16 border h-full',
        dark
          ? 'bg-foreground border-foreground text-on-dark'
          : 'bg-surface-card border-border'
      )}
    >
      <span
        className={cn(
          'text-12 font-medium uppercase',
          dark ? 'text-faint' : 'text-muted-foreground'
        )}
      >
        {card.eyebrow}
      </span>
      <h3
        className={cn(
          'font-display italic font-medium leading-display-tight text-20',
          dark ? 'text-on-dark' : 'text-foreground'
        )}
      >
        {card.title}
      </h3>
      <p
        className={cn(
          'text-14 leading-paragraph flex-1',
          dark ? 'text-faint' : 'text-muted-foreground'
        )}
      >
        {card.desc}
      </p>
      {card.kpi && (
        <span
          className={cn(
            'text-12 font-medium mt-auto',
            // 暗卡用 amber 提亮,其余按 tone token
            dark ? 'text-brand-amber' : KPI_TONE[card.kpi.tone]
          )}
        >
          {card.kpi.text}
        </span>
      )}
    </div>
  );
}

export function FeatureGrid({ feature }: { feature: LandingFeature }) {
  return (
    <section className="bg-surface-1 py-20 lg:py-24">
      <div className="max-w-7xl mx-auto px-6 lg:px-12 flex flex-col gap-14">
        <SectionHeader
          eyebrow={feature.featuresHeader.eyebrow}
          title={feature.featuresHeader.title}
          sub={feature.featuresHeader.sub}
        />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {feature.features.map((c) => (
            <Card key={c.title} card={c} />
          ))}
        </div>
      </div>
    </section>
  );
}
