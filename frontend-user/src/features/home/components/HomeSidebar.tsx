import { useLocation } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarSection,
  SidebarRichItem,
  SidebarAuthFooter,
  SidebarCollapseButton,
} from'@/shared/components/sidebar';
import { groupMenusByCategory } from'@/app/menus';
import { useSidebar } from'@/stores/sidebar.store';
import { useLibraryFoldersForHome as useLibraryFolders } from'../api/library';

/**
 * 首页侧栏 —— 对照 .pen`n0GFZR`。
 *
 * 分类来自 menus.ts 的单一来源(检索 / 智能 / 资源),不再硬编码
 *"工作流 / AI 工具"等历史叫法。每段渲染为 SidebarRichItem(icon + 双行 + chevron)。
 */

/**
 * 首页 sidebar 卡的副文 —— 用户语义化(强调"我现在能做什么"),
 * 而不是 menus.ts 里的"功能介绍式"description。两者刻意不同。
 */
const SUBTITLES: Record<string, string> = {
  search: '自然语言 + 矩阵分析', 'journal-search' : '期刊主页 · IF · ISSN',
  library: '整理论文 · 分文件夹收藏', // 已登录会被 useLibrarySubtitle 替换为真实计数
  tools: '科研路上的小工具集合', 'peer-review' : '草稿 MeshDiff · Step 4/5',
  prism: 'AI 写作 · LaTeX 编辑器',
  claw: 'AI 助手 · 学术对话',
};

/** library 卡的副文案 —— 已登录就拿真实数据,未登录用 SUBTITLES 默认值 */
function useLibrarySubtitle(): string {
  const { data } = useLibraryFolders();
  if (!data) return SUBTITLES.library!;
  return`${data.total_count.toLocaleString()} 篇 · ${data.folders.length} 个文件夹`;
}

export function HomeSidebar() {
  const { pathname } = useLocation();
  const toggleSidebar = useSidebar((s) => s.toggle);
  const librarySubtitle = useLibrarySubtitle();
  const groups = groupMenusByCategory();

  const subtitleFor = (id: string) =>
    id ==='library' ? librarySubtitle : (SUBTITLES[id] ?? '');

  return (
    <Sidebar>
      <SidebarContent>
        {/* 按 menus.ts 分类渲染:检索 / 智能 / 资源 */}
        {/*"其他"段(设置/帮助与反馈)暂时移除 —— 相应路由还未实现,避免点击 404 */}
        {groups.map((g) => (
          <SidebarSection key={g.category} label={g.label}>
            {g.items.map((m) => (
              <SidebarRichItem
                key={m.id}
                to={m.href}
                icon={<m.icon />}
                label={m.label}
                description={subtitleFor(m.id)}
                active={
                  pathname === m.href ||
                  (m.href !== '/' && pathname.startsWith(`${m.href}/`))
                }
                aria-current={
                  pathname === m.href ||
                  (m.href !== '/' && pathname.startsWith(`${m.href}/`))
                    ? 'page'
                    : undefined
                }
              />
            ))}
          </SidebarSection>
        ))}
      </SidebarContent>

      <SidebarAuthFooter />
      <SidebarCollapseButton onClick={toggleSidebar} />
    </Sidebar>
  );
}
