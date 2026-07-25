import type { ComponentType } from 'react';
import { ChartSpline, MessageSquare, Presentation } from 'lucide-react';

/** 智能助手页承载的三个 feature:claw 基础对话 + 两个创作模板(制作PPT / 科研绘图)。 */
export type TemplateFeature = 'claw' | 'boltslides' | 'sci_draw';

/**
 * feature → 图标(**单一真源**)。凡是露出 feature 图标的地方 —— 模板卡(TemplateCards)、会话历史徽标
 * (UnifiedSessionList)等 —— 都从这里取,改一处即全局同步,避免「换了模板图标但侧栏漏改」的漂移。
 *   - claw       普通对话      MessageSquare(视觉强度最弱,渲染方用更淡的颜色)
 *   - boltslides 制作PPT       Presentation
 *   - sci_draw   科研绘图      ChartSpline
 */
export const FEATURE_ICON: Record<TemplateFeature, ComponentType<{ className?: string }>> = {
  claw: MessageSquare,
  boltslides: Presentation,
  sci_draw: ChartSpline,
};
