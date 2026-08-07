import { useId, useState, type ReactElement } from 'react';
import { ArrowLeft } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/shared/lib/utils';
import { FEATURE_ICON, type TemplateFeature } from '../../lib/feature-meta';

/**
 * 「模板卡片」—— 智能助手空态(新对话)**输入框上方**的一组创作模板。
 *
 * 定位:PPT / 科研绘图 不是与「对话」并列的顶部 tab,而是**统一对话里可套用的模板**。默认就是普通聊天
 * (直接打字);想做 PPT / 画图就点对应卡进入该模板。每张卡带一段**封面动画诠释功能目的**。
 *
 * 布局:feature=claw 时把可选模板做成「扑克牌拱形展开」——卡片沿弧线扇形铺开、微旋转叠放,鼠标悬停哪张
 * 就把它扶正+放大+抬起聚焦(邻卡让位)。卡片数量增减自适应(2 张起,后续可加更多)。
 * feature=boltslides/sci_draw 时收成一条「已进入 <模板> 模式」的模式条(带缩略封面 + 换回对话)。
 * honors reduced-motion(静态展示成品,不做扇形/悬停动画)。
 */
export type { TemplateFeature };

interface CardMeta {
  key: string;
  feature: Exclude<TemplateFeature, 'claw'>;
  title: string;
  subtitle: string;
  Illustration: (p: { reduce: boolean }) => ReactElement;
  /** 品牌强调色(悬停聚焦光环 + 模式条配色)。 */
  accent: {
    chip: string; // 图标底片
    focusRing: string; // 悬停聚焦时的环 + 边
    modeBar: string; // 模式条边 + 底
    modeText: string;
  };
}

const CARDS: CardMeta[] = [
  {
    key: 'ppt',
    feature: 'boltslides',
    title: '制作PPT',
    subtitle: '一句话描述主题 → 多页可交互演示稿',
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
    Illustration: FigureIllustration,
    accent: {
      chip: 'bg-brand-green/10 text-brand-green',
      focusRing: 'ring-brand-green/35 border-brand-green/50',
      modeBar: 'border-brand-green/40 bg-brand-green/10',
      modeText: 'text-brand-green',
    },
  },
  {
    key: 'statlab',
    feature: 'stat_lab',
    title: '数据分析',
    subtitle: '传数据 → 自动选对检验 → 三线表与结果段',
    Illustration: StatsIllustration,
    accent: {
      chip: 'bg-brand-red/10 text-brand-red',
      focusRing: 'ring-brand-red/35 border-brand-red/50',
      modeBar: 'border-brand-red/40 bg-brand-red/10',
      modeText: 'text-brand-red',
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
      <div className="mb-1.5 text-center text-12 uppercase text-faint">
        从模板开始 · 或直接输入
      </div>
      <FanCards reduce={!!reduce} onPick={onPick} />
      <div className="mt-2 text-center text-12 text-faint">更多创作模板陆续加入</div>
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

  // 数量自适应:卡越多越窄、叠得越多,保证一扇不超出 max-w-2xl 容器。
  const cardW = n <= 2 ? 15 : n === 3 ? 13.5 : 12; // rem
  const overlap = n <= 2 ? 2.4 : 3; // rem,相邻卡重叠
  const SPREAD = n <= 2 ? 5 : 6.5; // deg / 步
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
      onMouseLeave={() => setHovered(null)}
    >
      {CARDS.map((card, i) => {
        const { key, feature, title, subtitle, Illustration, accent } = card;
        const Icon = FEATURE_ICON[feature];
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
            onClick={() => onPick(feature)}
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
              // 兄弟卡之间的叠压次序(扇形叠牌:后一张压前一张,hover 的那张提到最上)。
              // 不是全站浮层层级,故刻意不走 --z-* 标度 —— 值随 index 动态计算,只在本扇形内比较。
              zIndex: isH ? 30 : i + 1,
            }}
            className={cn(
              'group relative flex flex-col overflow-hidden rounded-12 border bg-surface-card text-left transition-[border-color,box-shadow]',
              isH ? cn('ring-2', accent.focusRing) : 'border-border',
            )}
          >
            {/* 16:9 封面动画区(参考 制作PPT 的排版/尺寸) */}
            <div className="relative aspect-[16/9] w-full overflow-hidden bg-surface-2">
              <Illustration reduce={reduce} />
            </div>
            {/* 标签区 */}
            <div className="flex items-center gap-2 px-3 py-2.5">
              <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-8', accent.chip)}>
                <Icon className="size-3.5" />
              </span>
              <div className="min-w-0">
                <div className="truncate text-14 font-medium text-foreground">{title}</div>
                <div className="truncate text-12 text-muted-foreground">{subtitle}</div>
              </div>
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
  const { feature, title, subtitle, Illustration, accent } = card;
  const Icon = FEATURE_ICON[feature];
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      className={cn(
        'mx-auto flex w-full max-w-md items-center gap-3 rounded-12 border px-3 py-2.5',
        accent.modeBar,
      )}
    >
      {/* 缩略封面 —— 与刚点的卡片同一段动画,视觉延续。
          封面内部用了按整卡尺寸(~240px)标定的固定 px 内边距/条高,直接塞进 80px 缩略图会被压变形;
          故**按原始尺寸渲染再整体等比缩小**(scale),比例完全不变。 */}
      <div className="relative aspect-[16/9] w-20 shrink-0 overflow-hidden rounded-8 bg-surface-2 ring-1 ring-foreground/5">
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
        <div className={cn('flex items-center gap-1.5 text-14 font-medium', accent.modeText)}>
          <Icon className="size-3.5" />
          {title} 模式
        </div>
        <div className="mt-0.5 truncate text-12 text-muted-foreground">{subtitle}</div>
      </div>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex shrink-0 items-center gap-1 rounded-pill px-2.5 py-1.5 text-12 text-muted-foreground transition-colors hover:bg-surface-card/60 hover:text-foreground"
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
      <div className="pointer-events-none absolute -right-6 -top-8 size-24 rounded-pill bg-brand-green/10 blur-2xl" />

      {/* 身后叠页(多页暗示,恒显) */}
      <div className="absolute left-1/2 top-1/2 h-[66%] w-[72%] -translate-x-[58%] -translate-y-1/2 rounded-8 bg-surface-card/5 ring-1 ring-on-brand/5" />
      <div className="absolute left-1/2 top-1/2 h-[72%] w-[78%] -translate-x-[54%] -translate-y-1/2 rounded-8 bg-surface-card/5 ring-1 ring-on-brand/10" />

      {/* 当前幻灯片(内容恒显) */}
      <div className="absolute left-1/2 top-1/2 flex h-[78%] w-[82%] -translate-x-1/2 -translate-y-1/2 flex-col gap-1.5 rounded-8 bg-surface-card/10 p-3 ring-1 ring-on-brand/20">
        {/* kicker */}
        <motion.div
          className="h-1 w-6 rounded-pill bg-brand-green"
          style={{ transformOrigin: 'left' }}
          initial={{ scaleX: reduce ? 1 : 0 }}
          animate={{ scaleX: 1 }}
          transition={reduce ? { duration: 0 } : { duration: 0.4, delay: 0.2, ease: 'easeOut' }}
        />
        {/* 标题条 */}
        <motion.div
          className="h-2 rounded-4 bg-surface-card/85"
          initial={{ width: reduce ? '70%' : 0 }}
          animate={{ width: '70%' }}
          transition={reduce ? { duration: 0 } : { duration: 0.5, delay: 0.32, ease: 'easeOut' }}
        />
        {/* 要点条 */}
        <div className="mt-0.5 flex flex-col gap-1.5">
          {[0.84, 0.6].map((w, i) => (
            <motion.div
              key={i}
              className="h-1 rounded-4 bg-surface-card/30"
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
                  'w-full rounded-4',
                  isPeak ? 'bg-gradient-to-t from-brand-green/50 to-brand-green' : 'bg-surface-card/20',
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
            className="size-1 rounded-pill bg-surface-card/50"
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

        {/* 数据点(白描边光晕,论文风):依次淡入一次后保持。
            底是浅色(from-surface-1 to-background),白圈用于把点从同色面积填充里「抠」出来
            → 走 surface-card(=#FFFFFF 内层纯白 token),不是深底前景色族。 */}
        {main.map(([cx, cy], i) => (
          <motion.circle
            key={i}
            cx={cx}
            cy={cy}
            r="2.6"
            className="fill-current stroke-surface-card text-brand-green"
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

/**
 * 正态密度的小提琴轮廓(闭合路径)。**只在 ±2.6σ 内取样**:取满会在两端拖出一条宽度≈0 的
 * 「发丝垂尾」—— 左右两侧路径几乎重合、描边叠成一根竖线,在 216px 卡上非常显眼(实测)。
 * 72 个采样点是「曲线够顺」与「路径字符串够短」的折中,再少两端会露出多边形折角。
 */
function violinPath(cx: number, mu: number, sd: number, maxW: number): string {
  const Z = 2.6;
  const N = 72;
  const lo = mu - Z * sd;
  const hi = mu + Z * sd;
  const right: string[] = [];
  const left: string[] = [];
  for (let i = 0; i <= N; i++) {
    const y = lo + ((hi - lo) * i) / N;
    const z = (y - mu) / sd;
    const w = maxW * Math.exp(-0.5 * z * z);
    right.push(`${(cx + w).toFixed(2)} ${y.toFixed(2)}`);
    left.push(`${(cx - w).toFixed(2)} ${y.toFixed(2)}`);
  }
  left.reverse();
  return `M ${right.concat(left).join(' L ')} Z`;
}

/**
 * 数据分析封面(2026-08-08 重绘)—— 画的是**这张卡真正在卖的东西**:不是「能画箱线图」
 * (那是科研绘图那张卡),而是「两组比较 → 检验 → 显著性结论」。
 *
 * 构图:两把 **小提琴 + 内嵌箱线 + 白色中位点**(对照组玄墨 / 实验组朱砂),上方一条显著性
 * 标线穿过 `P<.001` 胶囊,基线下两条组别标签条。满铺 16:9。
 *
 * 为什么换掉上一版(两个细箱线 + 裸星号):① 内容全挤在上半区、下 1/4 与左右两侧大片空白;
 * ② 箱线**只有上须没有下须**、直角细描边,像两个小窗框而不像统计图;③ 星号 `y=4.2` 顶到画布
 * 边缘,几乎被裁掉,且「一个星号」在缩略图里等于没有;④ 两组同为朱砂 → 看不出「对照 vs 实验」。
 *
 * 为什么是小提琴而不是继续用箱线:同排的科研绘图卡是**面积图**,箱线太细弱压不住场,而面积图
 * 语言又与它撞车;小提琴的密度轮廓既是统计学独有的图形语言,又有足够的体量与曲线感,在
 * 216px 卡与 80px 缩略图(模式条)上都能一眼认出来。
 *
 * 动效:入场**画一次即定格**(绝不循环淡出到空白 —— 那是之前「图不见了」的根因);唯一持续的
 * 「活着」信号是实验组中位点的白色光晕脉冲(底下的实心点恒在)。honors reduced-motion。
 */
function StatsIllustration({ reduce }: { reduce: boolean }) {
  // 同一页会同时挂多个实例(扇形里的卡 + 模式条里的缩略图),渐变 id 必须实例唯一,
  // 否则 url(#id) 一律解析到文档里第一个同名节点。useId() 带冒号,不能直接进 url()。
  const uid = useId().replace(/:/g, '');
  const BASE = 74; // 基线(x 轴)
  const BOX_W = 10; // 内嵌箱体宽
  const groups = [
    // 对照组:玄墨中性 —— 与实验组的朱砂形成「基准 vs 处理」的对照关系
    { key: 'ctrl', cx: 46, mu: 58, sd: 5.7, maxW: 21, q3: 54, q1: 62, med: 58, wLo: 48, wHi: 68, accent: false },
    // 实验组:朱砂 —— 位置更高(效应),是整张图的视觉主角
    { key: 'exp', cx: 114, mu: 40, sd: 5.7, maxW: 23, q3: 36, q1: 44, med: 40, wLo: 30, wHi: 50, accent: true },
  ];

  return (
    <div className="absolute inset-0 bg-gradient-to-b from-surface-1 to-background">
      {/* viewBox 160×90 = 精确 16:9,与容器同比,故 preserveAspectRatio="none" 不产生形变 */}
      <svg viewBox="0 0 160 90" preserveAspectRatio="none" className="h-full w-full">
        <defs>
          {/* stopColor="currentColor" + 类名给 color:两个渐变都走设计 token,不落任何字面色值 */}
          <linearGradient id={`${uid}-accent`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.36" className="text-brand-red" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.08" className="text-brand-red" />
          </linearGradient>
          <linearGradient id={`${uid}-ink`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.13" className="text-foreground" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.03" className="text-foreground" />
          </linearGradient>
        </defs>

        {/* 淡网格 + 基线(满宽贴边,与科研绘图卡同一套坐标语言) */}
        {[34, 48, 62].map((gy) => (
          <line key={gy} x1="0" y1={gy} x2="160" y2={gy} className="stroke-current text-border" strokeWidth="0.7" />
        ))}
        <line x1="0" y1={BASE} x2="160" y2={BASE} className="stroke-current text-border-strong" strokeWidth="1.1" />

        {groups.map((g, i) => {
          const tone = g.accent ? 'text-brand-red' : 'text-subtle';
          return (
            <motion.g
              key={g.key}
              // 从基线「长出来」:transform-origin 定在该组基线中点(动态计算值,不是设计 token 能表达的东西)
              style={{ transformBox: 'view-box', transformOrigin: `${g.cx}px ${BASE}px` }}
              initial={reduce ? { opacity: 1, scaleY: 1 } : { opacity: 0, scaleY: 0.2 }}
              animate={{ opacity: 1, scaleY: 1 }}
              transition={reduce ? { duration: 0 } : { duration: 0.42, delay: 0.18 + i * 0.16, ease: 'easeOut' }}
            >
              {/* 密度轮廓 */}
              <path
                d={violinPath(g.cx, g.mu, g.sd, g.maxW)}
                fill={`url(#${uid}-${g.accent ? 'accent' : 'ink'})`}
                className={cn('stroke-current', tone)}
                strokeWidth="1.2"
                strokeOpacity={g.accent ? 0.9 : 0.45}
                strokeLinejoin="round"
              />
              {/* 须(1.5 IQR) */}
              <line x1={g.cx} y1={g.wLo} x2={g.cx} y2={g.wHi}
                className={cn('stroke-current', tone)} strokeWidth="1.1" opacity={g.accent ? 0.85 : 0.45} />
              {/* 四分位箱体 */}
              <rect x={g.cx - BOX_W / 2} y={g.q3} width={BOX_W} height={g.q1 - g.q3} rx="2"
                className={cn('fill-current', tone)} opacity={g.accent ? 0.92 : 0.5} />
              {/* 中位点脉冲光晕(唯一持续动画;放大淡出的是光晕,底下实心点恒在,绝不致空白) */}
              {!reduce && g.accent && (
                <motion.circle
                  cx={g.cx}
                  cy={g.med}
                  className="fill-current text-surface-card"
                  initial={{ r: 2.2, opacity: 0 }}
                  animate={{ r: [2.2, 7], opacity: [0.45, 0] }}
                  // duration 走 token 四档(--duration-deliberate=0.7),节奏靠 repeatDelay 拉开 ——
                  // 护栏「framer duration 字面量只减不增」只认 {0,.16,.28,.42,.7}
                  transition={{ duration: 0.7, repeat: Infinity, ease: 'easeOut', delay: 1.6, repeatDelay: 1.8 }}
                />
              )}
              {/* 中位数 */}
              <circle cx={g.cx} cy={g.med} r="2.2" className="fill-current text-surface-card" />
              {/* 基线下的组别标签条(占位式,不写真文字 —— 216px 卡上任何真标签都是糊的) */}
              <rect x={g.cx - 12} y="79" width="24" height="3.2" rx="1.6"
                className={cn('fill-current', g.accent ? 'text-brand-red' : 'text-foreground')}
                opacity={g.accent ? 0.72 : 0.26} />
            </motion.g>
          );
        })}

        {/* 显著性标线 —— 这一笔才是「数据分析」区别于「画图」的地方 */}
        <motion.path
          d="M 46 21 L 46 10.5 L 114 10.5 L 114 21"
          fill="none"
          className="stroke-current text-brand-red"
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity="0.8"
          initial={{ pathLength: reduce ? 1 : 0 }}
          animate={{ pathLength: 1 }}
          transition={reduce ? { duration: 0 } : { duration: 0.42, delay: 0.9, ease: 'easeInOut' }}
        />
        {/* P 值胶囊 —— 用 SVG 表现属性而非 inline style:viewBox 单位不是像素,设计 token 在这里
            没有意义,且本文件既有的 strokeWidth/opacity 也都走属性(护栏的「inline style 魔法数字」
            规则针对的是真像素值)。字体刻意不指定,继承全站 sans。 */}
        <motion.g
          style={{ transformBox: 'view-box', transformOrigin: '80px 10.5px' }}
          initial={reduce ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.82 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 340, damping: 20, delay: 1.15 }}
        >
          <rect x="58" y="3" width="44" height="15" rx="7.5" className="fill-current text-brand-red-soft" />
          <rect x="58" y="3" width="44" height="15" rx="7.5" fill="none"
            className="stroke-current text-brand-red" strokeWidth="1" opacity="0.45" />
          <text x="80" y="13.6" textAnchor="middle" fontSize="9" fontWeight="600"
            className="fill-current text-brand-red">P&lt;.001</text>
        </motion.g>
      </svg>
    </div>
  );
}
