import { Children, useMemo, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutGroup, motion, useReducedMotion } from 'framer-motion';
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
} from './app-sidebar-records';
import { SidebarHistory } from './app-sidebar-history';

const RAIL_SLIDE = { duration: 0.42, ease: [0.22, 1, 0.36, 1] } as const;

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

/**
 * 全站左轨两段:
 *   上 — 一级功能;选中后展开二级子入口,未选中折叠
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

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarSection id="app-functions">
          <LayoutGroup>
          <div className="flex flex-col">
          {railMenus.map((m) => {
            const Icon = m.icon;
            const isNewChat = m.id === PINNED_RAIL_ID;
            const isPinned = pinnedSet.has(m.id);
            const current = m.match(pathname);
            const children = getFeatureSubs(m.id);
            const open = current && children.length > 0;
            const childActive = children.some((c) =>
              isFeatureRecordActive(c, pathname, search, children),
            );
            const muted = !isNewChat && !current && !isPinned;
            return (
              <motion.div
                key={m.id}
                layout="position"
                transition={reduceMotion ? { duration: 0 } : RAIL_SLIDE}
                className="group/rail relative"
              >
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
                      return (
                        <SidebarItem
                          key={item.id}
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
                          active={false}
                          aria-disabled={item.comingSoon || undefined}
                          className={
                            item.comingSoon
                              ? 'cursor-default font-normal text-faint hover:bg-transparent hover:text-faint'
                              : subActive
                                ? 'bg-surface-2 font-medium text-foreground'
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
                    })}
                  </RailTreeBranch>
                ) : null}
              </motion.div>
            );
          })}
          </div>
          </LayoutGroup>
        </SidebarSection>
        <SidebarHistory />
      </SidebarContent>
    </Sidebar>
  );
}

/**
 * 一级图标中心垂下的树干 + 每条二级的横肘。
 * 用连线表达层级,不再靠 chevron / 缩进。
 */
function RailTreeBranch({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <span
        aria-hidden
        className="pointer-events-none absolute -top-2.5 bottom-3.5 left-[22px] w-px bg-border-strong"
      />
      {Children.map(children, (child) => (
        <div className="relative">
          <span
            aria-hidden
            className="pointer-events-none absolute left-[22px] top-1/2 h-px w-3.5 -translate-y-px bg-border-strong"
          />
          {child}
        </div>
      ))}
    </div>
  );
}
