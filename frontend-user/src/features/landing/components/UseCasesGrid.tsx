import {
  GraduationCap,
  FlaskConical,
  Users,
  Library,
  RefreshCcw,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { SectionHeader } from './SectionHeader';
import type { LandingFeature, UseCase } from '../data/landings';

/**
 * 适用场景 3 卡 —— .pen `UseCases` 各页通用:
 *   eyebrow + 大标题(+ 可选副标题) → 3 卡(light/dark/amber 交替主题)
 *
 * 每卡:可选 lucide icon / 顶部 tag(Prism 用) → Playfair italic 大标题 →
 *      可选 Playfair italic 副标题(Prism PhD / Postdoc / Journals 用) →
 *      描述 → 3 bullet 列表
 *
 * 主题三档,对应 .pen 的视觉节奏(白 / 黑 / 米黄):
 *   - light: 白底 + 边框
 *   - dark : 黑底白字
 *   - amber: 米黄底(prism-badge-bg)
 */

const THEME_BG: Record<NonNullable<UseCase['theme']>, string> = {
  light: 'bg-background border border-border',
  dark: 'bg-foreground border border-foreground',
  amber: 'bg-prism-badge-bg border border-prism-badge-bg',
};

const THEME_TITLE: Record<NonNullable<UseCase['theme']>, string> = {
  light: 'text-foreground',
  dark: 'text-background',
  amber: 'text-foreground',
};

const THEME_BODY: Record<NonNullable<UseCase['theme']>, string> = {
  light: 'text-muted-foreground',
  dark: 'text-faint',
  amber: 'text-subtle',
};

const THEME_BULLET_DOT: Record<NonNullable<UseCase['theme']>, string> = {
  light: 'text-brand-red',
  dark: 'text-brand-amber',
  amber: 'text-brand-green',
};

const THEME_TAG: Record<NonNullable<UseCase['theme']>, string> = {
  light: 'bg-prism-badge-bg text-prism-badge-fg',
  dark: 'bg-surface-2 text-brand-amber',
  amber: 'bg-foreground text-brand-amber',
};

/** 显式注册的 icon —— 只含 data/landings.ts 里 useCases.icon 用到的字段。
 *  不用 `import * as Icons` 否则会把整个 lucide 拖进 bundle,破坏 tree-shaking。
 *  新增 icon → 在这里 import + 注册一项。 */
const ICON_MAP: Record<string, LucideIcon> = {
  'graduation-cap': GraduationCap,
  'flask-conical': FlaskConical,
  users: Users,
  library: Library,
  'refresh-ccw': RefreshCcw,
};
function getIcon(name?: string): LucideIcon | null {
  if (!name) return null;
  return ICON_MAP[name] ?? null;
}

function Card({ uc }: { uc: UseCase }) {
  const theme = uc.theme ?? 'light';
  const Icon = getIcon(uc.icon);

  return (
    <div className={cn('flex flex-col gap-5 p-8 rounded-lg h-full', THEME_BG[theme])}>
      {/* tag —— Prism 风格,优先于 icon */}
      {uc.tag && (
        <span
          className={cn(
            'inline-flex items-center self-start px-2.5 py-1 rounded-sm text-2xs font-bold tracking-[0.15em] uppercase',
            THEME_TAG[theme]
          )}
        >
          {uc.tag}
        </span>
      )}

      {/* icon —— 没 tag 时用,Search/Library 风格 */}
      {!uc.tag && Icon && (
        <div
          className={cn(
            'inline-flex h-10 w-10 items-center justify-center rounded-pill',
            theme === 'dark' ? 'bg-surface-2' : 'bg-prism-badge-bg'
          )}
        >
          <Icon
            className={cn('size-5', theme === 'dark' ? 'text-background' : 'text-foreground')}
            strokeWidth={2}
          />
        </div>
      )}

      <h3 className={cn('font-display italic font-semibold text-2xl leading-[1.1]', THEME_TITLE[theme])}>
        {uc.title}
      </h3>
      {uc.subtitle && (
        <span className={cn('font-display italic font-medium text-lg -mt-3', THEME_BODY[theme])}>
          {uc.subtitle}
        </span>
      )}

      <p className={cn('text-md leading-[1.7]', THEME_BODY[theme])}>{uc.desc}</p>

      <ul className="flex flex-col gap-2 mt-auto">
        {uc.bullets.map((b) => (
          <li key={b} className="flex items-start gap-2 text-sm">
            <span className={cn('font-bold mt-0.5', THEME_BULLET_DOT[theme])} aria-hidden>
              ·
            </span>
            <span className={THEME_BODY[theme]}>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function UseCasesGrid({ feature }: { feature: LandingFeature }) {
  return (
    <section className="bg-background py-20 lg:py-24">
      <div className="max-w-7xl mx-auto px-6 lg:px-12 flex flex-col gap-14">
        <SectionHeader
          eyebrow={feature.useCasesHeader.eyebrow}
          title={feature.useCasesHeader.title}
          sub={feature.useCasesHeader.sub}
        />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {feature.useCases.map((uc) => (
            <Card key={uc.title} uc={uc} />
          ))}
        </div>
      </div>
    </section>
  );
}
