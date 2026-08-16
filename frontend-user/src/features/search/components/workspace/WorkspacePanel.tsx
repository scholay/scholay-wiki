import { useEffect, useRef } from 'react';
import { FavoriteBurst } from '@/shared/components/FavoriteBurst';
import { SidebarSection } from '@/shared/components/sidebar';
import { LeaveToLibraryLink } from '@/shared/components/LeaveToLibraryLink';
import { useStageFly } from '@/stores/stage-fly.store';
import { StagingTabs } from '../StagingTabs';
import { WorkspaceFolderTree } from './WorkspaceFolderTree';
import { WORKSPACE_PANEL_WIDTH } from '../matrix/constants';

interface WorkspacePanelProps {
  /** panel = 右栏独立列(已废弃,保留兼容); sidebar = 搜索页左栏 */
  variant?: 'panel' | 'sidebar';
}

/**
 * 工作区 —— 侧栏为可折叠文件夹 + 文献单元卡片;
 * panel 变体仍用 StagingTabs(矩阵等旧入口)。
 */
export function WorkspacePanel({ variant = 'sidebar' }: WorkspacePanelProps) {
  const isSidebar = variant === 'sidebar';
  const rail = false;
  const sectionRef = useRef<HTMLDivElement>(null);
  const setWorkspaceTarget = useStageFly((s) => s.setWorkspaceTarget);

  // 暂存飞入锚点 —— 优先暂存夹内最后一篇,否则文件夹头(data-stage-fly-target)
  useEffect(() => {
    if (!isSidebar) {
      setWorkspaceTarget(null);
      return;
    }
    const fn = () => {
      const root = sectionRef.current;
      if (!root) return null;
      const folder = root.querySelector<HTMLElement>('[data-staging-folder]');
      const rows = folder?.querySelectorAll('[data-workspace-row]');
      const lastRow = rows?.[rows.length - 1];
      if (lastRow) {
        const rr = lastRow.getBoundingClientRect();
        return {
          top: rr.top,
          left: rr.left,
          width: Math.max(rr.width, 40),
          height: rr.height || 32,
        };
      }
      const anchor =
        root.querySelector<HTMLElement>('[data-stage-fly-target]') ?? folder;
      if (!anchor) return null;
      const ar = anchor.getBoundingClientRect();
      return {
        top: ar.top,
        left: ar.left,
        width: Math.max(ar.width, 40),
        height: ar.height || 32,
      };
    };
    setWorkspaceTarget(fn);
    return () => setWorkspaceTarget(null);
  }, [isSidebar, setWorkspaceTarget]);

  if (isSidebar) {
    return (
      <>
        <div ref={sectionRef} className="flex min-w-0 flex-col">
          <SidebarSection
            id="workspace"
            label="工作区"
            prominent
            bordered
            action={
              rail ? undefined : (
                <LeaveToLibraryLink
                  to="/library"
                  className="text-2xs font-bold text-foreground hover:opacity-70"
                >
                  管理
                </LeaveToLibraryLink>
              )
            }
          >
            <WorkspaceFolderTree />
          </SidebarSection>
        </div>
        <FavoriteBurst anchorRef={sectionRef} />
      </>
    );
  }

  return (
    <div
      className="flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-r border-border bg-background"
      style={{ width: WORKSPACE_PANEL_WIDTH }}
    >
      <div className="sticky top-0 z-30 border-b border-border bg-background">
        <StagingTabs />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <WorkspaceFolderTree />
      </div>
    </div>
  );
}
