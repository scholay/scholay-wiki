import { SearchSidebar } from '@/features/search/components/SearchSidebar';

/**
 * 智能助手侧栏 —— 与文献检索同构:工作区(暂存 + 我的文件夹 / 文献集)。
 * 会话切换已迁到主区 AgentSessionStrip,侧栏不再列绘画/对话历史。
 */
export function UnifiedSidebar() {
  return <SearchSidebar />;
}
