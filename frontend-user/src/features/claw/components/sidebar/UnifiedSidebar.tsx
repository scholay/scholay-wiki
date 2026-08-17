import { SearchSidebar } from '@/features/search/components/SearchSidebar';

/**
 * 智能助手侧栏 —— 与文献检索同构:工作区(暂存 + 我的文件夹 / 文献集)。
 * 会话历史走全站左轨「对话」段,本侧栏只挂工作区。
 */
export function UnifiedSidebar() {
  return <SearchSidebar />;
}
