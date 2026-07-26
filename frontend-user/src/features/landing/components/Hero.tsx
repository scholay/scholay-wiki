import { type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { EyebrowChip } from './EyebrowChip';
import { HeroCTAs } from './HeroCTAs';
import { SearchMatrixMock } from './mocks/SearchMatrixMock';
import { PrismEditorMock } from './mocks/PrismEditorMock';
import { ClawChatMock } from './mocks/ClawChatMock';
import type { HeroMockKey, LandingFeature, TitleLine } from '../data/landings';

const HERO_MOCK: Record<HeroMockKey, () => ReactNode> = {
  'search-matrix': () => <SearchMatrixMock />,
  'prism-editor': () => <PrismEditorMock />,
  'claw-chat': () => <ClawChatMock />,
};

/**
 * Hero —— .pen `Hero` 通用结构:
 *   左侧:eyebrow → 大标题(Playfair Display 64px,混排 regular + italic)→ 描述 → 双 CTA → ✓ checklist
 *   右侧:可选 mock(浏览器 chrome 风格的产品截图占位)
 *
 * 如果不传 mock,布局自动 fallback 为单列居中,适合「智能投稿 / 同行评审」这类
 * 长 hero 文案场景(.pen 也确实是这样处理的)。
 */

function TitleLines({ lines }: { lines: TitleLine[] }) {
  return (
    <h1 className="font-display text-foreground">
      {lines.map((line, i) => (
        <span
          key={i}
          className={cn(
            'block',
            line.italic && 'italic',
            // 主大字号 —— .pen 64-84,这里用 clamp 适配宽屏
            'text-[clamp(40px,6vw,72px)] font-medium'
          )}
        >
          {line.text}
        </span>
      ))}
    </h1>
  );
}

function CheckMeta({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
      {items.map((m) => (
        <span
          key={m}
          className="inline-flex items-center gap-1.5 text-12 text-muted-foreground"
        >
          <Check className="size-3.5 text-brand-green" strokeWidth={2.5} />
          {m}
        </span>
      ))}
    </div>
  );
}

export function Hero({
  feature,
  mock,
}: {
  feature: LandingFeature;
  mock?: ReactNode;
}) {
  const { hero } = feature;
  // mock 优先级:外部传入(测试覆盖)> feature.hero.mockKey 映射 > 无 mock(走单列居中)
  const resolvedMock = mock ?? (hero.mockKey ? HERO_MOCK[hero.mockKey]() : null);
  const hasMock = !!resolvedMock;

  return (
    <section className="bg-background">
      <div
        className={cn(
          'max-w-7xl mx-auto px-6 lg:px-12 py-20 lg:py-24',
          hasMock
            ? 'grid grid-cols-1 lg:grid-cols-[1fr_560px] gap-12 lg:gap-16 items-center'
            : 'flex flex-col items-center text-center gap-8 max-w-4xl'
        )}
      >
        <div
          className={cn(
            'flex flex-col gap-7',
            !hasMock && 'items-center text-center'
          )}
        >
          <EyebrowChip eyebrow={hero.eyebrow} />
          <TitleLines lines={hero.titleLines} />
          <p
            className={cn(
              'text-16 leading-paragraph text-subtle',
              !hasMock && 'max-w-[760px]'
            )}
          >
            {hero.description}
          </p>
          <HeroCTAs primary={hero.primaryCTA} secondary={hero.secondaryCTA} />
          <CheckMeta items={hero.checkMeta} />
        </div>

        {hasMock && <div className="w-full">{resolvedMock}</div>}
      </div>
    </section>
  );
}
