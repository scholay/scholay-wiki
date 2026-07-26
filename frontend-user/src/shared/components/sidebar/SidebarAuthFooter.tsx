import { LogIn } from 'lucide-react';
import { useAuthStatus } from '@/stores/auth.store';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { cn } from '@/shared/lib/utils';
import { UserMenuContent } from '../UserMenuContent';
import { SidebarUser } from './SidebarUser';

/**
 * 侧栏底部用户/登录条 —— 智能版,自己读 auth state:
 *
 *   - 已登录:渲染 SidebarUser(真实用户名/邮箱/头像)+ 共享 UserMenuContent
 *     下拉(与顶栏 user pill 弹出内容完全一致,对照 .pen `g1qah`)
 *   - 未登录:渲染 "登录 / 注册" 两个按钮(同样的 h-14 + 顶 border,
 *     不会撑变 sidebar 高度)
 *
 * 用法:任意 sidebar 在最下面 `<SidebarAuthFooter />` 即可,无 props。
 */
export function SidebarAuthFooter() {
  // 登录与否只看 token(authenticated);user 仅用于展示,已登录但 profile 未到时为 null。
  const { authenticated, user } = useAuthStatus();
  const openDialog = useAuthDialog((s) => s.openDialog);

  if (!authenticated) {
    return <UnauthedFooter onLogin={() => openDialog('login')} onRegister={() => openDialog('register')} />;
  }
  if (!user) {
    // 已登录但 profile 尚未拉到 —— 占位条(同 h-14),**不**回退成登录/注册。
    return <LoadingUserFooter />;
  }

  const name = user.username || user.email.split('@')[0] || '用户';
  return (
    <SidebarUser
      name={name}
      email={user.email}
      avatarUrl={user.avatar}
      menu={<UserMenuContent />}
    />
  );
}

// ============================================================================
// 已登录但 profile 未到 —— 同尺寸占位(h-14 + border-t),避免闪现「登录/注册」
// ============================================================================

function LoadingUserFooter() {
  return (
    <div className="flex h-14 items-center gap-2 px-4 border-t border-border-soft shrink-0">
      <div className="size-8 rounded-pill bg-surface-2 animate-pulse shrink-0" />
      <div className="h-3 w-24 rounded-4 bg-surface-2 animate-pulse" />
    </div>
  );
}

// ============================================================================
// 未登录态 —— 与 SidebarUser 同尺寸(h-14 + border-t),无侧栏布局抖动
// ============================================================================

function UnauthedFooter({
  onLogin,
  onRegister,
}: {
  onLogin: () => void;
  onRegister: () => void;
}) {
  return (
    <div
      className={cn(
        // h-14 与 SidebarUser 一致,登录/未登录态切换时 sidebar 底部不抖
        'flex h-14 items-center gap-2 px-4 border-t border-border-soft shrink-0'
      )}
    >
      <button
        type="button"
        onClick={onLogin}
        className="flex-1 inline-flex items-center justify-center gap-1 h-8 rounded-8 bg-brand-red text-on-brand text-12 font-medium hover:bg-brand-red/90 transition-colors"
      >
        <LogIn className="size-3" strokeWidth={2.5} />
        登录
      </button>
      <button
        type="button"
        onClick={onRegister}
        className="flex-1 inline-flex items-center justify-center h-8 rounded-8 border border-border-strong text-12 font-medium text-subtle hover:bg-surface-1 hover:text-foreground transition-colors"
      >
        注册
      </button>
    </div>
  );
}
