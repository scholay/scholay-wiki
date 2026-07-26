import { Sparkles } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/shared/lib/utils';
import { BrandLogo } from '@/shared/components/BrandLogo';
import { SmartComposer } from './SmartComposer';

/**
 * 智能搜索「起始态」hero —— 没有任何对话时(未登录 / 已登录但新会话)居中展示的入口,
 * 形态对齐 Claude / Codex 这类 AI 软件的新会话页:
 *   - 背景大色块流动(品牌色巨型光斑漂浮 + 呼吸明灭,整屏灵动)
 *   - 中央一个对话框(与对话中底部栏**同一个 SmartComposer**,样式一致)
 *   - 示例提问做成输入框内的轮播 placeholder(不再单独铺一排 chip)
 *   - 标题挂钩品牌:和 <Scholay 多色 logo> 一起找论文
 *
 * 动效注意:reduced-motion 下**不再完全静止** —— 位移(可能引起前庭不适)去掉,
 * 但保留原地的透明度 / 缩放呼吸,确保任何系统设置下都看得到「活着」的背景。
 */

// 输入框内轮播的示例提问。
const SUGGESTIONS = [
  '帮我找 3 篇大语言模型可解释性的代表论文',
  '最近三年扩散模型在图像生成上的综述',
  '对比 Transformer 与 Mamba 的长序列建模',
  '检索增强生成 (RAG) 有哪些高引代表作',
];

export interface SmartSearchHeroProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  /** 未登录态:输入框发送键变登录键,提交触发登录。 */
  loggedOut?: boolean;
  /** 已登录态:WS 是否就绪(未就绪禁用发送)。 */
  ready?: boolean;
  /** 附件/引用装配插槽(2026-07 输入框统一)—— 原样转发 SmartComposer,起手即可带附件。 */
  composerExtras?: Pick<
    import('./SmartComposer').SmartComposerProps,
    'plusSlot' | 'topExtras' | 'canSendEmpty' | 'onPaste' | 'containerProps' | 'overlay' | 'modelSlot'
  >;
}

export function SmartSearchHero({
  value,
  onChange,
  onSubmit,
  loggedOut = false,
  ready = true,
  composerExtras,
}: SmartSearchHeroProps) {
  return (
    <div className="relative flex-1 min-h-0 flex flex-col items-center justify-center overflow-hidden px-6 py-8">
      <AmbientBackdrop />

      <div className="relative z-raised flex w-full max-w-2xl flex-col items-center gap-6">
        {/* 图标 + 标题(挂钩品牌:和 Scholay 一起找论文) */}
        <div className="flex flex-col items-center gap-3">
          <HeroSpark />
          <h2 className="flex flex-wrap items-center justify-center gap-x-1.5 text-24 font-medium text-foreground">
            <span>和</span>
            {/* 句中内联 —— 只用文字标(放完整锁定组合会打断句子),
                高度 17px 对齐周围 text-24 的大写字身高 */}
            <BrandLogo variant="wordmark" height={17} />
            <span>一起找论文</span>
          </h2>
        </div>

        {/* 对话框 —— 普通 div。原「共用 layoutId 从居中滑到底部」的共享 layout 动画已移除
            (会 scaleY morph 高度、被路由过渡打断即卡住 → 输入框拉高变形)。 */}
        <div className="w-full">
          <SmartComposer
            prominent
            autoFocus
            value={value}
            onChange={onChange}
            onSubmit={onSubmit}
            loggedOut={loggedOut}
            ready={ready}
            rotatingPlaceholders={SUGGESTIONS}
            {...composerExtras}
          />
        </div>
      </div>
    </div>
  );
}

/** 标题上方的图标 —— 外发光脉冲 + 轻微呼吸缩放(原地动效,reduced-motion 下也保留)。 */
function HeroSpark() {
  return (
    <div className="relative">
      <motion.div
        className="absolute inset-0 rounded-16 bg-brand-green/30 blur-xl"
        animate={{ scale: [1, 1.6, 1], opacity: [0.5, 0, 0.5] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="relative flex size-14 items-center justify-center rounded-16 bg-surface-2"
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Sparkles className="size-7 text-brand-green" strokeWidth={1.8} />
      </motion.div>
    </div>
  );
}

/**
 * 灵动背景 —— 几个**巨型品牌色光斑**(大色块)漂浮 + 呼吸明灭,模糊叠加成流动的极光感。
 * 配色克制(只用绿 + 琥珀同类色,避免红绿叠出脏褐色),不透明度压低让它「融进」白底而不突兀。
 * reduced-motion 下:去掉位移(前庭不适来源),保留原地的透明度 / 缩放呼吸 → 仍然在动。
 * size-[34rem]~[38rem] 超出 Tailwind 默认档位(最大 size-96=24rem),用 arbitrary value 表达「大色块」。
 */
function AmbientBackdrop() {
  const reduce = useReducedMotion();
  const blobs = [
    {
      cls: '-left-28 -top-24 size-[36rem] bg-brand-green/16',
      anim: { x: [0, 90, 0], y: [0, 70, 0], scale: [1, 1.22, 1], opacity: [0.5, 1, 0.5] },
      calm: { scale: [1, 1.15, 1], opacity: [0.45, 1, 0.45] },
      dur: 12,
    },
    {
      cls: '-right-32 top-8 size-[38rem] bg-brand-amber/16',
      anim: { x: [0, -84, 0], y: [0, 80, 0], scale: [1, 1.26, 1], opacity: [0.55, 1, 0.55] },
      calm: { scale: [1, 1.18, 1], opacity: [0.5, 1, 0.5] },
      dur: 14,
    },
    {
      cls: '-bottom-32 left-1/4 size-[36rem] bg-brand-green/12',
      anim: { x: [0, 76, 0], y: [0, -64, 0], scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] },
      calm: { scale: [1, 1.16, 1], opacity: [0.45, 0.95, 0.45] },
      dur: 13,
    },
    {
      cls: 'top-1/3 left-1/4 size-[34rem] bg-brand-amber/12',
      anim: { x: [0, -70, 0], y: [0, 60, 0], scale: [1, 1.18, 1], opacity: [0.45, 0.95, 0.45] },
      calm: { scale: [1, 1.14, 1], opacity: [0.4, 0.9, 0.4] },
      dur: 16,
    },
  ];
  return (
    <div
      className="pointer-events-none absolute inset-0 z-base overflow-hidden"
      aria-hidden="true"
    >
      {blobs.map((b) => (
        <motion.div
          key={b.cls}
          className={cn('absolute rounded-pill blur-3xl', b.cls)}
          animate={reduce ? b.calm : b.anim}
          transition={{ duration: b.dur, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}
