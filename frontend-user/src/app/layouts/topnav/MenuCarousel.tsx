import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Globe, Home, LayoutGrid } from 'lucide-react';
import { MENUS, findActiveMenuIndex, type Menu } from '@/app/menus';
import { IconButton } from '@/shared/components/IconButton';
import { cn } from '@/shared/lib/utils';
import {
  browserTabUrl,
  useBrowserTabs,
} from '@/stores/browser-tabs.store';
import { AllMenusOverlay } from './AllMenusOverlay';

/**
 * 中段菜单 carousel —— 对照 .pen `cFxZK` centerGroup + `lzx3R` carousel:
 *
 *   [Home]  |  ←  [viewport: active 居中,左右是邻近 menu]  →  |  [Grid]
 *
 * ============================================================================
 * 设计原则:URL 是唯一真理(单向数据流)
 * ============================================================================
 * 1. activeIndex 由 location.pathname 派生(findActiveMenuIndex)
 * 2. 任何 click → navigate → URL 变 → activeIndex 变 → carousel 滑动同步
 * 3. 无 settle 反向 navigate,无对抗,永远丝滑
 *
 * ============================================================================
 * 无缝循环(3 拷贝技巧)
 * ============================================================================
 * 把 MENUS 渲染 3 次(left clone | main | right clone),trackIndex 可以指向
 * 任何一份。正常情况下 trackIndex 落在 main 段(N..2N);走到边界(wrap)时
 * 暂时指向 clone 段,动画完成后 silent snap 回 main 段对应位置,视觉无跳变。
 *
 * activeIndex 变 → 计算 forward vs backward 哪个更近,选短的方向滑过去。
 *
 * ============================================================================
 * 纵向不抖
 * ============================================================================
 * track 锁 h-9(active chip 高),inactive chip h-7 通过 items-center 居中,
 * 所以容器高度恒定 36px,周围按钮永不被推动。
 */
export function MenuCarousel() {
  const navigate = useNavigate();
  const location = useLocation();
  const N = MENUS.length;

  const activeIndex = useMemo(
    () => findActiveMenuIndex(location.pathname),
    [location.pathname]
  );

  const viewportRef = useRef<HTMLDivElement>(null);
  // 3 份菜单的 item refs(0..3N-1)
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);

  // trackIndex:指向 3 拷贝列表的位置;初始在 main 段(N + activeIndex)
  const [trackIndex, setTrackIndex] = useState(N + activeIndex);
  const [trackX, setTrackX] = useState(0);
  // 控制是否走 CSS transition —— wrap snap 时临时关
  const [animating, setAnimating] = useState(true);

  // URL → trackIndex:走最短路径(forward / backward 取小者),自然 wrap
  useEffect(() => {
    setTrackIndex((curr) => {
      const currMenuIdx = ((curr % N) + N) % N;
      if (currMenuIdx === activeIndex) return curr;
      const forward = (activeIndex - currMenuIdx + N) % N; // 0..N-1
      const backward = (currMenuIdx - activeIndex + N) % N; // 0..N-1
      // 走"距离短"的方向;同距离时优先 forward
      const signedDelta = forward <= backward ? forward : -backward;
      setAnimating(true);
      return curr + signedDelta;
    });
  }, [activeIndex, N]);

  // trackIndex 变 → 量 DOM 算 translateX(让 trackIndex 处的 item 在视口居中)
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const item = itemRefs.current[trackIndex];
    if (!viewport || !item) return;
    const vr = viewport.getBoundingClientRect();
    const ir = item.getBoundingClientRect();
    const delta = vr.left + vr.width / 2 - (ir.left + ir.width / 2);
    setTrackX((prev) => prev + delta);
  }, [trackIndex]);

  // 窗口缩放重测
  useEffect(() => {
    const onResize = () => {
      const viewport = viewportRef.current;
      const item = itemRefs.current[trackIndex];
      if (!viewport || !item) return;
      const vr = viewport.getBoundingClientRect();
      const ir = item.getBoundingClientRect();
      const delta = vr.left + vr.width / 2 - (ir.left + ir.width / 2);
      setTrackX((prev) => prev + delta);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [trackIndex]);

  // transition end:若 trackIndex 跑到了 clone 段,silent snap 回 main 段
  const handleTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.propertyName !== 'transform') return;
    if (trackIndex >= N && trackIndex < 2 * N) return; // 已在 main 段
    const inMain = N + (((trackIndex % N) + N) % N);
    if (inMain === trackIndex) return;
    // 关动画 → 跳到 main 对应位置 → 下一帧再开动画
    setAnimating(false);
    setTrackIndex(inMain);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setAnimating(true));
    });
  };

  const goPrev = () => {
    const next = (activeIndex - 1 + N) % N;
    navigate(MENUS[next].href);
  };
  const goNext = () => {
    const next = (activeIndex + 1) % N;
    navigate(MENUS[next].href);
  };

  // 3 份 menu 渲染(left clone + main + right clone)
  const tripled = useMemo(() => [...MENUS, ...MENUS, ...MENUS], []);

  // 首页(/)单独有一颗小房子按钮 —— 与 MENUS 平级,在 / 时高亮成黑底白字,
  // 同步 carousel 的中部 chip 不再借位伪装"首页"
  const onHome = location.pathname === '/';
  // detail pane 路由(2026-05 由 /browser/* 改为 SEO 友好 canonical)
  const isInDetailPane = /^\/(paper|author|journal|pdf)\//.test(
    location.pathname
  );
  const onBrowser = isInDetailPane;

  // 浏览器入口 —— 论文/期刊/学者/PDF 详情承载页。
  // 没有打开过任何详情 tab 时整个按钮**不渲染**(不是 disabled),
  // 避免出现一颗"无意义的灰按钮"占位污染顶栏。有 tab 才显出来,点击进活跃 tab。
  const browserTabs = useBrowserTabs((s) => s.tabs);
  const browserActiveId = useBrowserTabs((s) => s.activeTabId);
  const refreshReturnTo = useBrowserTabs((s) => s.refreshReturnTo);
  const hasBrowserTabs = browserTabs.length > 0;
  const goBrowser = () => {
    const target =
      browserTabs.find((t) => t.id === browserActiveId) ?? browserTabs[0];
    if (!target) return;
    // 关键:从顶栏 Globe 按钮跳浏览器,要把当前路径作为新的 returnTo —— 否则
    // tab 内的"返回"会跳回当初创建该 tab 的来源(可能是好几次操作前的页面),
    // 用户预期是"刚才从哪个页面点过来的就回那里"。已经在 detail pane 里就不动
    // (避免内部跳 tab 互相串改 returnTo)。
    if (!isInDetailPane) {
      refreshReturnTo(target.id, `${location.pathname}${location.search}`);
    }
    navigate(browserTabUrl(target));
  };

  return (
    <div className="flex items-center gap-1.5 justify-center w-full">
      {/* 浏览器入口 —— 放在首页(小房子)左边。没有 tab 时整颗按钮直接 unmount。 */}
      {hasBrowserTabs && (
        <IconButton
          tooltip="浏览器"
          aria-label="浏览器"
          className={cn(
            'rounded-lg',
            onBrowser
              ? // active 态与首页按钮一致:固定黑底白字
                'bg-foreground text-background cursor-default hover:bg-foreground hover:text-background'
              : 'bg-surface-2'
          )}
          onClick={goBrowser}
        >
          <Globe strokeWidth={2} />
        </IconButton>
      )}

      <IconButton
        tooltip="首页"
        aria-label="首页"
        className={cn(
          'rounded-lg',
          onHome
            ? // 选中态:固定黑底白字,显式同色 hover 抵消 IconButton 内置的
              // hover:bg-surface-2 / hover:text-foreground —— 否则 hover 会
              // 把按钮"变浅"看着像取消选中
              'bg-foreground text-background cursor-default hover:bg-foreground hover:text-background'
            : 'bg-surface-2'
        )}
        onClick={() => navigate('/')}
      >
        <Home strokeWidth={2} />
      </IconButton>

      <Separator />

      <button
        type="button"
        aria-label="上一个菜单"
        onClick={goPrev}
        className="inline-flex items-center justify-center w-5 h-5 text-faint hover:text-foreground transition-colors shrink-0"
      >
        <ChevronLeft className="size-4" />
      </button>

      <div
        ref={viewportRef}
        // 响应式 viewport:
        //   <lg(1024) 用 260px(显示 3 chip:左 1 / 中 active / 右 1),
        //   ≥lg     用 420px(显示 5 chip:左 2 / 中 active / 右 2)
        // 窄屏自动把空间让给 left col 的 Rail / right col 的 User
        className="overflow-hidden w-[260px] lg:w-[420px]"
        aria-roledescription="carousel"
      >
        <div
          // 锁高 h-9 = active chip 高度,inactive 用 items-center 居中,容器恒定
          className={cn(
            'flex items-center gap-1 h-9 will-change-transform',
            animating && 'transition-transform duration-300 ease-out'
          )}
          style={{ transform: `translate3d(${trackX}px, 0, 0)` }}
          onTransitionEnd={handleTransitionEnd}
        >
          {tripled.map((menu, i) => {
            // 居中的 chip + 该 chip 的 match() 确实匹配当前 pathname 才算 active。
            // 这样在首页(`/`)上,carousel 仍会把 MENUS[0]=文献搜索 居中显示作为占位,
            // 但 active 高亮被压制 —— 视觉上"首页"那颗 Home 按钮才是 active。
            const isCentered = i === trackIndex;
            const isActive = isCentered && menu.match(location.pathname);
            return (
              <div
                key={i}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                className="shrink-0 px-1"
              >
                <MenuChip
                  menu={menu}
                  active={isActive}
                  onClick={() => {
                    // 之前的判断 `menuIdx !== activeIndex` 用了 fallback 0 做 active,
                    // 在 `/` 首页上点 文献搜索(index=0) 会被误判"已激活"而被吞掉。
                    // 改用 `menu.match(pathname)` 真值:只有真正已经在这个菜单的页面
                    // 才省一次 navigate,否则正常跳转。
                    if (!menu.match(location.pathname)) navigate(menu.href);
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        aria-label="下一个菜单"
        onClick={goNext}
        className="inline-flex items-center justify-center w-5 h-5 text-faint hover:text-foreground transition-colors shrink-0"
      >
        <ChevronRight className="size-4" />
      </button>

      <Separator />

      <AllMenusOverlay
        trigger={
          // 不挂 tooltip —— hover 即弹浮层,再叠 tooltip 会"两层提示打架"
          <IconButton
            aria-label="全站功能"
            className="rounded-lg bg-surface-2"
          >
            <LayoutGrid strokeWidth={2} />
          </IconButton>
        }
      />
    </div>
  );
}

/**
 * 单个 menu chip —— active 大黑底白字 chip,inactive 灰色小 chip。
 * 尺寸差异由 transition-all 300ms 过渡,与 track translateX 同步,
 * 视觉上"长大 + 平移"一气呵成。
 */
function MenuChip({
  menu,
  active,
  onClick,
}: {
  menu: Menu;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap transition-all duration-300 ease-out',
        active
          ? 'h-9 px-4 rounded-lg bg-foreground text-background text-base font-bold'
          : 'h-7 px-2.5 rounded-md text-sm text-faint hover:text-foreground hover:bg-surface-1'
      )}
    >
      <menu.icon className="size-3.5" />
      <span>{menu.label}</span>
      {/* 「即将推出」amber 角标 —— 内嵌在 chip 右侧 (跟随 chip 一起被 carousel
         transform 移动),不再 absolute 跨出 chip 边界。
         之前 -top-1.5/-right-2 会被 viewport overflow-hidden 裁掉一半。 */}
      {menu.comingSoon && (
        <span
          aria-hidden="true"
          className={cn(
            'inline-flex items-center px-1 rounded-pill bg-brand-amber text-background text-[9px] font-bold leading-none whitespace-nowrap shrink-0',
            // active(h-9 大 chip)与 inactive(h-7 小 chip)用不同的 badge 高度,
            // 视觉密度更协调
            active ? 'h-4' : 'h-3.5'
          )}
        >
          即将推出
        </span>
      )}
    </button>
  );
}

function Separator() {
  return <span aria-hidden className="h-5 w-px bg-border-separator shrink-0" />;
}
