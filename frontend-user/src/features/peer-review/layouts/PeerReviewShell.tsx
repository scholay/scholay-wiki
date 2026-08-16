import { Outlet } from 'react-router-dom';
import { Send, ScrollText, Lock, LogIn, UserPlus } from 'lucide-react';
import { EmptyState } from '@/shared/components/EmptyState';
import { Button } from '@/shared/ui/button';
import { useRegisterSidebarRail } from '@/stores/sidebar.store';
import { useAuthStore } from '@/stores/auth.store';
import { useAuthDialog } from '@/stores/auth-dialog.store';

/**
 * 智能审稿外壳 —— 跟 library / search 等 feature 同款 SidebarLayout:
 *
 *   - sidebar 由全局 useSidebar 控制开合(顶栏 ☰ / Cmd+B / chip 全都生效)
 *   - 折叠态时由 TopNav 渲染 rail chip(我要投稿 / 审稿记录),
 *     由 useRegisterSidebarRail 注入
 *   - 主区 Outlet 由子路由 (Landing / Wizard / Records / RecordDetail) 渲染
 */
export function PeerReviewShell() {
  const token = useAuthStore((s) => s.token);
  // sectionId 对齐 PeerReviewSidebar 的 <SidebarSection id=...> —— 点 chip 展开 sidebar 时
  // 对应段闪一下定位 (之前缺 sectionId, 只展开不闪)。
  useRegisterSidebarRail([
    { id: 'submit', label: '我要投稿', icon: Send, sectionId: 'submit' },
    { id: 'records', label: '我的审稿', icon: ScrollText, sectionId: 'records' },
  ]);

  // 侧边栏始终可开合 (跟文献搜索一致); 主区在未登录时整体换成登录引导 ——
  // 审稿功能必须登录才能用, 所以这里直接拦在 Outlet 之前, 子页面的数据 hook 也就不会 401。
  return (
    <>{token ? <Outlet /> : <PeerReviewLoginPrompt />}</>
  );
}

/** 未登录访问智能审稿主区 —— 登录引导卡(登录 / 注册 双按钮)。 */
function PeerReviewLoginPrompt() {
  const openDialog = useAuthDialog((s) => s.openDialog);
  return (
    <EmptyState
      className="h-full"
      icon={Lock}
      title="登录后使用智能审稿"
      description="登录后即可上传稿件、AI 三审 + 主审决议, 投稿记录云端同步"
      action={
        <div className="flex items-center gap-3">
          <Button onClick={() => openDialog('login')} variant="primary">
            <LogIn className="size-4" />
            登录
          </Button>
          <Button onClick={() => openDialog('register')} variant="outline">
            <UserPlus className="size-4" />
            注册
          </Button>
        </div>
      }
    />
  );
}
