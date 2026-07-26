import { useNavigate } from'react-router-dom';
import { Headphones } from'lucide-react';
import { useAuthStatus } from'@/stores/auth.store';
import { useAuthDialog } from'@/stores/auth-dialog.store';
import { Button } from'@/shared/ui/button';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from'@/shared/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from'@/shared/ui/dropdown-menu';
import { IconButton } from'@/shared/components/IconButton';
import { NotificationBell } from'@/shared/components/NotificationBell';
import { PromoNavButton } from'./PromoNavButton';
import { UserMenuContent } from'@/shared/components/UserMenuContent';
import { cn } from'@/shared/lib/utils';

/**
 * 顶部导航右段:通知 + 用户 pill / 登录注册 CTA。
 *
 * 对照 .pen`fFyGp`rightGroup:
 * notif 32×32 rounded-8 bg-surface-2
 * userPill rounded-pill bg-surface-2, padding [4,14,4,4], gap 8, 32 avatar
 */
export function UserSection() {
  // 登录与否只看 token(authenticated);user 仅用于展示身份,已登录但 profile 未到时为 null。
  const { authenticated, user } = useAuthStatus();
  const openDialog = useAuthDialog((s) => s.openDialog);
  const navigate = useNavigate();

  return (
    <div className="flex items-center gap-2">
      {/* 限时领取会员推广入口 —— 仅推广开启且非付费会员时显示(组件内部自判),点击弹二维码 */}
      <PromoNavButton />

      {/* 反馈 / 客服入口 —— /feedback 是 public 路由,登录与否都给入口。
          放在通知铃铛左边、用户区最外侧,与通知一组,视觉一致 (rounded-8 + bg-surface-2) */}
      <IconButton
        tooltip="反馈与建议"aria-label="反馈与建议"onClick={() => navigate('/feedback')}
        className="rounded-8 bg-surface-2">
        <Headphones strokeWidth={2} />
      </IconButton>

      {/* 通知按钮仅登录态显示 —— 未登录用户没有站内信概念,
          且 /user/messages 是 protected 接口,挂着也是 401 */}
      {authenticated && <NotificationBell />}

      {!authenticated ? (
        <div className="flex items-center gap-1">
          <Button variant="ghost"size="sm"onClick={() => openDialog('login')}>
            登录
          </Button>
          <Button
            variant="primary"size="sm"onClick={() => openDialog('register')}
          >
            注册
          </Button>
        </div>
      ) : user ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"className={cn('inline-flex items-center gap-2 h-10 pl-1 pr-3.5 rounded-pill bg-surface-2','hover:bg-surface-3 transition-colors','')}
            >
              <Avatar className="h-8 w-8 bg-primary">
                {user.avatar && <AvatarImage src={user.avatar} alt={user.email} />}
                <AvatarFallback className="text-12">
                  {(user.username ?? user.email).slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-12 font-medium text-foreground max-w-28 truncate">
                {user.username ?? maskEmail(user.email)}
              </span>
            </button>
          </DropdownMenuTrigger>
          {/* p-0 让 UserMenuContent 自己控制内部 padding;w-auto 由 content 撑 240 */}
          <DropdownMenuContent align="end"sideOffset={8} className="p-0 w-auto">
            <UserMenuContent />
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        // 已登录但 profile 尚未拉到(token 有效、user 暂为 null)—— 渲染静态身份占位,
        // **绝不**回退成登录/注册按钮(那会让已登录用户看起来"未登录")。profile 一到自动切到上面的 pill。
        <div
          className="inline-flex items-center gap-2 h-10 pl-1 pr-3.5 rounded-pill bg-surface-2"aria-label="账户加载中">
          <Avatar className="h-8 w-8 bg-primary">
            <AvatarFallback className="text-12">·</AvatarFallback>
          </Avatar>
          <span className="text-12 font-medium text-faint">我的账户</span>
        </div>
      )}
    </div>
  );
}

function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  if (!name || !domain) return email;
  const visible = name.slice(0, Math.max(1, Math.min(2, name.length - 1)));
  return`${visible}**`;
}
