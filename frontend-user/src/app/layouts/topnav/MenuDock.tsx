import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
// 用 motion.* 而非 m.* —— m.* 需要 LazyMotion 祖先,而 PC 壳 AppShell 没有提供
// (只有 MobileShell 有)。用 m.* 会【构建通过但完全不动画】,静默失效。
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { MENUS, type Menu } from '@/app/menus';
import { useMediaQuery } from '@/shared/hooks';
import { cn } from '@/shared/lib/utils';

/**
 * 顶栏功能坞 —— macOS Dock 式交互,替代原先的「离散换页 carousel」。
 *
 * 三个行为:
 *   1. 光标靠近哪一项,哪一项就放大(邻项按距离衰减,一起把周围推开)
 *   2. 光标偏向坞的左/右边缘 → 持续朝该方向滚动,越靠边越快(「倾斜」)
 *   3. 环形无限滚动 —— 滚到头会无缝接上,没有边界
 *
 * ── 为什么 active 态改成「下方小圆点」──────────────────────────────
 * 原设计里 active 项是永久放大的黑底大 chip。叠上 hover 放大后两者会打架:
 * 一个本来就最大的项,hover 时还要再大一圈,尺寸语义就废了。
 * Dock 的解法是把「当前所在」和「光标指向」分成两个通道 ——
 * 前者用图标下方的小圆点(macOS 表示 app 正在运行),后者用放大。
 *
 * ── 为什么去掉文字标签 ────────────────────────────────────────────
 * 8 个「图标+中文标签」的 chip 排开有 700px+,顶栏放不下,原实现只好开一个
 * 260/420px 的窗口硬裁。而且文字跟着 scale 缩放会发虚。
 * 改成纯图标 + hover 时在上方浮出名称(macOS Dock 同款),宽度问题一并解决。
 *
 * ── 数据流不变:URL 仍是唯一真理 ───────────────────────────────────
 * activeId 由 location.pathname 派生,点击只 navigate,不自己存选中态。
 */

/** 「无光标」哨兵 —— 放在极远处,任何项与它的距离都大于 INFLUENCE */
const NO_POINTER = -1e6;
/** 未放大时的图标格边长(px) */
const ITEM = 36;
/** 相邻两项的间距(px) */
const GAP = 6;
const PITCH = ITEM + GAP;
/** 光标正下方那一项的最大放大倍数 */
const MAX_SCALE = 1.6;
/** 放大影响半径(px)—— 超出这个距离的项不受影响 */
const INFLUENCE = 105;
/** 渲染多少份 MENUS —— 必须让「一个周期宽度 × 份数」远大于视口,滚动才不会露白 */
const COPIES = 5;
/** 边缘触发滚动的死区:|t| 小于它不滚(t 是光标相对坞中心的归一化位置 -1..1) */
const DEADZONE = 0.35;
/** 最大滚动速度(px/秒) */
const MAX_SPEED = 520;

export function MenuDock() {
  const navigate = useNavigate();
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  /**
   * 只有「有真实悬停的细指针」才走 Dock 交互。
   * 触屏没有 hover —— 放大与倾斜滚动都无从触发,坞会变成一个滚不动的死条。
   * 这类设备退化成原生横向滚动(手指直接推),不做放大。
   */
  const finePointer = useMediaQuery('(hover: hover) and (pointer: fine)');
  const dockMode = finePointer && !reduceMotion;
  const N = MENUS.length;
  const cycleW = N * PITCH;

  const viewportRef = useRef<HTMLDivElement>(null);
  /** 连续滚动位移(px,无上界)—— 渲染时取模回到 [0, cycleW) */
  const scrollX = useRef(0);
  /**
   * 光标在视口内的 x(px)。
   * 「没有光标」用哨兵 NO_POINTER 表示而不是 null —— framer-motion 的多输入
   * useTransform 要求同构的 MotionValue<number>[];而且哨兵放在极远处时,
   * 距离天然大于 INFLUENCE,放大值自动归 1,连判空分支都省了。
   */
  const pointerX = useMotionValue(NO_POINTER);
  /** 渲染用的 wrapped 位移,驱动 track 的 translateX */
  const trackX = useMotionValue(0);
  const [hovering, setHovering] = useState(false);

  // Dock 模式渲染 COPIES 份做环形;非 Dock 模式只渲一份(原生滚动没有无限的必要,
  // 多渲几份反而让滚动条长度失真、Tab 顺序里出现重复项)
  const items = useMemo(
    () =>
      Array.from({ length: (dockMode ? COPIES : 1) * N }, (_, i) => ({
        menu: MENUS[i % N]!,
        i,
      })),
    [N, dockMode]
  );

  /** 当前路由命中的菜单 —— 用 match() 真值,首页(/)时全部不命中,与原实现一致 */
  const activeId = useMemo(
    () => MENUS.find((mn) => mn.match(location.pathname))?.id ?? null,
    [location.pathname]
  );

  // ── 主循环:边缘倾斜 → 持续滚动 ──────────────────────────────────
  // 用 rAF 而不是 setInterval:与刷新率对齐,标签页不可见时浏览器自动暂停。
  useEffect(() => {
    if (!dockMode) return; // 触屏/减少动态:不跑循环,交给原生滚动
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05); // 夹住 dt,切回标签页时不会瞬移
      last = now;
      const vp = viewportRef.current;
      const px = pointerX.get();
      if (vp && px !== NO_POINTER) {
        const w = vp.clientWidth;
        // t ∈ [-1, 1]:-1 = 最左,0 = 正中,1 = 最右
        const t = (px / w) * 2 - 1;
        const a = Math.abs(t);
        if (a > DEADZONE) {
          // 死区外做二次曲线加速 —— 靠近边缘时手感更「跟手」,中间区域不易误触
          const k = (a - DEADZONE) / (1 - DEADZONE);
          scrollX.current += Math.sign(t) * MAX_SPEED * k * k * dt;
        }
      }
      // 取模回到一个周期内 —— 这就是「环形无限」的全部实现:
      // 位移永远落在 [0, cycleW),而 track 上有 COPIES 份内容,视觉上接得上。
      const wrapped = ((scrollX.current % cycleW) + cycleW) % cycleW;
      trackX.set(-wrapped);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cycleW, pointerX, trackX, dockMode]);

  return (
    <div
      ref={viewportRef}
      className={cn(
        'relative w-[320px] lg:w-[460px] h-11',
        dockMode
          ? 'overflow-hidden'
          : // 触屏兜底:原生横滚 + 隐藏滚动条(顶栏放不下滚动条)
            'overflow-x-auto overflow-y-hidden scrollbar-none'
      )}
      onPointerMove={
        dockMode
          ? (e) => {
              if (e.pointerType === 'touch') return;
              const r = e.currentTarget.getBoundingClientRect();
              pointerX.set(e.clientX - r.left);
              setHovering(true);
            }
          : undefined
      }
      onPointerLeave={
        dockMode
          ? () => {
              pointerX.set(NO_POINTER);
              setHovering(false);
            }
          : undefined
      }
      aria-roledescription="功能坞"
    >
      {/* 左右渐隐 —— 提示「还能继续滚」,同时让环形接缝不显眼。
          非 Dock 模式下会跟着内容滚走,所以只在 Dock 模式挂。 */}
      {dockMode && (
        <>
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 z-raised w-8 bg-gradient-to-r from-background to-transparent"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 z-raised w-8 bg-gradient-to-l from-background to-transparent"
          />
        </>
      )}

      <motion.div
        className="flex h-full w-max items-end pb-1"
        style={{ x: dockMode ? trackX : 0, gap: `${GAP}px` }}
      >
        {items.map(({ menu, i }) => (
          <DockItem
            key={i}
            index={i}
            menu={menu}
            active={menu.id === activeId}
            pointerX={pointerX}
            trackX={trackX}
            hovering={hovering}
            dockMode={dockMode}
            onClick={() => {
              if (!menu.match(location.pathname)) navigate(menu.href);
            }}
          />
        ))}
      </motion.div>
    </div>
  );
}

function DockItem({
  index,
  menu,
  active,
  pointerX,
  trackX,
  hovering,
  dockMode,
  onClick,
}: {
  index: number;
  menu: Menu;
  active: boolean;
  pointerX: ReturnType<typeof useMotionValue<number>>;
  trackX: ReturnType<typeof useMotionValue<number>>;
  hovering: boolean;
  dockMode: boolean;
  onClick: () => void;
}) {
  const Icon = menu.icon;

  /**
   * 与光标的距离 → 放大倍数。
   *
   * 距离用【基准位置】算(index × PITCH + 半格 + track 位移),不读 DOM ——
   * 读 getBoundingClientRect 会形成「放大改宽度 → 位置变 → 距离变 → 放大变」的
   * 反馈回路,还要每帧强制同步布局。基准位置是纯算术,O(1) 且无抖动,
   * 视觉差异肉眼不可辨。
   */
  const scale = useTransform([pointerX, trackX], ([px, tx]: number[]) => {
    if (!dockMode) return 1;
    const center = index * PITCH + ITEM / 2 + (tx ?? 0);
    const d = Math.abs(center - (px ?? NO_POINTER));
    if (d > INFLUENCE) return 1;
    // 余弦衰减:比线性衰减更接近 macOS 的「圆润隆起」,边缘处导数为 0 不会有折角
    const falloff = (Math.cos((d / INFLUENCE) * Math.PI) + 1) / 2;
    return 1 + (MAX_SCALE - 1) * falloff;
  });
  // 弹簧让放大跟手但不神经质;stiffness 高保证响应快,damping 高避免回弹过冲
  const smooth = useSpring(scale, { stiffness: 420, damping: 32, mass: 0.6 });
  // 宽度跟着放大一起变 —— 这样邻项会被「推开」而不是互相重叠(Dock 的关键手感)
  const width = useTransform(smooth, (s) => ITEM * s);
  const iconScale = useTransform(smooth, (s) => 0.9 + (s - 1) * 0.55);

  return (
    <motion.button
      type="button"
      onClick={onClick}
      title={menu.comingSoon ? `${menu.label} · 即将推出` : menu.label}
      aria-label={menu.label}
      aria-current={active ? 'page' : undefined}
      style={{ width, height: width }}
      className={cn(
        'relative shrink-0 inline-flex items-center justify-center rounded-12 transition-colors',
        'origin-bottom',
        active ? 'bg-surface-2 text-foreground' : 'text-subtle hover:text-foreground'
      )}
    >
      <motion.span style={{ scale: iconScale }} className="inline-flex">
        <Icon className="size-5" strokeWidth={active ? 2.1 : 1.8} />
      </motion.span>

      {/* 「即将推出」——坞里没有横向余量放文字,用 amber 角点示意 */}
      {menu.comingSoon && (
        <span
          aria-hidden
          className="absolute right-1 top-1 size-1.5 rounded-pill bg-brand-amber"
        />
      )}

      {/* active 指示点 —— macOS Dock 表示「正在运行」的那颗点。
          放大是 hover 通道,这是「当前所在」通道,两者互不干扰。 */}
      {active && (
        <span
          aria-hidden
          className="absolute -bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-pill bg-foreground"
        />
      )}

      {/* 悬停时在上方浮出名称 —— 纯图标坞的可发现性靠它兜底。
          只在整个坞被 hover 时挂,避免 8×5 个常驻 DOM 节点。 */}
      {hovering && <DockLabel label={menu.label} scale={smooth} />}
    </motion.button>
  );
}

/** 图标上方浮出的名称气泡 —— 透明度与位移跟随该项的放大程度 */
function DockLabel({
  label,
  scale,
}: {
  label: string;
  scale: ReturnType<typeof useSpring>;
}) {
  // 只有明显被放大的那一项才显示名称,否则 8 个名称糊成一片
  const opacity = useTransform(scale, [1.25, MAX_SCALE], [0, 1]);
  const y = useTransform(scale, [1, MAX_SCALE], [4, -2]);
  return (
    <motion.span
      aria-hidden
      style={{ opacity, y }}
      className="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded-8 bg-foreground px-2 py-0.5 text-12 text-on-brand"
    >
      {label}
    </motion.span>
  );
}
