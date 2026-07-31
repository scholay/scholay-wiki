import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type TransitionEvent,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Home } from 'lucide-react';
import { MENUS, findActiveMenuIndex, type Menu } from '@/app/menus';
import { IconButton } from '@/shared/components/IconButton';
import { cn } from '@/shared/lib/utils';

/**
 * 顶栏中段菜单 carousel —— 左右箭头步进 + active 居中:
 *
 *   [Home] | ← [viewport: active 居中,左右邻近 menu] →
 *
 * URL 是唯一真理:click → navigate → pathname → activeIndex → 滑动同步。
 * 3 拷贝无缝循环,wrap 后 silent snap 回 main 段。
 */
export function MenuCarousel() {
  const navigate = useNavigate();
  const location = useLocation();
  const N = MENUS.length;

  const activeIndex = useMemo(
    () => findActiveMenuIndex(location.pathname),
    [location.pathname],
  );

  const viewportRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);

  const [trackIndex, setTrackIndex] = useState(N + activeIndex);
  const [trackX, setTrackX] = useState(0);
  const [animating, setAnimating] = useState(true);

  useEffect(() => {
    setTrackIndex((curr) => {
      const currMenuIdx = ((curr % N) + N) % N;
      if (currMenuIdx === activeIndex) return curr;
      const forward = (activeIndex - currMenuIdx + N) % N;
      const backward = (currMenuIdx - activeIndex + N) % N;
      const signedDelta = forward <= backward ? forward : -backward;
      setAnimating(true);
      return curr + signedDelta;
    });
  }, [activeIndex, N]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const item = itemRefs.current[trackIndex];
    if (!viewport || !item) return;
    const vr = viewport.getBoundingClientRect();
    const ir = item.getBoundingClientRect();
    const delta = vr.left + vr.width / 2 - (ir.left + ir.width / 2);
    setTrackX((prev) => prev + delta);
  }, [trackIndex]);

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

  const handleTransitionEnd = (e: TransitionEvent<HTMLDivElement>) => {
    if (e.propertyName !== 'transform') return;
    if (trackIndex >= N && trackIndex < 2 * N) return;
    const inMain = N + (((trackIndex % N) + N) % N);
    if (inMain === trackIndex) return;
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

  const tripled = useMemo(() => [...MENUS, ...MENUS, ...MENUS], []);
  const onHome = location.pathname === '/';

  return (
    <div className="flex w-full items-center justify-center gap-1.5">
      <IconButton
        tooltip="首页"
        aria-label="首页"
        className={cn(
          'rounded-lg',
          onHome
            ? 'cursor-default bg-foreground text-background hover:bg-foreground hover:text-background'
            : 'bg-surface-2',
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
        className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center text-faint transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
      </button>

      <div
        ref={viewportRef}
        className="w-[260px] overflow-hidden lg:w-[420px]"
        aria-roledescription="carousel"
      >
        <div
          className={cn(
            'flex h-9 items-center gap-1 will-change-transform',
            animating && 'transition-transform duration-300 ease-out',
          )}
          style={{ transform: `translate3d(${trackX}px, 0, 0)` }}
          onTransitionEnd={handleTransitionEnd}
        >
          {tripled.map((menu, i) => {
            const isCentered = i === trackIndex;
            const isActive = isCentered && menu.match(location.pathname);
            return (
              <div
                key={`${menu.id}-${i}`}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                className="shrink-0 px-1"
              >
                <MenuChip
                  menu={menu}
                  active={isActive}
                  onClick={() => {
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
        className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center text-faint transition-colors hover:text-foreground"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

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
        'inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap transition-all duration-300 ease-out',
        active
          ? 'h-9 rounded-lg bg-foreground px-4 text-sm font-medium text-background'
          : 'h-7 rounded-lg px-2.5 text-xs text-faint hover:bg-surface-1 hover:text-foreground',
      )}
    >
      <menu.icon className="size-3.5" />
      <span>{menu.label}</span>
      {menu.comingSoon && (
        <span
          aria-hidden="true"
          className={cn(
            'inline-flex shrink-0 items-center rounded-pill bg-brand-amber px-1 text-[9px] font-medium leading-none whitespace-nowrap text-background',
            active ? 'h-4' : 'h-3.5',
          )}
        >
          即将推出
        </span>
      )}
    </button>
  );
}

function Separator() {
  return <span aria-hidden className="h-5 w-px shrink-0 bg-border-separator" />;
}
