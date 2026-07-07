import { ChevronLeft, ListTree, Image as ImageIcon } from 'lucide-react';
import {
  Sidebar,
  SidebarAuthFooter,
  SidebarCollapseButton,
  SidebarContent,
  SidebarHeaderNav,
  SidebarItem,
  SidebarSection,
} from '@/shared/components/sidebar';
import { useSidebar } from '@/stores/sidebar.store';
import type { DocStruct } from '../../api/prism';

/**
 * 新版结构体工作台侧边栏 —— 通用 Sidebar 框架(同 PrismFileSidebar / ClawSidebar)。
 * struct 轨不暴露文件系统,侧栏改展示:返回项目列表 + 大纲(正文标题)+ 配图(已插入的图片资产)。
 */
export function PrismStructSidebar({
  doc,
  title,
  onBack,
}: {
  doc?: DocStruct;
  title: string;
  onBack: () => void;
}) {
  const toggleSidebar = useSidebar((s) => s.toggle);
  const outline = (doc?.body ?? [])
    .filter((b) => b.type === 'heading')
    .map((b, i) => ({ i, level: b.level ?? 1, text: b.text ?? '' }));
  const assets = Object.entries(doc?.assets ?? {}) as [string, { relPath?: string }][];

  return (
    <Sidebar>
      <SidebarHeaderNav />
      <SidebarContent>
        <button
          type="button"
          onClick={onBack}
          title="返回项目列表"
          className="group flex w-full items-center gap-1 px-3 pb-1 pt-3 text-left text-xs font-bold text-foreground"
        >
          <ChevronLeft className="size-3.5 shrink-0 text-faint transition-colors group-hover:text-brand-red" />
          <span className="truncate group-hover:text-brand-red">{title || '未命名项目'}</span>
        </button>

        <SidebarSection id="prism-outline" label="大纲" prominent>
          {outline.length > 0 ? (
            outline.map((s) => (
              <SidebarItem
                key={s.i}
                label={s.text || '(无标题)'}
                icon={<ListTree />}
                indent={Math.min(Math.max(s.level - 1, 0), 3) as 0 | 1 | 2 | 3}
                size="sm"
              />
            ))
          ) : (
            <p className="px-4 py-1 text-2xs text-faint">正文暂无标题</p>
          )}
        </SidebarSection>

        {assets.length > 0 && (
          <SidebarSection id="prism-sources" label="配图" bordered>
            {assets.map(([id, a]) => (
              <SidebarItem key={id} label={a.relPath?.split('/').pop() ?? id} icon={<ImageIcon />} size="sm" />
            ))}
          </SidebarSection>
        )}
      </SidebarContent>
      <SidebarAuthFooter />
      <SidebarCollapseButton onClick={toggleSidebar} />
    </Sidebar>
  );
}
