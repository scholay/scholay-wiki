import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
// 用 motion.* 而非 m.* —— m.* 需要 LazyMotion 祖先,而 PC 壳 AppShell 没有提供
// (只有 MobileShell 有)。用 m.* 会【构建通过但完全不动画】,静默失效。
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { MENUS, type Menu } from '@/app/menus';
import { useMediaQuery } from '@/shared/hooks';
import { cn } from '@/shared/lib/utils';

/**
 * 顶栏功能坞 —— Dock 式交互,替代原先的「离散换页 carousel」。
 *
 * 三个行为:
 *   1. 光标偏向坞的左/右边缘 → 持续朝该方向滚动,越靠边越快(「倾斜」)
 *   2. 光标附近的项放大,邻项按距离衰减、一起被推开
 *   3. 环形无限滚动 —— 没有边界,滚到头会无缝接上
 *
 * ── 放大【只在水平方向】,这是与 macOS Dock 最大的不同 ──────────────
 * macOS Dock 在屏幕底部,图标向上长是往空白区域长,长多高都行。
 * 本坞在【顶栏内部】(h-14 = 56px),向上长会顶出栏外被裁掉,
 * 向下长会压住页面内容 —— 两个方向都会被遮挡。所以这里:
 *   · 高度【恒定 h-8】,任何时候都不溢出顶栏,不存在被遮挡的可能
 *   · 放大表现为「变宽 + 字号/图标同步放大 + 底色填充」,邻项被水平推开
 * 视觉上仍是 Dock 的「隆起」手感,只是隆起方向从纵向改成了横向。
 *
 * ── 字号走 font-size 插值,不用 transform: scale ────────────────────
 * transform 缩放会先按原尺寸栅格化再拉伸,文字到 1.3 倍就明显发虚 ——
 * 而这个坞里文字是主体(菜单名),不能糊。
 * 直接插值 font-size / 图标尺寸 / 内边距,由浏览器重新排版,任何倍率都清晰。
 * 代价是每帧触发布局,但只有 3×8=24 个节点;而且这个布局重排正是
 * 「把邻项推开」所依赖的机制,本来就要发生。
 *
 * ── 数据流不变:URL 仍是唯一真理 ───────────────────────────────────
 * activeId 由 location.pathname 派生,点击只 navigate,不自己存选中态。
 */

/** 「无光标」哨兵 —— 放在极远处,任何项与它的距离都大于 INFLUENCE */
const NO_POINTER = -1e6;
/** 项与项之间的固定间距(px) */
const GAP = 4;
/** 光标正下方那一项的最大放大倍数(只作用于宽度/字号/图标,不作用于高度) */
const MAX_SCALE = 1.28;
/** 放大影响半径(px)—— 超出这个距离的项完全不受影响 */
const INFLUENCE = 130;
/** 渲染多少份 MENUS —— 「一份总宽 × 份数」必须远大于视口,滚动才不露白 */
const COPIES = 3;
/** 边缘触发滚动的死区:|t| 小于它不滚(t 是光标相对坞中心的归一化位置 -1..1) */
const DEADZONE = 0.35;
/** 最大滚动速度(px/秒) */
const MAX_SPEED = 480;

/** 未放大时的基准值 —— 「放大」就是把这三个数按 scale 插值 */
const BASE_FONT = 12;
const BASE_ICON = 14;
const BASE_PAD = 10;

export function MenuDock() {
  const navigate = useNavigate();
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  /**
   * 只有「有真实悬停的细指针」才走 Dock 交互。
   * 触屏没有 hover —— 倾斜滚动与放大都无从触发,坞会变成一条滚不动的死条。
   * 这类设备退化成原生横向滚动(手指直接推),不做放大。
   */
  const finePointer = useMediaQuery('(hover: hover) and (pointer: fine)');
  const dockMode = finePointer && !reduceMotion;
  const N = MENUS.length;

  const viewportRef = useRef<HTMLDivElement>(null);
  /** 连续滚动位移(px,无上界)—— 渲染时取模回到 [0, cycleW) */
  const scrollX = useRef(0);
  const pointerX = useMotionValue(NO_POINTER);
  const trackX = useMotionValue(0);

  /**
   * 每个菜单在【未放大】时的自然宽度。
   * 带标签后各项宽度不等(「文献集」3 字 vs「科研能力广场」6 字),
   * 没有统一 PITCH 可用 —— 必须实测一次,才能算出每项的基准中心位置。
   * 只测第一份的 N 个,其余份内容相同。
   */
  const [widths, setWidths] = useState<number[] | null>(null);
  const measureRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const measure = useCallback(() => {
    const w = measureRefs.current.slice(0, N).map((el) => el?.offsetWidth ?? 0);
    if (w.length === N && w.every((x) => x > 0)) {
      setWidths((prev) => (prev && prev.every((v, i) => v === w[i]) ? prev : w));
    }
  }, [N]);

  useLayoutEffect(measure, [measure]);

  // 字体加载完会改变文字宽度 —— 不重测的话基准位置永远偏,放大会「错位一格」
  useEffect(() => {
    if (!('fonts' in document)) return;
    let alive = true;
    void document.fonts.ready.then(() => alive && measure());
    return () => {
      alive = false;
    };
  }, [measure]);

  /** 每一项(跨所有份)的基准中心 x —— 由实测宽度累加得到 */
  const bases = useMemo(() => {
    if (!widths) return null;
    const out: number[] = [];
    let x = 0;
    for (let i = 0; i < COPIES * N; i++) {
      const w = widths[i % N]!;
      out.push(x + w / 2);
      x += w + GAP;
    }
    return out;
  }, [widths, N]);

  const cycleW = useMemo(
    () => (widths ? widths.reduce((s, w) => s + w + GAP, 0) : 0),
    [widths]
  );

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
    if (!dockMode || !cycleW) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05); // 夹住 dt,切回标签页时不会瞬移
      last = now;
      const vp = viewportRef.current;
      const px = pointerX.get();
      if (vp && px !== NO_POINTER) {
        const w = vp.clientWidth;
        const t = (px / w) * 2 - 1; // -1 = 最左,0 = 正中,1 = 最右
        const a = Math.abs(t);
        if (a > DEADZONE) {
          // 死区外走二次曲线加速 —— 靠边时更跟手,中间区域不易误触
          const k = (a - DEADZONE) / (1 - DEADZONE);
          scrollX.current += Math.sign(t) * MAX_SPEED * k * k * dt;
        }
      }
      // 取模回一个周期内 —— 这就是「环形无限」的全部实现:
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
        // 高度锁死 —— 放大只走水平方向,这里永远不会被撑开
        'relative h-9 w-[320px] lg:w-[460px]',
        dockMode
          ? 'overflow-hidden'
          : // 触屏兜底:原生横滚 + 隐藏滚动条(顶栏放不下滚动条)
            'overflow-x-auto overflow-y-hidden scrollbar-none'
      )}
      onPointerMove={(e) => {
        if (!dockMode || e.pointerType === 'touch') return;
        const r = e.currentTarget.getBoundingClientRect();
        pointerX.set(e.clientX - r.left);
      }}
      onPointerLeave={() => pointerX.set(NO_POINTER)}
      aria-roledescription="功能坞"
    >
      {/* 左右渐隐 —— 提示「还能继续滚」,同时让环形接缝不显眼 */}
      {dockMode && (
        <>
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 z-raised w-6 bg-gradient-to-r from-background to-transparent"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 z-raised w-6 bg-gradient-to-l from-background to-transparent"
          />
        </>
      )}

      <motion.div
        className="flex h-full w-max items-center"
        style={{ x: dockMode ? trackX : 0, gap: `${GAP}px` }}
      >
        {items.map(({ menu, i }) => (
          <DockItem
            key={i}
            menu={menu}
            active={menu.id === activeId}
            base={bases?.[i] ?? null}
            pointerX={pointerX}
            trackX={trackX}
            dockMode={dockMode}
            measureRef={
              i < N
                ? (el: HTMLButtonElement | null) => {
                    measureRefs.current[i] = el;
                  }
                : undefined
            }
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
  menu,
  active,
  base,
  pointerX,
  trackX,
  dockMode,
  measureRef,
  onClick,
}: {
  menu: Menu;
  active: boolean;
  /** 该项在未放大布局里的中心 x(px);null = 还没测出来 */
  base: number | null;
  pointerX: ReturnType<typeof useMotionValue<number>>;
  trackX: ReturnType<typeof useMotionValue<number>>;
  dockMode: boolean;
  measureRef?: (el: HTMLButtonElement | null) => void;
  onClick: () => void;
}) {
  const Icon = menu.icon;

  /**
   * 与光标的距离 → 放大倍数。
   *
   * 距离用【基准中心 + track 位移】算,不读 getBoundingClientRect ——
   * 读 rect 会形成「放大改宽度 → 位置变 → 距离变 → 放大变」的反馈回路,
   * 还要每帧强制同步布局。基准位置是纯算术,稳定且便宜。
   */
  const scale = useTransform([pointerX, trackX], ([px, tx]: number[]) => {
    if (!dockMode || base == null) return 1;
    const d = Math.abs(base + (tx ?? 0) - (px ?? NO_POINTER));
    if (d > INFLUENCE) return 1;
    // 余弦衰减:比线性更接近 Dock 的「圆润隆起」,影响边界处导数为 0,不会有折角
    const falloff = (Math.cos((d / INFLUENCE) * Math.PI) + 1) / 2;
    return 1 + (MAX_SCALE - 1) * falloff;
  });
  const s = useSpring(scale, { stiffness: 400, damping: 34, mass: 0.6 });

  // 全部走真实样式插值,不用 transform —— 文字在任何倍率下都清晰
  const fontSize = useTransform(s, (v) => `${BASE_FONT * v}px`);
  const iconSize = useTransform(s, (v) => `${BASE_ICON * v}px`);
  const pad = useTransform(s, (v) => `${BASE_PAD * v}px`);

  return (
    <motion.button
      ref={measureRef}
      type="button"
      onClick={onClick}
      title={menu.comingSoon ? `${menu.label} · 即将推出` : menu.label}
      aria-current={active ? 'page' : undefined}
      style={{ fontSize, paddingLeft: pad, paddingRight: pad }}
      className={cn(
        // h-8 固定 —— 放大不改高度,顶栏不会被撑开、内容不会被裁
        'relative inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-8',
        'transition-colors',
        active
          ? 'bg-foreground text-on-brand'
          : 'text-subtle hover:bg-surface-2 hover:text-foreground'
      )}
    >
      <motion.span
        style={{ width: iconSize, height: iconSize }}
        className="inline-flex shrink-0"
      >
        <Icon className="size-full" strokeWidth={active ? 2.1 : 1.8} />
      </motion.span>
      <span>{menu.label}</span>

      {/* 「即将推出」—— 坞里没有横向余量放文字,用 amber 圆点示意 */}
      {menu.comingSoon && (
        <span aria-hidden className="size-1.5 shrink-0 rounded-pill bg-brand-amber" />
      )}
    </motion.button>
  );
}
