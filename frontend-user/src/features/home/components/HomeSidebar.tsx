import { NavLink } from'react-router-dom';
import { ChevronRight } from'lucide-react';
import type { LucideIcon } from'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarSection,
  SidebarAuthFooter,
  SidebarCollapseButton,
} from'@/shared/components/sidebar';
import { groupMenusByCategory } from'@/app/menus';
import { useSidebar } from'@/stores/sidebar.store';
import { cn } from'@/shared/lib/utils';
import { useLibraryFoldersForHome as useLibraryFolders } from'../api/library';

/**
 * 首页侧栏 —— 对照 .pen`n0GFZR`。
 *
 * 分类来自 menus.ts 的单一来源(检索 / 智能 / 资源),不再硬编码
 *"工作流 / AI 工具"等历史叫法。每段渲染为 RichMenuItem(icon + 双行 + chevron)。
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

/**
 * 首页主菜单的"rich card"行 — 28×28 icon 容器 + 双行(标题 11 / 副标题 10)+ chevron
 * .pen`m1`/`m2`/`ai1`/`ai2`都是这个模板。
 */
function RichMenuItem({
  href,
  icon: Icon,
  label,
  subtitle,
  inactive,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  subtitle: string;
  /** disabled/灰显态 — .pen`m3`工具大全的图标用了更浅色 */
  inactive?: boolean;
}) {
  return (
    <NavLink
      to={href}
      className={({ isActive }) =>
        cn(
          // h-tab(42px,globals.css --spacing-tab):.pen `GD9ii` 等 rich card 行高
          'group flex items-center gap-3 h-tab px-4 transition-colors',
          'hover:bg-surface-1 focus-visible:bg-surface-1',
          isActive && 'bg-surface-1'
        )
      }
    >
      <span
        className={cn('inline-flex h-7 w-7 items-center justify-center rounded-8 shrink-0',
          inactive ? 'bg-surface-1' : 'bg-surface-2')}
      >
        <Icon
          className={cn('size-3.5',
            inactive ? 'text-faint' : 'text-subtle')}
        />
      </span>
      {/* 字号 11/10(2026-07-29 产品拍板)—— 这是**对 Figma 六档的刻意偏离**,设计师后续补规范。
         理由:本列表一屏堆 7~8 条、每条两行,14/12 在这个密度下会把副标题挤到 truncate,
         信息量反而下降。已在 globals.css 立成 --text-11 / --text-10 两档(不是 arbitrary),
         这样设计师能统一调、护栏也管得住。
         ⚠️ 别把这两档铺到别处:10px 在 1.25 行高下已贴着可读性下限,只服务密集导航。
         副标题用 text-faint 而非 text-muted-foreground,视觉重量更轻,与标题对比更强。 */}
      <div className="flex-1 min-w-0 flex flex-col">
        <span
          className={cn('inline-flex items-center gap-1.5 text-11 font-medium truncate',
            inactive ? 'text-subtle' : 'text-foreground')}
        >
          <span className="truncate">{label}</span>
        </span>
        <span className="text-10 text-faint truncate mt-px">{subtitle}</span>
      </div>
      <ChevronRight className="size-3 text-faint shrink-0"/>
    </NavLink>
  );
}

export function HomeSidebar() {
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
              <RichMenuItem
                key={m.id}
                href={m.href}
                icon={m.icon}
                label={m.label}
                subtitle={subtitleFor(m.id)}
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
