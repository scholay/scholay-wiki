import type { Transition, Variants } from 'framer-motion';

/**
 * 移动端动画统一预设 —— 一处定义所有 spring / 时长 / 缓动,杜绝各页面手搓不一致的 transition。
 *
 * 配套使用:
 *   - MobileShell 外层包 `<LazyMotion features={domMax}>`(只装一次 dom 动画特性,
 *     比整包 `motion` 小)+ `<MotionConfig reducedMotion="user">`(自动尊重系统「减少动态」)。
 *   - 组件里用 framer-motion 的 `m.*`(不是 `motion.*`)以命中 LazyMotion 的瘦身。
 *   - CSS 关键帧 / Radix 动画的「减少动态」在 globals.css 里有全局 @media 兜底。
 *
 * 选型理由见 frontend CLAUDE.md:framer-motion 已是项目规范的复杂动画库,这里只做收口,
 * 不引入新依赖(@use-gesture 等)。
 */

/** 底部弹窗 / sheet 弹出回落 —— 略带回弹的 spring(进出场一致用它)。 */
export const SHEET_SPRING: Transition = { type: 'spring', bounce: 0.12, duration: 0.42 };

/** 轻量 UI(tab 指示器 / 小位移)—— 干脆利落、几乎无回弹。 */
export const SNAPPY_SPRING: Transition = { type: 'spring', stiffness: 460, damping: 38, mass: 0.9 };

/** 通用淡入淡出(蒙层 / 内容切换)。 */
export const FADE: Transition = { duration: 0.18, ease: 'easeOut' };

/** 页面 / 路由转场时长与缓动。 */
export const PAGE_TRANSITION: Transition = { duration: 0.22, ease: [0.22, 1, 0.36, 1] };

/** 按压微反馈:配合 `whileTap` 用在可点元素上(也可用纯 CSS active:scale 替代)。 */
export const TAP_SCALE = { scale: 0.97 } as const;

/** 蒙层进出场 variants。 */
export const overlayVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

/** 底部 sheet 进出场 variants(配合 SHEET_SPRING)。 */
export const sheetVariants: Variants = {
  hidden: { y: '100%' },
  visible: { y: 0 },
};

/** 路由页淡入 + 轻微上移 variants(配合 PAGE_TRANSITION)。 */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  enter: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};
