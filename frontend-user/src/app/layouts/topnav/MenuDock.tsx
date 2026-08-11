import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
// 用 motion.* 而非 m.* —— m.* 需要 LazyMotion 祖先,而 PC 壳 AppShell 没有提供
// (只有 MobileShell 有)。用 m.* 会【构建通过但完全不动画】,静默失效。
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';

// Dock 项是真实 <a href>(SEO 硬约束:水合后的 DOM 必须保留导航内链);
// motion.create 让它继续吃 fontSize/padding 的逐帧插值。平点 = <Link> SPA 导航,
// 已在当前路由时再点 = 同址导航(react-router 对 same-location 是 replace,不重挂载)。
const MotionLink = motion.create(Link);
import { MENUS, type Menu } from '@/app/menus';
import { useMediaQuery } from '@/shared/hooks';
import { cn } from '@/shared/lib/utils';

/**
 * 顶栏功能坞 —— scrub(位置映射)式交互。
 *
 * ── 2026-07-29 换控制模型:速度型 → 位置映射型 ─────────────────────
 * 上一版是「光标偏向边缘 → 持续朝该方向滚动」的速度型控制(rate control),
 * 四轮调参(弹簧/死区/峰值)后仍被反馈「刹不住车、看到了点不中」。调研结论是
 * 结构问题而非参数问题,不可能调好:
 *   · 速度型没有静止平衡点 —— 想停必须把光标撤回死区,撤回路径上仍在滚;
 *   · 死区半宽(80.5px)< chip 节距(94px),除居中项外一切 chip 都落在
 *     滚动区,指向它 = 继续滚 → 结构上不可静态点选;
 *   · 归位用指数逼近且初速无界(最高 ≈8× 手滚上限),光标滑出 36px 高的
 *     窄条立刻急冲 —— 「生硬」的最大单点;
 *   · track 移动中 mousedown/mouseup 落在不同元素 → click 静默丢失。
 * 生态里也没有现成组件做「边缘悬停滚 + dock 放大」(边缘滚只活在 DnD 库的
 * 拖拽事件流里;magicui 等 dock 成品全是定宽不滚动),只能自研。
 *
 * ── 现行模型:锚点分段位置映射(macOS Dock 文件夹 scrub 同款范式)────
 * 光标位置直接映射滚动位移:光标静止 ⇒ 内容静止,处处是平衡点,
 * 「刹车」这个概念整体消失,视口内每个 chip 随时可静态点选。
 *   1. 进入坞:以(光标位置, 当前位移)为锚点 —— 进入零跳变;
 *   2. 移动:锚点两侧分段线性映射 [PAD..锚点]→[0..锚点位移]、
 *      [锚点..W-PAD]→[锚点位移..overflow] —— 光标推到渐隐带边缘 = 内容到头,
 *      一次横扫必然遍历全部内容;目标位移经临界阻尼弹簧跟随;
 *   3. 换向重锚:反向累计超过滞回阈值 → 以当前点重设锚点(类似触控板
 *      「抬手重放」),小幅往复微调时增益始终温和;
 *   4. 按压冻结:pointerdown→up 期间不更新位移 → down/up 必落同一元素,
 *      根治 click 哑弹;
 *   5. 离开:200ms 宽限(容忍从窄条手抖出界)后 active 项归位居中,归位与
 *      scrub 共用同一个弹簧,速度天然连续;重入立即急停在途归位。
 * 铁律:【光标在坞内时,内容零自发移动】—— 路由变化的归位在光标在坞内时
 * 顺延到离开后执行(computeSnap 始终读最新 active,不会丢)。
 * 环形无限滚已删除:scrub 要求光标↔位移单射,环形破坏单射;且溢出量仅
 * ~200px(内容 ~660px vs 视口 460px),有界 + 渐隐随边界显隐反而更诚实。
 *
 * ── 放大【只在水平方向】,这是与 macOS Dock 最大的不同 ──────────────
 * 本坞在【顶栏内部】(h-14 = 56px),向上长会顶出栏外被裁掉,向下长会压住
 * 页面内容。所以高度【恒定 h-8】,放大表现为「变宽 + 字号/图标同步放大 +
 * 底色填充」,邻项被水平推开。字号走 font-size 插值而不用 transform scale
 * (transform 缩放到 1.3 倍文字明显发虚,而菜单名是坞的主体,不能糊)。
 * 放大三旋钮与弹簧是产品四轮拍板的手感,调研已排除弹簧嫌疑(ζ≈0.84 过冲
 * 折合 0.27px,低于感知阈),原样保留。
 * scrub 下放大波峰只随手动(扫过速率 ≈(1+增益)×手速),手一停波峰即静止,
 * 旧版「滚动中波峰 5Hz 频闪换人」自然消失。
 *
 * ── 数据流不变:URL 仍是唯一真理 ───────────────────────────────────
 * activeId 由 location.pathname 派生,点击只 navigate,不自己存选中态。
 */

/** 「无光标」哨兵 —— 放在极远处,任何项与它的距离都大于 INFLUENCE */
const NO_POINTER = -1e6;
/** 项与项之间的固定间距(px) */
const GAP = 4;

/* ── 放大手感三旋钮 + 弹簧 —— 2026-07 四轮拍板值,勿动 ──────────────
 * MAX_SCALE 峰值倍率;INFLUENCE 影响半径(110 = 只拎出主项+左右各半项);
 * FOCUS 对余弦衰减取次方,把能量往中心收(峰尖尾收)。 */
const MAX_SCALE = 1.38;
const INFLUENCE = 110;
const FOCUS = 1.7;

/* ── scrub 的五个旋钮 ──────────────────────────────────────────────── */
/** 可用行程内边距(px)= 渐隐条 w-6 —— 「光标进渐隐区 = 内容到头」 */
const PAD = 24;
/**
 * 映射分段的最小分母(px)—— 增益上限 = 溢出量/MIN_SEGMENT ≈ 3.3。
 * 锚点贴边时分段会退化(几 px 行程扛全部剩余内容,手一抖内容乱飞),
 * 用最小分母兜住;代价是贴边进入时该侧一次够不满,靠换向重锚/滚轮补足。
 */
const MIN_SEGMENT = 60;
/** 换向重锚的滞回阈值(px)—— 低于它的反向抖动不算换向 */
const REVERSE_HYST = 8;
/** pointerleave 后归位的宽限(ms)—— 36px 高的窄条,手抖出界是常态 */
const GRACE_MS = 200;
/**
 * 轨道两端留白(px)= 渐隐带/PAD 同宽 —— 滚到头时首尾 chip 不贴边:
 * 有呼吸位、放大时边缘项不顶边,且「渐隐消失 + 露出留白」是比
 * 「chip 顶死在边上」更明确的到头信号。(取值在 Figma 间距集合 {…,24,…} 内)
 */
const EDGE_PAD = 24;
/**
 * scrub/归位共用弹簧:ζ = 32/(2√(500×0.5)) ≈ 1.01 临界阻尼 ——
 * 跟随不过冲、归位不回弹;安定 ~150ms。刻意不用 SNAPPY_SPRING(ζ≈0.93
 * 带 0.9% 过冲,归位场景会「过头再回」)。物理弹簧不受 duration 四档约束
 * (见 shared/lib/motion.ts 头注释)。
 */
const SCRUB_SPRING = { stiffness: 500, damping: 32, mass: 0.5 };

/* 未放大时的基准值 —— 「放大」就是把这三个数按 scale 逐帧插值。
 * 必须是 number(要参与乘法后写进 motion style),所以这里不能用 Tailwind 类;
 * 但取值仍对齐 design token,避免坞与顶栏其余部分脱节:
 *   BASE_FONT 12 = `--text-12`(Figma 六档下限,顶栏 chip 文字档)
 *   BASE_PAD  10 = Figma §5 观测间距集合 {4,8,10,12,16,24,32,40} 里的 10
 *   BASE_ICON 14 —— 无对应 token(`--size-icon` 24 / `--size-icon-inline` 20 都太大,
 *                   会把 h-8 的 chip 撑满);按「略小于文字行高」的视觉配平取 14。 */
const BASE_FONT = 12;
const BASE_ICON = 14;
const BASE_PAD = 10;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function MenuDock() {
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  /**
   * 只有「有真实悬停的细指针」才走 scrub 交互。
   * 触屏没有 hover —— 映射与放大都无从触发。这类设备退化成原生横向滚动
   * (手指直接推),不做放大。
   */
  const finePointer = useMediaQuery('(hover: hover) and (pointer: fine)');
  const dockMode = finePointer && !reduceMotion;
  const N = MENUS.length;

  const viewportRef = useRef<HTMLDivElement>(null);
  const pointerX = useMotionValue(NO_POINTER);
  /** scrub 目标位移(px,0 = 内容顶左,overflow = 顶右)—— 唯一的滚动自由度 */
  const offsetTarget = useMotionValue(0);
  /** 实际位移 = 目标经临界阻尼弹簧跟随;归位也走它,模式切换速度天然连续 */
  const offset = useSpring(offsetTarget, SCRUB_SPRING);
  const trackX = useTransform(offset, (v) => -v);

  /**
   * 每个菜单在【未放大】时的自然宽度。
   * 带标签后各项宽度不等(「文件夹」3 字 vs「科研能力广场」6 字),
   * 没有统一 PITCH 可用 —— 必须实测一次,才能算出每项的基准中心位置。
   */
  const [widths, setWidths] = useState<number[] | null>(null);
  const measureRefs = useRef<Array<HTMLAnchorElement | null>>([]);

  const measure = useCallback(() => {
    const w = measureRefs.current.slice(0, N).map((el) => el?.offsetWidth ?? 0);
    if (w.length === N && w.every((x) => x > 0)) {
      setWidths((prev) => (prev && prev.every((v, i) => v === w[i]) ? prev : w));
    }
  }, [N]);

  useLayoutEffect(measure, [measure]);

  // 字体就绪后重测一次文字宽度。全站已是系统字体(零下载),fonts.ready 基本即刻
  // resolve,这里只是防御性兜底(KaTeX 等按需字体、或未来再引入 webfont 时不至于错位)。
  useEffect(() => {
    if (!('fonts' in document)) return;
    let alive = true;
    void document.fonts.ready.then(() => alive && measure());
    return () => {
      alive = false;
    };
  }, [measure]);

  /**
   * 🔴 顶栏在 < 1200px 会把**整个中列 display:none**(P0-2 的窄屏折叠,
   * 见 TopNav.tsx 顶部注释)。display:none 下 offsetWidth 全是 0,
   * `measure()` 的 `every(x => x > 0)` 守卫会拒绝写入 → widths 永远是 null,
   * 坞停在降级态(不放大、不 scrub)。而上面两个测量时机都**只跑一次**,
   * 「窗口从 900 拉宽到 1300」之后必须补测。用 ResizeObserver 盯自己的视口:
   * 0 → 460 时补测一次。
   */
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(vp);
    return () => ro.disconnect();
  }, [measure]);

  /** 每一项的基准中心 x —— 由实测宽度累加得到(单份内容,无环形拷贝;含首端留白) */
  const bases = useMemo(() => {
    if (!widths) return null;
    const out: number[] = [];
    let x = EDGE_PAD;
    for (let i = 0; i < N; i++) {
      const w = widths[i]!;
      out.push(x + w / 2);
      x += w + GAP;
    }
    return out;
  }, [widths, N]);

  /** 内容总宽(未放大基准,项间 N-1 个 GAP + 两端留白) */
  const contentW = useMemo(
    () =>
      widths
        ? widths.reduce((s, w) => s + w, 0) + GAP * (widths.length - 1) + EDGE_PAD * 2
        : 0,
    [widths]
  );

  /** 溢出量 —— 实时读视口宽,320/460 两档与窗口拉伸都自动适配 */
  const getOverflow = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp || !contentW) return 0;
    return Math.max(0, contentW - vp.clientWidth);
  }, [contentW]);

  /** 当前路由命中的菜单 —— 用 match() 真值,首页(/)时全部不命中,与原实现一致 */
  const activeId = useMemo(
    () => MENUS.find((mn) => mn.match(location.pathname))?.id ?? null,
    [location.pathname]
  );

  /* ── scrub 手势状态(全部 ref,不参与渲染)───────────────────────── */
  /** 锚点:进入/换向/滚轮/松手时重置。null = 光标不在坞内 */
  const anchor = useRef<{ px: number; off: number } | null>(null);
  const lastPx = useRef(0);
  /** 当前扫动方向(-1/0/1)与该方向上的极值点 —— 换向滞回用 */
  const dir = useRef(0);
  const turnPx = useRef(0);
  const pressing = useRef(false);
  const inside = useRef(false);
  const graceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snappedOnce = useRef(false);

  useEffect(
    () => () => {
      if (graceTimer.current) clearTimeout(graceTimer.current);
    },
    []
  );

  /** 计算「让 active 项居中」所需位移(有界钳位;首页无 active 时停靠第 0 项) */
  const computeSnap = useCallback((): number | null => {
    const vp = viewportRef.current;
    if (!vp || !bases) return null;
    const idx = activeId ? MENUS.findIndex((mn) => mn.id === activeId) : 0;
    if (idx < 0) return null;
    return clamp(bases[idx]! - vp.clientWidth / 2, 0, getOverflow());
  }, [activeId, bases, getOverflow]);

  // 路由变化 / 宽度测出来 → 归位。铁律:光标在坞内时不动(顺延到离开后,
  // 由 pointerleave 的宽限定时器接手 —— computeSnap 始终读最新 active)。
  useEffect(() => {
    const t = computeSnap();
    if (t == null) return;
    if (!dockMode) {
      // 触屏/减少动态:原生滚动容器直接落位
      const vp = viewportRef.current;
      if (vp) vp.scrollLeft = t;
      return;
    }
    if (!snappedOnce.current) {
      // 首次(挂载/测宽完成):直接落位,不做「从 0 滑过来」的开屏动画
      snappedOnce.current = true;
      offsetTarget.set(t);
      offset.jump(t);
      return;
    }
    if (!inside.current) offsetTarget.set(t);
  }, [computeSnap, dockMode, offsetTarget, offset]);

  /** 锚点分段线性映射:光标位置 → 目标位移 */
  const mapToTarget = useCallback(
    (px: number): number | null => {
      const a = anchor.current;
      const vp = viewportRef.current;
      if (!a || !vp) return null;
      const overflow = getOverflow();
      if (!overflow) return null;
      const x = clamp(px, PAD, vp.clientWidth - PAD);
      if (x >= a.px) {
        const seg = Math.max(vp.clientWidth - PAD - a.px, MIN_SEGMENT);
        return clamp(a.off + ((overflow - a.off) * (x - a.px)) / seg, a.off, overflow);
      }
      const seg = Math.max(a.px - PAD, MIN_SEGMENT);
      return clamp(a.off - (a.off * (a.px - x)) / seg, 0, a.off);
    },
    [getOverflow]
  );

  /**
   * 滚轮/触控板横滑旁路 —— 精确输入,也是「锚点贴边够不满」时的兜底。
   * 原生监听而非 JSX onWheel:React 在 root 上以 passive 挂 wheel,
   * JSX 里 preventDefault 不可靠。只吃横向意图(deltaX 为主,或 shift+纵轮),
   * 纯纵滚放行给页面。
   */
  useEffect(() => {
    if (!dockMode) return;
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      const overflow = getOverflow();
      if (!overflow) return;
      const d = Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
      if (!d) return;
      e.preventDefault();
      const next = clamp(offsetTarget.get() + d, 0, overflow);
      offsetTarget.set(next);
      // 滚轮改了位移但光标没动 —— 必须重锚,否则下一次 pointermove 从旧映射跳变
      if (anchor.current) anchor.current = { px: lastPx.current, off: next };
    };
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  }, [dockMode, getOverflow, offsetTarget]);

  /**
   * 🔴 浏览器会对 overflow:hidden 容器做「聚焦元素滚入可见」的**原生 scrollLeft
   * 滚动**(Tab 聚焦部分可见的 chip、外部 scrollIntoView 都会触发)。它与
   * transform 位移叠加后坞会悄悄错位且永不复原(transform 读数还是对的,
   * 肉眼却看到滚了 —— Playwright 取证时抓到的真实现象)。
   * 把原生滚动量折算进 offsetTarget 并立刻清零 scrollLeft,两套滚动收敛为一套。
   */
  useEffect(() => {
    if (!dockMode) return;
    const vp = viewportRef.current;
    if (!vp) return;
    const onScroll = () => {
      const d = vp.scrollLeft;
      if (!d) return;
      vp.scrollLeft = 0;
      offsetTarget.set(clamp(offsetTarget.get() + d, 0, getOverflow()));
    };
    vp.addEventListener('scroll', onScroll);
    onScroll(); // 挂载/模式切换时清掉残留(从触屏降级态切回会带着 scrollLeft)
    return () => vp.removeEventListener('scroll', onScroll);
  }, [dockMode, getOverflow, offsetTarget]);

  /** 键盘 Tab 聚焦到视口外的项时,把它带进可见区(三案评审共同指出的遗漏) */
  const ensureVisible = useCallback(
    (i: number) => {
      if (!dockMode || !bases || !widths) return;
      const vp = viewportRef.current;
      if (!vp) return;
      const left = bases[i]! - widths[i]! / 2;
      const right = bases[i]! + widths[i]! / 2;
      const cur = offsetTarget.get();
      let t = cur;
      if (left - cur < PAD) t = left - PAD;
      else if (right - cur > vp.clientWidth - PAD) t = right - (vp.clientWidth - PAD);
      if (t !== cur) offsetTarget.set(clamp(t, 0, getOverflow()));
    },
    [dockMode, bases, widths, getOverflow, offsetTarget]
  );

  /* 渐隐条透明度绑位移:到头即隐 —— 替代环形的「永远滚得动」暗示,
   * 「还有内容」与「到头了」都如实呈现。16px 渐变行程。 */
  const leftFade = useTransform(offset, (v) => clamp(v / 16, 0, 1));
  const rightFade = useTransform(offset, (v) => clamp((getOverflow() - v) / 16, 0, 1));

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
      onPointerEnter={(e) => {
        if (!dockMode || e.pointerType === 'touch') return;
        inside.current = true;
        if (graceTimer.current) {
          clearTimeout(graceTimer.current);
          graceTimer.current = null;
        }
        // 在途归位急停 —— 铁律:光标进坞,内容立刻停在原地
        const cur = offset.get();
        offsetTarget.set(cur);
        offset.jump(cur);
        const r = e.currentTarget.getBoundingClientRect();
        const px = e.clientX - r.left;
        anchor.current = { px, off: cur };
        lastPx.current = px;
        dir.current = 0;
        turnPx.current = px;
      }}
      onPointerMove={(e) => {
        if (!dockMode || e.pointerType === 'touch') return;
        const r = e.currentTarget.getBoundingClientRect();
        const px = e.clientX - r.left;
        pointerX.set(px);
        if (!anchor.current) {
          // enter 事件丢失的兜底(如 alt-tab 切回时光标已在坞内)
          inside.current = true;
          anchor.current = { px, off: offsetTarget.get() };
          dir.current = 0;
          turnPx.current = px;
        } else {
          // 换向重锚:反向累计超过滞回 → 以当前点为新锚点(触控板「抬手重放」)
          const d = px - lastPx.current;
          if (d !== 0) {
            const s = d > 0 ? 1 : -1;
            if (dir.current === 0 || s === dir.current) {
              dir.current = s;
              turnPx.current = px;
            } else if (Math.abs(px - turnPx.current) > REVERSE_HYST) {
              anchor.current = { px, off: offsetTarget.get() };
              dir.current = s;
              turnPx.current = px;
            }
          }
        }
        lastPx.current = px;
        // 按压冻结:down→up 期间不动内容,保证 click 的 down/up 落同一元素
        if (!pressing.current) {
          const t = mapToTarget(px);
          if (t != null) offsetTarget.set(t);
        }
      }}
      onPointerLeave={() => {
        pointerX.set(NO_POINTER);
        inside.current = false;
        anchor.current = null;
        dir.current = 0;
        if (!dockMode) return;
        if (graceTimer.current) clearTimeout(graceTimer.current);
        // 宽限后归位:active 项自己滑回中心。不做这一步的话,手动滚开之后
        // active 就再也回不来了,坞会停在一个与当前页面无关的随机位置。
        graceTimer.current = setTimeout(() => {
          graceTimer.current = null;
          if (inside.current) return;
          const t = computeSnap();
          if (t != null) offsetTarget.set(t);
        }, GRACE_MS);
      }}
      onPointerDown={() => {
        pressing.current = true;
      }}
      onPointerUp={() => {
        pressing.current = false;
        // 按压期的移动被忽略了,松手以当前位置重锚,避免下一次 move 从旧映射跳变
        anchor.current = { px: lastPx.current, off: offsetTarget.get() };
        dir.current = 0;
        turnPx.current = lastPx.current;
      }}
      aria-roledescription="功能坞"
    >
      {/* 左右渐隐 —— 「这一侧还有内容」的如实提示,到头自动隐去 */}
      {dockMode && (
        <>
          <motion.span
            aria-hidden
            style={{ opacity: leftFade }}
            className="pointer-events-none absolute inset-y-0 left-0 z-raised w-6 bg-gradient-to-r from-background to-transparent"
          />
          <motion.span
            aria-hidden
            style={{ opacity: rightFade }}
            className="pointer-events-none absolute inset-y-0 right-0 z-raised w-6 bg-gradient-to-l from-background to-transparent"
          />
        </>
      )}

      <motion.div
        className="flex h-full w-max items-center"
        style={{
          x: dockMode ? trackX : 0,
          gap: `${GAP}px`,
          // 两端留白走 style 而非 class —— 与 bases/contentW 的算术共用同一个常量,
          // 改留白只动 EDGE_PAD 一处,不会出现「类名 24 / 算术 32」的漂移
          paddingLeft: `${EDGE_PAD}px`,
          paddingRight: `${EDGE_PAD}px`,
        }}
      >
        {MENUS.map((menu, i) => (
          <DockItem
            key={menu.id}
            menu={menu}
            active={menu.id === activeId}
            base={bases?.[i] ?? null}
            pointerX={pointerX}
            trackX={trackX}
            dockMode={dockMode}
            measureRef={(el: HTMLAnchorElement | null) => {
              measureRefs.current[i] = el;
            }}
            onFocus={() => ensureVisible(i)}
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
  onFocus,
}: {
  menu: Menu;
  active: boolean;
  /** 该项在未放大布局里的中心 x(px);null = 还没测出来 */
  base: number | null;
  pointerX: ReturnType<typeof useMotionValue<number>>;
  trackX: ReturnType<typeof useMotionValue<number>>;
  dockMode: boolean;
  measureRef: (el: HTMLAnchorElement | null) => void;
  onFocus: () => void;
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
    // 余弦衰减:影响边界处导数为 0,不会有折角。
    // 再取 FOCUS 次方把能量往中心收 —— 纯余弦太发散,主项拎不出来。
    const falloff = ((Math.cos((d / INFLUENCE) * Math.PI) + 1) / 2) ** FOCUS;
    return 1 + (MAX_SCALE - 1) * falloff;
  });
  /**
   * 弹簧参数决定「干脆度」。阻尼比 ζ = c / (2√(k·m)):
   *   ζ > 1 过阻尼 —— 平滑爬过去,没有任何过冲,手感偏「软」(上一版 ζ≈1.10 就是这样)
   *   ζ < 1 欠阻尼 —— 收尾带一点回弹,视觉上「弹到位」,这才是干脆感的来源
   * 这里 ζ = 26 / (2√(800×0.3)) ≈ 0.84,轻微过冲;
   * 固有频率 √(k/m) ≈ 52 rad/s,周期约 120ms —— 起落都在一眨眼内完成。
   */
  const s = useSpring(scale, { stiffness: 800, damping: 26, mass: 0.3 });

  // 全部走真实样式插值,不用 transform —— 文字在任何倍率下都清晰
  const fontSize = useTransform(s, (v) => `${BASE_FONT * v}px`);
  const iconSize = useTransform(s, (v) => `${BASE_ICON * v}px`);
  const pad = useTransform(s, (v) => `${BASE_PAD * v}px`);

  return (
    <MotionLink
      ref={measureRef}
      to={menu.href}
      onFocus={onFocus}
      title={menu.label}
      aria-current={active ? 'page' : undefined}
      style={{ fontSize, paddingLeft: pad, paddingRight: pad }}
      className={cn(
        // h-8 固定 —— 放大不改高度,顶栏不会被撑开、内容不会被裁
        'relative inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-8',
        // duration-fast 收口时基 —— 裸 transition-colors 吃 Tailwind 默认 150ms,
        // 不在 duration 四档 token 上
        'transition-colors duration-fast',
        active
          // 玄墨实底用 on-dark 而非纯白 —— 与紧邻的首页/浏览器按钮(MenuCarousel)
          // 必须是同一种白,否则同一条顶栏上并排出现两种白
          ? 'bg-foreground text-on-dark'
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

    </MotionLink>
  );
}
