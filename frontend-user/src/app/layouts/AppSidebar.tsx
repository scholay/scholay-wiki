import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Database, Pin } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarItem,
  SidebarSection,
} from '@/shared/components/sidebar';
import { MENUS, type Menu } from '@/app/menus';
import { useSidebar } from '@/stores/sidebar.store';
import { cn } from '@/shared/lib/utils';
import { toast } from 'sonner';
import {
  getFeatureSubs,
  isFeatureRecordActive,
  LIBRARY_SUB_TONE,
  resolveActiveMenu,
} from './app-sidebar-records';
import { SidebarHistory } from './app-sidebar-history';

const RAIL_FOLD = { duration: 0.4, ease: [0.22, 1, 0.36, 1] } as const;
const RAIL_FOLD_STAGGER = 0.05;
const PEEK_LEAVE_MS = 180;

const PINNED_RAIL_ID = 'claw';

function orderRailMenus(pinnedIds: string[]) {
  const claw = MENUS.find((m) => m.id === PINNED_RAIL_ID);
  const rest = MENUS.filter((m) => m.id !== PINNED_RAIL_ID);
  const byId = new Map(rest.map((m) => [m.id, m]));
  const seen = new Set<string>();
  const pinned: Menu[] = [];
  for (const id of pinnedIds) {
    const item = byId.get(id);
    if (item) {
      pinned.push(item);
      seen.add(id);
    }
  }
  return [...(claw ? [claw] : []), ...pinned, ...rest.filter((m) => !seen.has(m.id))];
}

function collectFoldKeys(
  railMenus: Menu[],
  selectedId: string | undefined,
  pathname: string,
  search: string,
): string[] {
  const keys: string[] = [];
  for (const menu of railMenus) {
    if (menu.id === PINNED_RAIL_ID) continue;
    if (menu.id !== selectedId) {
      keys.push(`menu:${menu.id}`);
      continue;
    }
    const children = getFeatureSubs(menu.id);
    for (const item of children) {
      if (!isFeatureRecordActive(item, pathname, search, children)) {
        keys.push(`sub:${menu.id}:${item.id}`);
      }
    }
  }
  return keys;
}

type FoldPeek = {
  id: string;
  label: string;
  indent: 0 | 1;
  icon?: ReactNode;
};

function collectFoldPeeks(
  railMenus: Menu[],
  selectedId: string | undefined,
): FoldPeek[] {
  if (!selectedId) return [];
  const peeks: FoldPeek[] = [];
  for (const menu of railMenus) {
    if (menu.id === PINNED_RAIL_ID || menu.id === selectedId) continue;
    const Icon = menu.icon;
    peeks.push({
      id: `menu:${menu.id}`,
      label: menu.label,
      indent: 0,
      icon: <Icon />,
    });
  }
  return peeks.slice(0, 3);
}

function foldDelay(
  index: number,
  count: number,
  compact: boolean,
  reduceMotion: boolean | null,
) {
  if (reduceMotion || index < 0 || count <= 0) return 0;
  return compact
    ? (count - 1 - index) * RAIL_FOLD_STAGGER
    : index * RAIL_FOLD_STAGGER;
}

/**
 * 全站左轨两段:
 *   上 — 一级功能;选中后展开二级。指针悬停上半段才展开完整列表;
 *        离开上半段后只留智能助手 + 当前一级 + 当前二级,其余折叠并在段底渐隐提示。
 *        首页未选中则不折。
 *   下 — 按当前功能切换。首页空白;学术搜索·智能搜索显示该功能历史;
 *        智能助手显示助手历史;智能写作显示写作项目;智能审稿显示全部审稿记录;
 *        我的资源四分显示对应文件夹;scholay广场各入口空白;其余功能暂空。
 */
export function AppSidebar() {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const pinnedIds = useSidebar((s) => s.railPinned);
  const toggleRailPin = useSidebar((s) => s.toggleRailPin);
  const reduceMotion = useReducedMotion();
  const railMenus = useMemo(() => orderRailMenus(pinnedIds), [pinnedIds]);
  const pinnedSet = useMemo(() => new Set(pinnedIds), [pinnedIds]);
  const selectedId = resolveActiveMenu(pathname)?.id;
  const [peek, setPeek] = useState(false);
  const leaveTimer = useRef<number | null>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const pointerInRail = useRef(false);

  const cancelLeave = useCallback(() => {
    if (leaveTimer.current != null) {
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  }, []);

  const railStillHeld = useCallback(() => {
    return pointerInRail.current || !!railRef.current?.matches(':hover');
  }, []);

  const enterRail = useCallback(() => {
    pointerInRail.current = true;
    cancelLeave();
    setPeek(true);
  }, [cancelLeave]);

  const leaveRail = useCallback(() => {
    pointerInRail.current = false;
    cancelLeave();
    leaveTimer.current = window.setTimeout(() => {
      leaveTimer.current = null;
      if (railStillHeld()) {
        pointerInRail.current = true;
        return;
      }
      setPeek(false);
    }, PEEK_LEAVE_MS);
  }, [cancelLeave, railStillHeld]);

  useEffect(() => () => cancelLeave(), [cancelLeave]);

  // Clicking a title steals focus into the new page. Keep the rail open
  // while the pointer is still in the upper half.
  useEffect(() => {
    if (railStillHeld()) setPeek(true);
  }, [selectedId, railStillHeld]);

  const compact = !!selectedId && !peek;
  const foldKeys = useMemo(
    () => collectFoldKeys(railMenus, selectedId, pathname, search),
    [railMenus, selectedId, pathname, search],
  );
  const foldPeeks = useMemo(
    () => collectFoldPeeks(railMenus, selectedId),
    [railMenus, selectedId],
  );

  return (
    <Sidebar>
      <SidebarContent>
        <div
          ref={railRef}
          onPointerEnter={enterRail}
          onPointerLeave={leaveRail}
          onPointerDown={enterRail}
          onFocusCapture={enterRail}
          onBlurCapture={(e) => {
            if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
            if (railStillHeld()) return;
            leaveRail();
          }}
        >
        <SidebarSection id="app-functions">
          <div className="flex flex-col">
          {railMenus.map((m) => {
            const Icon = m.icon;
            const isNewChat = m.id === PINNED_RAIL_ID;
            const isPinned = pinnedSet.has(m.id);
            const current = m.match(pathname);
            const children = getFeatureSubs(m.id);
            const childActive = children.some((c) =>
              isFeatureRecordActive(c, pathname, search, children),
            );
            const open =
              current && children.length > 0 && (!compact || childActive);
            const muted = !isNewChat && !current && !isPinned;
            const menuFolded = compact && !isNewChat && !current;
            const row = (
              <div className="group/rail relative">
                <SidebarItem
                  icon={<Icon />}
                  label={m.label}
                  size={muted ? 'sm' : 'base'}
                  active={current && !childActive ? 'primary' : false}
                  className={cn(
                    !isNewChat && 'pr-8',
                    muted &&
                      'font-normal text-faint hover:text-subtle [&_span:first-of-type]:text-faint',
                  )}
                  onClick={() => navigate(m.href)}
                />
                {isNewChat ? null : (
                  <button
                    type="button"
                    aria-label={isPinned ? '取消置顶' : '置顶'}
                    aria-pressed={isPinned}
                    className={cn(
                      'absolute right-2 top-1 z-10 inline-flex size-6 items-center justify-center rounded-4 text-faint transition-opacity hover:bg-surface-3 hover:text-foreground',
                      isPinned
                        ? 'opacity-100 text-foreground'
                        : 'opacity-0 group-hover/rail:opacity-100 focus-visible:opacity-100',
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleRailPin(m.id);
                    }}
                  >
                    <Pin className={cn('size-3.5', isPinned && 'fill-current')} />
                  </button>
                )}
                {open ? (
                  <RailTreeBranch>
                    {children.map((item) => {
                      const subActive = isFeatureRecordActive(
                        item,
                        pathname,
                        search,
                        children,
                      );
                      const sub = (
                        <SidebarItem
                          icon={
                            m.id === 'library' ? (
                              <Database
                                className={
                                  LIBRARY_SUB_TONE[item.id] ?? 'text-foreground'
                                }
                              />
                            ) : undefined
                          }
                          label={item.label}
                          title={item.comingSoon ? '敬请期待' : item.label}
                          trailing={item.comingSoon ? '敬请期待' : undefined}
                          size="sm"
                          indent={1}
                          active={!item.comingSoon && subActive ? 'primary' : false}
                          aria-disabled={item.comingSoon || undefined}
                          className={
                            item.comingSoon
                              ? 'cursor-default font-normal text-faint hover:bg-transparent hover:text-faint'
                              : subActive
                                ? undefined
                                : 'font-normal text-faint hover:text-subtle'
                          }
                          onClick={() => {
                            if (item.comingSoon) {
                              toast.info('敬请期待');
                              return;
                            }
                            navigate(item.href);
                          }}
                        />
                      );
                      return (
                        <RailCollapse
                          key={item.id}
                          folded={compact && !subActive}
                          delay={foldDelay(
                            foldKeys.indexOf(`sub:${m.id}:${item.id}`),
                            foldKeys.length,
                            compact,
                            reduceMotion,
                          )}
                        >
                          <RailTreeRow>{sub}</RailTreeRow>
                        </RailCollapse>
                      );
                    })}
                  </RailTreeBranch>
                ) : null}
              </div>
            );
            return (
              <RailCollapse
                key={m.id}
                folded={menuFolded}
                delay={foldDelay(
                  foldKeys.indexOf(`menu:${m.id}`),
                  foldKeys.length,
                  compact,
                  reduceMotion,
                )}
              >
                {row}
              </RailCollapse>
            );
          })}
          <AnimatePresence initial={false}>
            {compact && foldPeeks.length > 0 ? (
              <motion.div
                key="fold-hint"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={
                  reduceMotion ? { duration: 0 } : { ...RAIL_FOLD, delay: 0.12 }
                }
                className="overflow-hidden"
              >
                <RailFoldHint items={foldPeeks} />
              </motion.div>
            ) : null}
          </AnimatePresence>
          </div>
        </SidebarSection>
        </div>
        <SidebarHistory />
      </SidebarContent>
    </Sidebar>
  );
}

function RailCollapse({
  folded,
  delay,
  children,
}: {
  folded: boolean;
  delay: number;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={false}
      animate={folded ? { height: 0, opacity: 0 } : { height: 'auto', opacity: 1 }}
      transition={
        reduceMotion
          ? { duration: 0 }
          : {
              height: { ...RAIL_FOLD, delay },
              opacity: { duration: 0.22, delay, ease: 'easeOut' },
            }
      }
      className="origin-top overflow-hidden"
      inert={folded}
    >
      {children}
    </motion.div>
  );
}

/** Compact rail: peek the next hidden rows with icons kept, then fade them out. */
function RailFoldHint({ items }: { items: FoldPeek[] }) {
  return (
    <div aria-hidden className="relative overflow-hidden">
      <div className="flex max-h-16 flex-col opacity-40">
        {items.map((item) => (
          <SidebarItem
            key={item.id}
            icon={item.icon}
            label={item.label}
            size={item.indent === 0 ? 'base' : 'sm'}
            indent={item.indent}
            tabIndex={-1}
            className="pointer-events-none font-normal text-faint [&_span:first-of-type]:text-faint"
          />
        ))}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-background to-transparent" />
    </div>
  );
}

/** 一级图标中心垂下的树干。横肘跟行一起折,避免收起后留下 1px 残线。 */
function RailTreeBranch({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <span
        aria-hidden
        className="pointer-events-none absolute -top-2.5 bottom-3.5 left-[22px] z-10 w-px bg-border-strong"
      />
      {children}
    </div>
  );
}

function RailTreeRow({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <span
        aria-hidden
        className="pointer-events-none absolute left-[22px] top-1/2 z-10 h-px w-3.5 -translate-y-px bg-border-strong"
      />
      {children}
    </div>
  );
}
