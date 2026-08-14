import type { Transition } from 'framer-motion';

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
 *
 * ──────────────────────────────────────────────────────────────────────────
 * 🎯 这里是 TS 侧动效与 globals.css §15 的【唯一对齐点】。
 *
 * framer 的 transition 只吃数字(秒),读不到 CSS 变量,所以 token 值只能在这里手抄一份。
 * globals.css §15 明写「CSS 侧与 TS 侧必须共用同一组数值」—— 下面所有 duration
 * 都必须落在这四档上,不允许出现第五个值(否则同一次交互一半走 CSS 一半走 framer
 * 会明显不同步,那正是改造前的状态)。改 token 必须两边一起改。
 *
 *   --duration-fast        160ms  → 0.16
 *   --duration-base        280ms  → 0.28
 *   --duration-slow        420ms  → 0.42
 *   --duration-deliberate  700ms  → 0.7
 *
 * ease 同理(bezier 手抄):
 *   --ease-out        cubic-bezier(0, 0, 0.2, 1)
 *   --ease-in-out     cubic-bezier(0.4, 0, 0.2, 1)
 *   --ease-emphasized cubic-bezier(0.22, 1, 0.36, 1)
 * ──────────────────────────────────────────────────────────────────────────
 */

/** 底部弹窗 / sheet 弹出回落 —— 略带回弹的 spring(进出场一致用它)。0.42 = --duration-slow。 */
export const SHEET_SPRING: Transition = { type: 'spring', bounce: 0.12, duration: 0.42 };

/**
 * 轻量 UI(tab 指示器 / 小位移)—— 干脆利落、几乎无回弹。
 * 物理弹簧(stiffness/damping/mass),不产生固定时长,故不在 --duration-* 四档约束内。
 */
export const SNAPPY_SPRING: Transition = { type: 'spring', stiffness: 460, damping: 38, mass: 0.9 };

/** 通用淡入淡出(蒙层 / 内容切换)。0.16 = --duration-fast,ease = --ease-out。 */
export const FADE: Transition = { duration: 0.16, ease: [0, 0, 0.2, 1] };

/** 页面 / 路由转场时长与缓动。0.28 = --duration-base,ease = --ease-emphasized。 */
export const PAGE_TRANSITION: Transition = { duration: 0.28, ease: [0.22, 1, 0.36, 1] };

// ⚠️ 采用现状(2026-08-12 审计):FADE / PAGE_TRANSITION 当前零消费,但它们是
// design-system-guard「动效 token 跨语言对齐」规则的锚点(要求 ≥3 个带绑定声明的
// 固定时长预设),保留作为新代码的既定入口。曾导出的 TAP_SCALE / overlayVariants /
// sheetVariants / pageVariants 同样零消费且不携带 token 绑定,已删除。
// 新动画:优先复用上面的预设;不要在组件里 inline 手搓四档之外的第五个时长。
