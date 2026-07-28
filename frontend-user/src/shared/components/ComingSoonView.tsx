import { type ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import {
  Sidebar,
  SidebarAuthFooter,
  SidebarCollapseButton,
  SidebarContent,
  SidebarLayout,
  SidebarSection,
} from '@/shared/components/sidebar';
import { useSidebar } from '@/stores/sidebar.store';

/**
 * 「即将推出」功能占位页 ——
 *
 * 结构对齐 文献搜索 / 文献集 / 期刊搜索 等已上线 feature:
 *   - SidebarLayout(左 240 aside,右内容,带收起/展开)
 *   - aside 用一个仅含 SidebarAuthFooter + 一段"即将推出"
 *     提示的空白 Sidebar,保留展开/收起交互;全站导航走 TopNav
 *   - 主区 顶部一条 amber banner 标识"即将推出 · 样式预览暂不可使用",
 *     下方是 feature 自己渲染的样式预览(`preview` slot,opacity-60 蒙层 + 禁用)
 *
 * 不再中心叠一个白卡 —— 之前的卡片把预览盖死了,这里改成顶 banner +
 * 完整可见预览,信息密度更接近 .pen 设计稿的"上线后实际样子"。
 */
export interface ComingSoonViewProps {
  /** feature 中文名,如 "智能写作" */
  title: string;
  /** "即将推出"详细解释 —— 描述这个功能上线后能做什么 */
  description: ReactNode;
  /** feature 的样式预览 slot */
  preview: ReactNode;
}

export function ComingSoonView({ title, description, preview }: ComingSoonViewProps) {
  return (
    <SidebarLayout sidebar={<ComingSoonSidebar title={title} />}>
      <div className="flex flex-col h-full min-h-0 bg-background">
        {/* 顶部 banner —— 居中、amber 强调色,简洁陈述功能尚未上线 */}
        <div className="flex items-center justify-center gap-2 h-10 px-4 bg-warning-soft text-brand-amber text-xs font-bold shrink-0">
          <Sparkles className="size-3.5" strokeWidth={2.5} />
          <span>{title}即将推出</span>
          <span className="text-muted-foreground font-normal">·</span>
          <span className="text-muted-foreground font-normal">
            {description}
          </span>
        </div>

        {/* 样式预览 —— 60% 不透明 + 整体禁用交互,让用户能看清未来形态但不会
           误以为可用。preview 自己控制内部结构,无需再嵌外壳。 */}
        <div
          aria-hidden="true"
          className="flex-1 min-h-0 overflow-hidden opacity-60 pointer-events-none select-none"
        >
          {preview}
        </div>
      </div>
    </SidebarLayout>
  );
}

/**
 * "即将推出"页用的简化侧栏:保留收起按钮 + 登录态 footer,
 * 中间内容区只放一条"功能即将推出"提示。
 *
 * 一旦真正实现这个 feature,把这个 Sidebar 替换成 feature 自己的实现即可。
 */
function ComingSoonSidebar({ title }: { title: string }) {
  const toggleSidebar = useSidebar((s) => s.toggle);
  return (
    <Sidebar>
      <SidebarContent>
        <SidebarSection id="coming-soon" label={title}>
          <div className="mx-4 my-2 px-3 py-4 rounded-md bg-warning-soft border border-brand-amber/20">
            <div className="inline-flex items-center gap-1 px-1.5 h-4 rounded-pill bg-brand-amber text-background text-2xs font-bold">
              <Sparkles className="size-2.5" strokeWidth={2.5} />
              即将推出
            </div>
            <p className="mt-2 text-xs text-subtle leading-relaxed">
              这块功能正在打磨。上线后,这里会出现完整的侧栏内容(文件夹 /
              历史 / 配置等)。
            </p>
          </div>
        </SidebarSection>
      </SidebarContent>
      <SidebarAuthFooter />
      <SidebarCollapseButton onClick={toggleSidebar} />
    </Sidebar>
  );
}
