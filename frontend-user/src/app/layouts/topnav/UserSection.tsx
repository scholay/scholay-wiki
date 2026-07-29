import { useNavigate } from 'react-router-dom';
import { Headphones } from 'lucide-react';
import { useAuthStatus } from '@/stores/auth.store';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { Button } from '@/shared/ui/button';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/shared/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { IconButton } from '@/shared/components/IconButton';
import { NotificationBell } from '@/shared/components/NotificationBell';
import { RhinoDockChip } from '@/shared/components/RhinoDockChip';
import { PromoNavButton } from './PromoNavButton';
import { ThemeToggle } from './ThemeToggle';
import { UserMenuContent } from '@/shared/components/UserMenuContent';
import { useRhinoAssistant } from '@/stores/rhino-assistant.store';
import { cn } from '@/shared/lib/utils';

/**
 * 顶部导航右段:通知 + 用户头像 / 登录注册 CTA + 日夜间切换。
 *
 * 反馈 / 通知：小犀牛收纳时留在顶栏；放出后改挂在犀牛 hover 工具栏。
 */
export function UserSection() {
  // 登录与否只看 token(authenticated);user 仅用于展示身份,已登录但 profile 未到时为 null。
  const { authenticated, user } = useAuthStatus();
  const openDialog = useAuthDialog((s) => s.openDialog);
  const navigate = useNavigate();
  const rhinoHidden = useRhinoAssistant((s) => s.hidden);

  return (
    <div className="flex items-center gap-2">
      {/* 限时领取会员推广入口 —— 仅推广开启且非付费会员时显示(组件内部自判),点击弹二维码 */}
      <PromoNavButton />

      {/* 犀牛收纳：反馈 / 通知留在顶栏；放出后改走犀牛工具栏 → 对话框内页 */}
      {rhinoHidden && (
        <>
          <IconButton
            tooltip="反馈与建议"
            aria-label="反馈与建议"
            onClick={() => navigate('/feedback')}
            className="rounded-lg bg-surface-2"
          >
            <Headphones strokeWidth={2} />
          </IconButton>
          {authenticated && <NotificationBell />}
        </>
      )}

      {/* 小犀牛收纳后停在头像旁，点击放出 */}
      <RhinoDockChip />

      {!authenticated ? (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => openDialog('login')}>
            登录
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => openDialog('register')}
          >
            注册
          </Button>
        </div>
      ) : user ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={user.username ?? user.email}
              title={user.username ?? user.email}
              className={cn(
                'inline-flex size-9 items-center justify-center rounded-pill',
                'transition-opacity hover:opacity-90',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
              )}
            >
              <Avatar className="size-9 bg-primary">
                {user.avatar && (
                  <AvatarImage src={user.avatar} alt={user.email} />
                )}
                <AvatarFallback className="text-xs">
                  {(user.username ?? user.email).slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          {/* p-0 让 UserMenuContent 自己控制内部 padding;w-auto 由 content 撑 240 */}
          <DropdownMenuContent align="end" sideOffset={8} className="p-0 w-auto">
            <UserMenuContent />
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        // 已登录但 profile 尚未拉到(token 有效、user 暂为 null)—— 渲染静态身份占位,
        // **绝不**回退成登录/注册按钮(那会让已登录用户看起来"未登录")。
        <div className="inline-flex size-9 items-center justify-center" aria-label="账户加载中">
          <Avatar className="size-9 bg-primary">
            <AvatarFallback className="text-xs">·</AvatarFallback>
          </Avatar>
        </div>
      )}

      <ThemeToggle />
    </div>
  );
}
