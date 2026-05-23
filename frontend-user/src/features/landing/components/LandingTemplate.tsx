import { RouteSEO } from '@/shared/components/RouteSEO';
import { LandingLayout } from '../layout/LandingLayout';
import { Hero } from './Hero';
import { TrustStrip } from './TrustStrip';
import { FeatureGrid } from './FeatureGrid';
import { WorkflowSteps } from './WorkflowSteps';
import { UseCasesGrid } from './UseCasesGrid';
import { ComparisonTable } from './ComparisonTable';
import { TestimonialsGrid } from './TestimonialsGrid';
import { StatsRow } from './StatsRow';
import { FAQAccordion } from './FAQAccordion';
import { CTABanner } from './CTABanner';
import type { LandingFeature } from '../data/landings';

/**
 * 数据驱动的 Landing 模板 —— 所有 6 个宣传页共用一个组件,
 * 唯一区别在于传入的 `feature: LandingFeature` 配置(见 data/landings.ts)。
 *
 * Section 顺序对齐 .pen 10 段:
 *   Hero(单列居中或两栏带 mock,由 hero.mockKey 决定)
 *   → TrustStrip(浅灰底,横排 logos)
 *   → FeatureGrid(3 卡,中间可暗色变体)
 *   → WorkflowSteps(3-5 步,左右交替)
 *   → UseCasesGrid(3 卡 light/dark/amber 主题轮换)
 *   → ComparisonTable(暗或亮主题,可变列数 —— Submit 无此段)
 *   → StatsRow(4 大数字,米黄底 / PeerReview 暗底变体)
 *   → TestimonialsGrid(只 Submit 有)
 *   → FAQAccordion
 *   → CTABanner(黑底底部 CTA)
 *
 * Comparison / Testimonials 是「数据可选」section,
 * 任一 feature 没填该字段就自动跳过,不需要每页改模板。
 *
 * SEO 三件套(title / description / keywords)走统一的 <RouteSEO>, 同时落
 * canonical link 与 (可选) noindex; 数据来自 feature.pageTitle / metaDesc /
 * metaKeywords —— 复刻旧前端 SEO.js 在 features landing 页的字段集。
 */
export function LandingTemplate({ feature }: { feature: LandingFeature }) {
  return (
    <LandingLayout>
      <RouteSEO
        title={feature.pageTitle}
        description={feature.metaDesc}
        keywords={feature.metaKeywords}
        canonical={`/features/${feature.slug}`}
      />

      <Hero feature={feature} />
      <TrustStrip label={feature.trust.label} logos={feature.trust.logos} />
      <FeatureGrid feature={feature} />
      <WorkflowSteps feature={feature} />
      <UseCasesGrid feature={feature} />
      {feature.comparison && <ComparisonTable section={feature.comparison} />}
      <StatsRow feature={feature} />
      {feature.testimonials && <TestimonialsGrid section={feature.testimonials} />}
      <FAQAccordion feature={feature} />
      <CTABanner feature={feature} />
    </LandingLayout>
  );
}
