import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { LogOut, ShieldCheck, User as UserIcon } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/shared/ui/dropdown-menu';
import { http } from '@/shared/lib/http';
import { getAuthToken } from '@/shared/lib/auth-token';
import { isPhoneDevice } from '@/shared/lib/device';
import { useAuthStore, canAccessAdmin } from '@/stores/auth.store';

/**
 * 用户账号下拉菜单 —— 顶栏 pill / 侧栏底部共用。
 * 导航只留「个人中心」(+ 管理员后台);其余设置项进个人中心后再走。
 */
export function UserMenuContent() {
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clear);
  const navigate = useNavigate();
  const qc = useQueryClient();

  if (!user) return null;

  const isAdmin = canAccessAdmin(user.role);
  const initial = (user.username || user.email || '?').slice(0, 1).toUpperCase();
  const displayName = user.username || user.email.split('@')[0] || '用户';

  const handleLogout = () => {
    const token = getAuthToken();
    clearAuth();
    qc.clear();
    if (token) {
      void http
        .post('/user/logout', null, { headers: { Authorization: `Bearer ${token}` } })
        .catch(() => {});
    }
    window.location.href = '/';
  };

  return (
    <div className="w-60">
      <div className="flex flex-col items-center gap-1 px-4 py-4 select-none">
        <Avatar className="size-[52px] bg-primary mb-1">
          {user.avatar && <AvatarImage src={user.avatar} alt={displayName} />}
          <AvatarFallback className="text-16 font-medium">{initial}</AvatarFallback>
        </Avatar>
        <span className="text-16 font-medium text-foreground">{displayName}</span>
        <span className="text-12 text-faint">{user.email}</span>
        {isAdmin ? (
          <span className="mt-1 inline-flex items-center rounded-pill bg-danger-soft px-2.5 py-1 text-12 font-medium text-brand-red">
            管理员
          </span>
        ) : null}
      </div>

      <DropdownMenuSeparator />

      <div className="p-1.5">
        <DropdownMenuItem
          className="cursor-pointer rounded-8 px-3 py-2 gap-2.5"
          onSelect={() => navigate(isPhoneDevice() ? '/m/me' : '/settings')}
        >
          <UserIcon className="size-3.5 text-faint" />
          <span className="text-14 text-subtle">个人中心</span>
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem
            className="cursor-pointer rounded-8 px-3 py-2 gap-2.5"
            onSelect={() => navigate('/admin')}
          >
            <ShieldCheck className="size-3.5 text-brand-red" />
            <span className="text-14 text-subtle">管理员后台</span>
          </DropdownMenuItem>
        )}
      </div>

      <DropdownMenuSeparator />

      <div className="p-1.5">
        <DropdownMenuItem
          className="cursor-pointer rounded-8 px-3 py-2 gap-2.5 text-brand-red focus:text-brand-red focus-visible:bg-danger-soft"
          onSelect={handleLogout}
        >
          <LogOut className="size-3.5" />
          <span className="text-14">退出登录</span>
        </DropdownMenuItem>
      </div>
    </div>
  );
}
