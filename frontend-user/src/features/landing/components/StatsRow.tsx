import { cn } from '@/shared/lib/utils';
import type { LandingFeature, Stat } from '../data/landings';

/**
 * 4 数字统计行 —— .pen `BY THE NUMBERS / 数据说话` section:
 *   Playfair italic 56-72px 大数字 + Inter 13 label + 可选 sub 文案
 *
 * 背景采用米黄(prism-badge-bg)+ 描边,给页面增加节奏。
 */
const TONE: Record<NonNullable<Stat['tone']>, string> = {
  foreground: 'text-foreground',
  red: 'text-brand-red',
  amber: 'text-brand-amber',
  green: 'text-brand-green',
};

const DARK_TONE: Record<NonNullable<Stat['tone']>, string> = {
  foreground: 'text-on-dark',
  red: 'text-brand-red',
  amber: 'text-brand-amber',
  green: 'text-brand-green',
};

export function StatsRow({ feature }: { feature: LandingFeature }) {
  const dark = !!feature.statsDark;
  return (
    // data-surface="dark" —— 暗主题时把焦点环换成浅色系(globals.css §13 的 [data-surface='dark'] 覆写)。
    // 默认 --ring 是 rgb(31 31 35 / .50),压在 bg-foreground #1F1F23 上实测 1.000:1 完全隐形
    // (2026-07-28 真实渲染取证),违反 WCAG 1.4.11。CSS 变量沿 DOM 继承,挂容器即可。
    <section
      data-surface={dark ? 'dark' : undefined}
      className={cn(
        'py-16 lg:py-20 border-y',
        dark
          ? 'bg-foreground border-landing-dark-divider'
          : 'bg-prism-badge-bg/40 border-border-soft'
      )}
    >
      <div
        className={cn(
          'max-w-7xl mx-auto px-6 lg:px-12 grid grid-cols-2 lg:grid-cols-4',
          // 暗主题给竖分隔线(.pen DJav9 stats 用 #1F1F1F 1px 竖线)
          dark
            ? 'gap-0 divide-y lg:divide-y-0 lg:divide-x divide-landing-dark-divider'
            : 'gap-8 lg:gap-6'
        )}
      >
        {feature.stats.map((s, i) => (
          <div
            key={s.label}
            className={cn(
              'flex flex-col gap-2 items-start',
              dark && 'py-6 lg:py-0 lg:px-8',
              dark && i === 0 && 'lg:pl-0',
              dark && i === feature.stats.length - 1 && 'lg:pr-0'
            )}
          >
            <span
              className={cn(
                'font-display italic font-medium leading-display-tight',
                // 展示级数字随视口缩放 —— clamp 无法用离散字号 token 表达,保留 arbitrary(同 SectionHeader)。
                'text-[clamp(40px,5vw,64px)]',
                dark ? DARK_TONE[s.tone ?? 'foreground'] : TONE[s.tone ?? 'foreground']
              )}
            >
              {s.value}
            </span>
            <span
              className={cn(
                'text-14 font-medium',
                dark ? 'text-faint' : 'text-subtle'
              )}
            >
              {s.label}
            </span>
            {s.sub && (
              <span className={cn('text-12', dark ? 'text-muted-foreground/80' : 'text-muted-foreground')}>
                {s.sub}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
