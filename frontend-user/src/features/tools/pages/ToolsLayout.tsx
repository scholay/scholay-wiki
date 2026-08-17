import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Compass, Filter, X } from 'lucide-react';
import { useLocalStorage, useUrlState } from '@/shared/hooks';
import { useRegisterSidebarRail } from '@/stores/sidebar.store';
import {
  ColumnResizeHandle,
  startColumnResize,
} from '@/features/search/components/workspace/ColumnResizeHandle';
import { PlazaHeader } from '../components/PlazaHeader';
import { PlazaDetailProvider, usePlazaDetail } from '../plaza-detail';

const DETAIL_MIN_PX = 320;
const DETAIL_MAX_PX = 720;
const DETAIL_DEFAULT_PX = 420;

/**
 * 功能广场壳 —— 侧栏挂一次,目录页/详情页用 <Outlet/> 切换主区。
 * 这样在「目录 ↔ 详情」之间跳转时侧栏不重挂,避免重复初始化筛选状态。
 */
export function ToolsLayout() {
  // 折叠态 Rail 两个冗余入口:功能广场(快捷 section)+ 筛选器(filters section),
  // 点击对应 chip 会展开侧栏并让该 section 闪烁高亮 —— 与文献搜索一致。
  useRegisterSidebarRail([
    { id: 'tools', label: '功能广场', icon: Compass, sectionId: 'tools' },
    { id: 'filters', label: '筛选器', icon: Filter, sectionId: 'filters' },
  ]);

  // 一级 /tools 是干净 Hub;列表段才挂共享头部;工具详情页 /tools/:slug 走裸 Outlet。
  const { pathname } = useLocation();
  const isHub = pathname === '/tools';
  const isList =
    pathname === '/tools/catalog' ||
    pathname === '/tools/datasets' ||
    pathname === '/tools/skills' ||
    pathname === '/tools/prompts' ||
    pathname === '/tools/news';

  return (
    <>
      {isHub ? (
        <Outlet />
      ) : isList ? (
        <PlazaDetailProvider>
          <PlazaListShell />
        </PlazaDetailProvider>
      ) : (
        <Outlet />
      )}
    </>
  );
}

function PlazaListShell() {
  const { pathname } = useLocation();
  const [rawQ] = useUrlState('q', '');
  const { detail, setDetail } = usePlazaDetail();
  const [detailWidth, setDetailWidth] = useLocalStorage(
    'tools.plaza-detail-width',
    DETAIL_DEFAULT_PX,
  );
  const datasetsLanding =
    pathname === '/tools/datasets' && !rawQ.trim() && !detail;
  const newsLanding = pathname === '/tools/news';
  const hidePlazaHeader = datasetsLanding || newsLanding;
  useEffect(() => {
    setDetail(null);
  }, [pathname, setDetail]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-1">
      {hidePlazaHeader ? null : <PlazaHeader />}
      <div className="flex min-h-0 flex-1">
        <div
          className={
            hidePlazaHeader
              ? 'min-h-0 flex-1'
              : 'min-h-0 flex-1 overflow-auto px-6 py-5'
          }
        >
          {hidePlazaHeader ? (
            <Outlet />
          ) : (
            <div className="mx-auto max-w-6xl">
              <Outlet />
            </div>
          )}
        </div>
        {detail ? (
          <>
            <ColumnResizeHandle
              label="拖动调整详情栏宽度"
              onPointerDown={(e) =>
                startColumnResize(
                  e,
                  detailWidth,
                  setDetailWidth,
                  DETAIL_MIN_PX,
                  DETAIL_MAX_PX,
                  -1,
                )
              }
            />
            <aside
              style={{ width: detailWidth }}
              className="flex h-full min-h-0 shrink-0 flex-col bg-background"
            >
              <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-4">
                <span className="truncate text-12 font-medium text-foreground">
                  {detail.title}
                </span>
                <button
                  type="button"
                  onClick={() => setDetail(null)}
                  className="inline-flex size-7 items-center justify-center rounded-4 text-faint transition-colors hover:bg-surface-1 hover:text-foreground"
                  aria-label="关闭详情"
                >
                  <X className="size-3.5" strokeWidth={2} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto">{detail.content}</div>
            </aside>
          </>
        ) : null}
      </div>
    </div>
  );
}
