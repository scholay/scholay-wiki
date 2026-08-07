import {
  Sidebar,
  SidebarAuthFooter,
  SidebarCollapseButton,
  SidebarContent,
} from '@/shared/components/sidebar';
import { useSidebar } from '@/stores/sidebar.store';
import { UnifiedSessionList } from './UnifiedSessionList';
import type { TemplateFeature } from '../../lib/feature-meta';

/**
 * 智能助手 / 制作PPT 共用的侧边栏 —— 复用 SidebarLayout 框架,单段:统一会话历史
 * (UnifiedSessionList 合并 claw + boltslides + sci_draw + stat_lab,非对话类会话带小图标)。
 *
 * 取代旧的 ClawSidebar(单 feature 列表):PPT 不再是并列 tab,两 feature 的历史放一起。
 * 模型选择器在 composer 左下角(P2 目录化),技能入口在 composer 底栏,侧栏不重复展示。
 */
export function UnifiedSidebar({
  activeSessionId,
  onSelect,
  onNewConversation,
}: {
  activeSessionId: string | null;
  // 🔴 别在这里再手写一遍联合类型。2026-08-06 实测:UnifiedSessionList 加了 stat_lab
  //    之后这里没跟上,tsc 当场红 —— 这次红得及时,但同一个类型抄在 6 处迟早有一处漏。
  //    统一引 feature-meta 的 TemplateFeature(它同时是 FEATURE_ICON 的键,天然同步)。
  onSelect: (sessionId: string, feature: TemplateFeature) => void;
  onNewConversation: () => void;
}) {
  const toggleSidebar = useSidebar((s) => s.toggle);

  return (
    <Sidebar>
      <SidebarContent>
        <UnifiedSessionList
          activeSessionId={activeSessionId}
          onSelect={onSelect}
          onNewConversation={onNewConversation}
        />
      </SidebarContent>
      <SidebarAuthFooter />
      <SidebarCollapseButton onClick={toggleSidebar} />
    </Sidebar>
  );
}
