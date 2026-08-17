import { useState, type ComponentType, type ReactElement } from 'react';
import {
  ArrowLeft,
  BookMarked,
  ChartSpline,
  FileText,
  Grid3x3,
  Presentation,
} from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import type { TemplateFeature } from '../../lib/feature-meta';

/**
 * 「模板卡片」—— 智能助手空态(新对话)**输入框上方**的一组创作模板。
 *
 * 定位:PPT / 科研绘图 不是与「对话」并列的顶部 tab,而是**统一对话里可套用的模板**。默认就是普通聊天
 * (直接打字);想做 PPT / 画图就点对应卡进入该模板。每张卡带一段**封面动画诠释功能目的**。
 *
 * 另有「即将推出」占位卡(智能选刊 / 矩阵分析 / PDF-Chat)——仅视觉入口,点击 toast 提示。
 *
 * 布局:feature=claw 时把可选模板做成「扑克牌拱形展开」——卡片沿弧线扇形铺开、微旋转叠放,鼠标悬停哪张
 * 就把它扶正+放大+抬起聚焦(邻卡让位)。卡片数量增减自适应(2 张起,后续可加更多)。
 * feature=boltslides/sci_draw 时收成一条「已进入 <模板> 模式」的模式条(带缩略封面 + 换回对话)。
 * honors reduced-motion(静态展示成品,不做扇形/悬停动画)。
 */
export type { TemplateFeature };

interface CardMeta {
  key: string;
  /** claw 模板 feature;占位卡无此字段 */
  feature?: Exclude<TemplateFeature, 'claw'>;
  title: string;
  subtitle: string;
  Icon: ComponentType<{ className?: string }>;
  Illustration: (p: { reduce: boolean }) => ReactElement;
  /** 品牌强调色(悬停聚焦光环 + 模式条配色)。 */
  accent: {
    chip: string; // 图标底片
    focusRing: string; // 悬停聚焦时的环 + 边
    modeBar: string; // 模式条边 + 底
    modeText: string;
  };
  /** 功能尚未接线 —— 点击只 toast,不进 feature。 */
  comingSoon?: boolean;
}

const CARDS: CardMeta[] = [
  {
    key: 'ppt',
    feature: 'boltslides',
    title: '制作PPT',
    subtitle: '一句话描述主题 → 多页可交互演示稿',
    Icon: Presentation,
    Illustration: DeckIllustration,
    accent: {
      chip: 'bg-brand-amber/10 text-brand-amber',
      focusRing: 'ring-brand-amber/35 border-brand-amber/50',
      modeBar: 'border-brand-amber/40 bg-brand-amber/10',
      modeText: 'text-brand-amber',
    },
  },
  {
    key: 'scidraw',
    feature: 'sci_draw',
    title: '科研绘图',
    subtitle: '一句话描述 → 论文级图表 / 示意图',
    Icon: ChartSpline,
    Illustration: FigureIllustration,
    accent: {
      chip: 'bg-brand-green/10 text-brand-green',
      focusRing: 'ring-brand-green/35 border-brand-green/50',
      modeBar: 'border-brand-green/40 bg-brand-green/10',
      modeText: 'text-brand-green',
    },
  },
  {
    key: 'journal',
    title: 'scholay 选刊',
    subtitle: '根据稿件画像匹配目标期刊',
    Icon: BookMarked,
    Illustration: JournalPickIllustration,
    comingSoon: true,
    accent: {
      chip: 'bg-brand-red/10 text-brand-red',
      focusRing: 'ring-brand-red/35 border-brand-red/50',
      modeBar: 'border-brand-red/40 bg-brand-red/10',
      modeText: 'text-brand-red',
    },
  },
  {
    key: 'matrix',
    title: '矩阵分析',
    subtitle: '多文献多维度横向对比',
    Icon: Grid3x3,
    Illustration: MatrixIllustration,
    comingSoon: true,
    accent: {
      chip: 'bg-foreground/10 text-foreground',
      focusRing: 'ring-foreground/25 border-foreground/40',
      modeBar: 'border-border-strong bg-surface-1',
      modeText: 'text-foreground',
    },
  },
  {
    key: 'pdfchat',
    title: 'PDF-Chat',
    subtitle: '对着 PDF 提问 · 摘要 · 划段解读',
    Icon: FileText,
    Illustration: PdfChatIllustration,
    comingSoon: true,
    accent: {
      chip: 'bg-brand-amber/10 text-brand-amber',
      focusRing: 'ring-brand-amber/35 border-brand-amber/50',
      modeBar: 'border-brand-amber/40 bg-brand-amber/10',
      modeText: 'text-brand-amber',
    },
  },
];

export function TemplateCards({
  activeFeature,
  onPick,
}: {
  activeFeature: TemplateFeature;
  /** 选模板 → 切到对应 feature 的新对话(claw=换回普通对话,boltslides=进制作PPT)。 */
  onPick: (feature: TemplateFeature) => void;
}) {
  const reduce = useReducedMotion();

  // 模板模式空态:收成一条「已进入 <模板> 模式」的模式条(不再铺卡片,已在该模板里)。
  if (activeFeature !== 'claw') {
    const card = CARDS.find((c) => c.feature === activeFeature);
    if (!card) return null;
    return <SelectedModeBar card={card} reduce={!!reduce} onBack={() => onPick('claw')} />;
  }

  // 普通对话空态:扑克牌拱形展开的模板卡。
  return (
    <div className="w-full">
      <FanCards reduce={!!reduce} onPick={onPick} />
    </div>
  );
}

/**
 * 扇形展开的模板卡组。沿弧线微旋转 + 轻微叠放(扑克牌手感);悬停某张 → 扶正 + 放大 + 抬起 + 前置聚焦,
 * 邻卡向两侧让位并轻微退后。卡宽随数量收敛,保证整扇落在容器内。
 */
function FanCards({ reduce, onPick }: { reduce: boolean; onPick: (f: TemplateFeature) => void }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const n = CARDS.length;
  const center = (n - 1) / 2;

  // 数量自适应:卡越多越窄、叠得越多,保证整扇落在 max-w-2xl / max-w-3xl 容器内。
  const cardW = n <= 2 ? 15 : n === 3 ? 13.5 : n === 4 ? 11.5 : 9.5; // rem
  const overlap = n <= 2 ? 2.4 : n <= 4 ? 3 : 3.2; // rem,相邻卡重叠
  const SPREAD = n <= 2 ? 5 : n <= 4 ? 6.5 : 4.5; // deg / 步
  const ARC = 9; // px,外侧卡下沉形成拱形
  const LIFT = 16; // px,悬停抬起
  const PUSH = 16; // px,邻卡让位

  return (
    <div
      className={cn(
        'px-2',
        // reduced-motion:退化成普通一排(不叠不旋);正常:底对齐留出抬起空间的扇形容器
        // pt 只需 ≥ 悬停抬起量(LIFT=16px)即可,收紧到 pt-6 减少卡片上方的无用留白。
        reduce ? 'flex justify-center gap-3' : 'flex items-end justify-center pt-6 pb-1',
      )}
      data-tour="claw-templates"
      onMouseLeave={() => setHovered(null)}
    >
      {CARDS.map((card, i) => {
        const { key, feature, title, Illustration, accent, Icon, comingSoon } = card;
        const baseRot = (i - center) * SPREAD;
        const baseY = Math.abs(i - center) * ARC;
        const isH = hovered === i;
        const anySel = hovered !== null;

        // 悬停目标位姿(reduced-motion 时全部归零,纯静态平铺)。
        const rotate = reduce ? 0 : isH ? 0 : baseRot;
        const y = reduce ? 0 : isH ? baseY - LIFT : baseY;
        const x = reduce || !anySel || isH ? 0 : i < (hovered as number) ? -PUSH : PUSH;
        const scale = reduce ? 1 : isH ? 1.07 : anySel ? 0.97 : 1;
        const opacity = !reduce && anySel && !isH ? 0.88 : 1;

        return (
          <motion.button
            key={key}
            type="button"
            onClick={() => {
              if (comingSoon || !feature) {
                toast.message(`${title} · 即将推出`);
                return;
              }
              onPick(feature);
            }}
            onHoverStart={() => setHovered(i)}
            onFocus={() => setHovered(i)}
            onBlur={() => setHovered((h) => (h === i ? null : h))}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, rotate: baseRot }}
            animate={{ opacity, x, y, rotate, scale }}
            transition={{ type: 'spring', stiffness: 260, damping: 22, mass: 0.6 }}
            style={{
              width: `${cardW}rem`,
              marginLeft: reduce || i === 0 ? 0 : `-${overlap}rem`,
              transformOrigin: 'bottom center',
              zIndex: isH ? 30 : i + 1,
            }}
            className={cn(
              'group relative flex flex-col overflow-hidden rounded-xl border bg-background text-left shadow-sm outline-none transition-[border-color,box-shadow]',
              isH ? cn('ring-2', accent.focusRing) : 'border-border',
            )}
          >
            {/* 16:9 封面动画区(参考 制作PPT 的排版/尺寸) */}
            <div className="relative aspect-[16/9] w-full overflow-hidden bg-surface-2">
              <Illustration reduce={reduce} />
            </div>
            {/* 标签区 —— 只保留标题,居中;副文案在扇形卡上不展示(模式条里仍用 subtitle)。 */}
            <div className="flex items-center justify-center gap-2 px-3 py-2.5">
              <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-md', accent.chip)}>
                <Icon className="size-3.5" />
              </span>
              <div className="truncate text-base font-semibold text-foreground">{title}</div>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

/**
 * 已进入模板模式的「模式条」—— 替代旧的裸标签 pill:带缩略封面 + 模式名 + 一句引导 + 换回对话,
 * 弹性入场(spring)让「选中卡 → 进入模式」的衔接不再是硬切。honors reduced-motion。
 */
function SelectedModeBar({
  card,
  reduce,
  onBack,
}: {
  card: CardMeta;
  reduce: boolean;
  onBack: () => void;
}) {
  const { title, subtitle, Illustration, accent, Icon } = card;
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      className={cn(
        'mx-auto flex w-full max-w-md items-center gap-3 rounded-xl border px-3 py-2.5 shadow-sm',
        accent.modeBar,
      )}
    >
      {/* 缩略封面 —— 与刚点的卡片同一段动画,视觉延续。
          封面内部用了按整卡尺寸(~240px)标定的固定 px 内边距/条高,直接塞进 80px 缩略图会被压变形;
          故**按原始尺寸渲染再整体等比缩小**(scale),比例完全不变。 */}
      <div className="relative aspect-[16/9] w-20 shrink-0 overflow-hidden rounded-md bg-surface-2 ring-1 ring-black/5">
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{ width: '240px', height: '135px', transform: 'scale(0.3333)' }}
        >
          <div className="relative h-full w-full">
            <Illustration reduce={reduce} />
          </div>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className={cn('flex items-center gap-1.5 text-sm font-semibold', accent.modeText)}>
          <Icon className="size-3.5" />
          {title} 模式
        </div>
        <div className="mt-0.5 truncate text-2xs text-muted-foreground">{subtitle}</div>
      </div>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex shrink-0 items-center gap-1 rounded-pill px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        换回对话
      </button>
    </motion.div>
  );
}

/**
 * 制作PPT 封面(重做)—— **整块满铺的深色演示舞台**上,一张内容完整的当前幻灯片浮于身后两页之上
 * (暗示「多页演示稿」)。内容(kicker / 标题 / 要点 / 柱状图)**入场书写一次即定格保持**
 * (绝不循环淡出到空白 —— 那是之前整卡「全黑」的根因);底部页码点依次点亮,作为持续的「活着」信号。
 * 深色是演示稿产物的固有底色(见 agent/src/render/deckpptx.ts 的 background 05070A),token 无对应深色档,保留 literal。
 */
function DeckIllustration({ reduce }: { reduce: boolean }) {
  const bars = [0.42, 0.66, 0.5, 0.92, 0.62];
  const peakBar = bars.indexOf(Math.max(...bars)); // 仅最高柱着绿(与科研图峰值呼应)
  return (
    <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-[#111c30] via-[#0a1019] to-[#05070a]">
      {/* 右上柔光,给深底一点层次 */}
      <div className="pointer-events-none absolute -right-6 -top-8 size-24 rounded-full bg-brand-green/10 blur-2xl" />

      {/* 身后叠页(多页暗示,恒显) */}
      <div className="absolute left-1/2 top-1/2 h-[66%] w-[72%] -translate-x-[58%] -translate-y-1/2 rounded-lg bg-white/5 ring-1 ring-white/5" />
      <div className="absolute left-1/2 top-1/2 h-[72%] w-[78%] -translate-x-[54%] -translate-y-1/2 rounded-lg bg-white/5 ring-1 ring-white/10" />

      {/* 当前幻灯片(内容恒显) */}
      <div className="absolute left-1/2 top-1/2 flex h-[78%] w-[82%] -translate-x-1/2 -translate-y-1/2 flex-col gap-1.5 rounded-lg bg-white/10 p-3 ring-1 ring-white/20">
        {/* kicker */}
        <motion.div
          className="h-1 w-6 rounded-full bg-brand-green"
          style={{ transformOrigin: 'left' }}
          initial={{ scaleX: reduce ? 1 : 0 }}
          animate={{ scaleX: 1 }}
          transition={reduce ? { duration: 0 } : { duration: 0.4, delay: 0.2, ease: 'easeOut' }}
        />
        {/* 标题条 */}
        <motion.div
          className="h-2 rounded bg-white/85"
          initial={{ width: reduce ? '70%' : 0 }}
          animate={{ width: '70%' }}
          transition={reduce ? { duration: 0 } : { duration: 0.5, delay: 0.32, ease: 'easeOut' }}
        />
        {/* 要点条 */}
        <div className="mt-0.5 flex flex-col gap-1.5">
          {[0.84, 0.6].map((w, i) => (
            <motion.div
              key={i}
              className="h-1 rounded bg-white/30"
              initial={{ width: reduce ? `${w * 100}%` : 0 }}
              animate={{ width: `${w * 100}%` }}
              transition={reduce ? { duration: 0 } : { duration: 0.45, delay: 0.46 + i * 0.12, ease: 'easeOut' }}
            />
          ))}
        </div>
        {/* 柱状图(书写一次后定格)—— 中性灰柱 + 仅最高一根为绿(与科研图「绿色只做那个峰值」统一,
            避免整排绿块把两张卡的绿色分量拉得轻重不一)。 */}
        <div className="mt-auto flex h-6 items-end gap-1.5">
          {bars.map((h, i) => {
            const isPeak = i === peakBar;
            return (
              <motion.div
                key={i}
                className={cn(
                  'w-full rounded-sm',
                  isPeak ? 'bg-gradient-to-t from-brand-green/50 to-brand-green' : 'bg-white/20',
                )}
                initial={{ height: reduce ? `${h * 100}%` : 0 }}
                animate={{ height: `${h * 100}%` }}
                transition={reduce ? { duration: 0 } : { duration: 0.5, delay: 0.7 + i * 0.09, ease: 'easeOut' }}
              />
            );
          })}
        </div>
      </div>

      {/* 页码点(依次点亮 —— 持续但恒显,最低 0.35 不会全灭) */}
      <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="size-1 rounded-full bg-white/50"
            initial={{ opacity: reduce ? (i === 0 ? 1 : 0.35) : 0.35 }}
            animate={reduce ? undefined : { opacity: [0.35, 1, 0.35] }}
            transition={
              reduce ? undefined : { duration: 0.8, delay: i * 1.2, repeat: Infinity, repeatDelay: 2.8, ease: 'easeInOut' }
            }
          />
        ))}
      </div>
    </div>
  );
}

/**
 * 科研绘图封面(重绘)—— 一张「论文级面积图」在坐标系里逐步生成:淡网格 + 坐标轴,平滑曲线沿路径画出,
 * 曲线下方渐显半透明面积填充,数据点依次弹入,并有一条虚线对照序列。整体像 AI 在绘制一张规范的科研图。
 * reduced-motion 下静态展示成品图。
 */
function FigureIllustration({ reduce }: { reduce: boolean }) {
  // 论文级面积图 —— **整块满铺封面、无内边框/留白**(对齐 制作PPT 的满填设计)。
  // 入场画一次即定格保持(绝不循环淡出到空白 —— 那是之前「图不见了」的根因);仅峰值点保留一个
  // 轻微脉冲光晕作为「活着」的信号,底下的成品图恒在。坐标贴边铺满整个 16:9。
  const BASE = 52; // 面积基线(接近底边)
  const main: [number, number][] = [
    [4, 34],
    [28, 22],
    [50, 27],
    [74, 11],
    [98, 18],
  ];
  const cmp: [number, number][] = [
    [4, 40],
    [28, 37],
    [50, 33],
    [74, 29],
    [98, 25],
  ];
  const line = (pts: [number, number][]) => `M ${pts.map((p) => p.join(' ')).join(' L ')}`;
  const area = `${line(main)} L 98 ${BASE} L 4 ${BASE} Z`;
  const peak = main[3];

  return (
    <div className="absolute inset-0 bg-gradient-to-b from-surface-1 to-background">
      <svg viewBox="0 0 100 56" preserveAspectRatio="none" className="h-full w-full">
        {/* 淡网格(满宽) */}
        {[14, 26, 38].map((gy) => (
          <line key={gy} x1="0" y1={gy} x2="100" y2={gy} className="stroke-current text-border" strokeWidth="0.5" />
        ))}
        {/* 基线(满宽,替代内边框式坐标轴,保留「图表感」但不围边) */}
        <line x1="0" y1={BASE} x2="100" y2={BASE} className="stroke-current text-border-strong" strokeWidth="0.8" />

        {/* 面积填充:淡入一次后保持 */}
        <motion.path
          d={area}
          className="fill-current text-brand-green"
          initial={{ opacity: reduce ? 0.16 : 0 }}
          animate={{ opacity: 0.16 }}
          transition={reduce ? { duration: 0 } : { duration: 0.7, delay: 1.15, ease: 'easeOut' }}
        />

        {/* 对照序列(虚线):淡入一次后保持 */}
        <motion.path
          d={line(cmp)}
          fill="none"
          className="stroke-current text-faint"
          strokeWidth="1.4"
          strokeDasharray="3 3"
          strokeLinecap="round"
          initial={{ opacity: reduce ? 0.7 : 0 }}
          animate={{ opacity: 0.7 }}
          transition={reduce ? { duration: 0 } : { duration: 0.6, delay: 0.9, ease: 'easeOut' }}
        />

        {/* 主曲线:pathLength 画一次到 1 后保持(不再回 0) */}
        <motion.path
          d={line(main)}
          fill="none"
          className="stroke-current text-brand-green"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: reduce ? 1 : 0 }}
          animate={{ pathLength: 1 }}
          transition={reduce ? { duration: 0 } : { duration: 1.3, ease: 'easeInOut' }}
        />

        {/* 峰值点脉冲光晕(唯一持续动画;放大淡出的是光晕,底下实心点恒在,绝不致空白) */}
        {!reduce && (
          <motion.circle
            cx={peak[0]}
            cy={peak[1]}
            className="fill-current text-brand-green"
            initial={{ r: 2.6, opacity: 0 }}
            animate={{ r: [2.6, 7.5], opacity: [0.4, 0] }}
            transition={{ duration: 1.9, repeat: Infinity, ease: 'easeOut', delay: 1.5 }}
          />
        )}

        {/* 数据点(白描边,论文风):依次淡入一次后保持 */}
        {main.map(([cx, cy], i) => (
          <motion.circle
            key={i}
            cx={cx}
            cy={cy}
            r="2.6"
            className="fill-current text-brand-green"
            stroke="white"
            strokeWidth="0.9"
            initial={{ opacity: reduce ? 1 : 0 }}
            animate={{ opacity: 1 }}
            transition={reduce ? { duration: 0 } : { duration: 0.28, delay: 0.5 + i * 0.13, ease: 'easeOut' }}
          />
        ))}
      </svg>
    </div>
  );
}

/** 智能选刊封面(占位)—— 期刊封面叠卡 + 分区徽章依次点亮。 */
function JournalPickIllustration({ reduce }: { reduce: boolean }) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-brand-red/10 via-surface-1 to-background">
      <div className="pointer-events-none absolute -left-4 top-2 size-20 rounded-full bg-brand-red/10 blur-2xl" />
      {/* 叠放的期刊封面 */}
      <div className="absolute left-1/2 top-1/2 h-[62%] w-[38%] -translate-x-[90%] -translate-y-[45%] rotate-[-8deg] rounded-sm bg-brand-red/15 ring-1 ring-brand-red/20" />
      <div className="absolute left-1/2 top-1/2 h-[68%] w-[42%] -translate-x-[40%] -translate-y-1/2 rotate-[4deg] rounded-sm bg-background shadow-sm ring-1 ring-border">
        <motion.div
          className="mx-2 mt-2 h-1.5 rounded-full bg-brand-red/70"
          initial={{ width: reduce ? '70%' : 0 }}
          animate={{ width: '70%' }}
          transition={reduce ? { duration: 0 } : { duration: 0.45, delay: 0.15 }}
        />
        <div className="mx-2 mt-2 space-y-1">
          {[0.85, 0.6, 0.72].map((w, i) => (
            <motion.div
              key={i}
              className="h-1 rounded-full bg-foreground/15"
              initial={{ width: reduce ? `${w * 100}%` : 0 }}
              animate={{ width: `${w * 100}%` }}
              transition={reduce ? { duration: 0 } : { duration: 0.4, delay: 0.3 + i * 0.1 }}
            />
          ))}
        </div>
      </div>
      {/* 分区徽章 */}
      <div className="absolute bottom-2.5 right-3 flex gap-1">
        {['Q1', '1区'].map((label, i) => (
          <motion.span
            key={label}
            className="rounded-pill bg-brand-red px-1.5 py-0.5 text-[8px] font-bold text-white"
            initial={{ opacity: reduce ? 1 : 0, y: reduce ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.35, delay: 0.55 + i * 0.12 }}
          >
            {label}
          </motion.span>
        ))}
      </div>
    </div>
  );
}

/** 矩阵分析封面(占位)—— 淡网格 + 单元格依次填色。 */
function MatrixIllustration({ reduce }: { reduce: boolean }) {
  const cells = [
    [1, 0, 1, 0],
    [0, 1, 1, 1],
    [1, 1, 0, 1],
  ];
  return (
    <div className="absolute inset-0 overflow-hidden bg-gradient-to-b from-surface-1 to-background p-3">
      <div className="flex h-full flex-col gap-1">
        {cells.map((row, ri) => (
          <div key={ri} className="flex flex-1 gap-1">
            {row.map((on, ci) => (
              <motion.div
                key={`${ri}-${ci}`}
                className={cn(
                  'flex-1 rounded-sm ring-1 ring-border',
                  on ? 'bg-foreground/70' : 'bg-background',
                )}
                initial={{ opacity: reduce ? 1 : 0, scale: reduce ? 1 : 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={
                  reduce
                    ? { duration: 0 }
                    : { duration: 0.3, delay: 0.12 + (ri * 4 + ci) * 0.05, ease: 'easeOut' }
                }
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** PDF-Chat 封面(占位)—— 左侧 PDF 页 + 右侧对话气泡依次出现。 */
function PdfChatIllustration({ reduce }: { reduce: boolean }) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-brand-amber/10 via-surface-1 to-background">
      {/* PDF 页 */}
      <div className="absolute left-3 top-1/2 h-[72%] w-[36%] -translate-y-1/2 rounded-sm bg-background shadow-sm ring-1 ring-border">
        <div className="space-y-1 p-1.5">
          {[0.9, 0.7, 0.8, 0.55].map((w, i) => (
            <div
              key={i}
              className="h-1 rounded-full bg-foreground/12"
              style={{ width: `${w * 100}%` }}
            />
          ))}
        </div>
      </div>
      {/* 对话气泡 */}
      <div className="absolute right-3 top-1/2 flex w-[42%] -translate-y-1/2 flex-col gap-1.5">
        {[
          { cls: 'self-start bg-brand-amber/25', w: '85%' },
          { cls: 'self-end bg-background ring-1 ring-border', w: '70%' },
          { cls: 'self-start bg-brand-amber/25', w: '60%' },
        ].map((b, i) => (
          <motion.div
            key={i}
            className={cn('h-3 rounded-pill', b.cls)}
            style={{ width: b.w }}
            initial={{ opacity: reduce ? 1 : 0, x: reduce ? 0 : 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.35, delay: 0.2 + i * 0.15 }}
          />
        ))}
      </div>
    </div>
  );
}
