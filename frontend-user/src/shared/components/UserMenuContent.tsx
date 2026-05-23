import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Info,
  Link2,
  LogOut,
  Shield,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/shared/ui/dropdown-menu';
import { http } from '@/shared/lib/http';
import { useAuthStore, isAdminRole } from '@/stores/auth.store';
import { cn } from '@/shared/lib/utils';

/**
 * 用户账号下拉菜单 —— 对照 .pen `g1qah` dropdown。
 *
 * 用法:放在 <DropdownMenu> 任意位置的 <DropdownMenuContent> 内当 children。
 * 两个触发位置(顶栏 user pill / 侧栏底部 user row)共用此 content,
 * 确保 dropdown 内容和交互在任何入口都完全一致。
 *
 * .pen 设计参考:
 *   - 240px 宽 / 12 圆角 / 1px #EEEEEE 边 / shadow 0/8/24 #00000014
 *   - Header 居中:52 圆头像 + name 14/700 + email 11/normal + 角色 badge
 *   - 3 个普通项(icon + label,13/normal #333,行 h~36)
 *   - 红色"退出登录"(#D94F4F)
 *   - admin 角色额外显示 "管理员后台"
 *
 * 选择 `<DropdownMenuItem>` 作为行,Radix 自带键盘 ↑↓ + Enter + Esc。
 */
export function UserMenuContent() {
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clear);
  const navigate = useNavigate();
  const qc = useQueryClient();

  if (!user) return null;

  const initial = (user.username || user.email || '?').slice(0, 1).toUpperCase();
  const displayName = user.username || user.email.split('@')[0] || '用户';
  const isAdmin = isAdminRole(user.role);
  const planLabel = isAdmin ? '管理员' : '普通用户';

  const handleLogout = async () => {
    try {
      await http.post('/user/logout');
    } catch {
      /* noop —— 服务端失败也要清本地,否则卡死 */
    }
    clearAuth();
    qc.clear();
  };

  return (
    <div className="w-60">
      {/* ---------- Header: 大头像 + name + email + 角色徽章(居中,非 menuitem) ---------- */}
      <div className="flex flex-col items-center gap-1 px-4 py-4 select-none">
        <Avatar className="size-[52px] bg-primary mb-1">
          {user.avatar && <AvatarImage src={user.avatar} alt={displayName} />}
          <AvatarFallback className="text-lg font-bold">{initial}</AvatarFallback>
        </Avatar>
        <span className="text-md font-bold text-foreground">{displayName}</span>
        <span className="text-xs text-faint">{user.email}</span>
        <span
          className={cn(
            'inline-flex items-center px-2.5 py-0.5 rounded-pill text-2xs font-bold mt-1',
            isAdmin
              ? 'bg-danger-soft text-brand-red'
              : 'bg-[hsl(var(--brand-green)/0.12)] text-brand-green'
          )}
        >
          {planLabel}
        </span>
      </div>

      <DropdownMenuSeparator />

      {/* ---------- 设置区:直链到 settings 的 3 个真实 tab(profile/security/connections)
           之前用一条"个人设置"(/settings)+ 一条"账户管理"(/account,死链 404)。
           现在拆成三条直链 —— 每个 tab 一键直达,顺手剔掉死链;条目名对齐
           SettingsLayout.tsx 的 tab label,避免名字漂移 ---------- */}
      <div className="p-1.5">
        <DropdownMenuItem
          className="cursor-pointer rounded-md px-3 py-2 gap-2.5"
          onSelect={() => navigate('/settings/profile')}
        >
          <UserIcon className="size-3.5 text-faint" />
          <span className="text-sm text-subtle">个人资料</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer rounded-md px-3 py-2 gap-2.5"
          onSelect={() => navigate('/settings/security')}
        >
          <Shield className="size-3.5 text-faint" />
          <span className="text-sm text-subtle">安全设置</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer rounded-md px-3 py-2 gap-2.5"
          onSelect={() => navigate('/settings/connections')}
        >
          <Link2 className="size-3.5 text-faint" />
          <span className="text-sm text-subtle">已连接账号</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer rounded-md px-3 py-2 gap-2.5"
          onSelect={() => navigate('/help')}
        >
          <Info className="size-3.5 text-faint" />
          <span className="text-sm text-subtle">帮助中心</span>
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem
            className="cursor-pointer rounded-md px-3 py-2 gap-2.5"
            onSelect={() => navigate('/admin')}
          >
            <ShieldCheck className="size-3.5 text-brand-red" />
            <span className="text-sm text-subtle">管理员后台</span>
          </DropdownMenuItem>
        )}
      </div>

      <DropdownMenuSeparator />

      {/* ---------- 退出登录(红) ---------- */}
      <div className="p-1.5">
        <DropdownMenuItem
          className="cursor-pointer rounded-md px-3 py-2 gap-2.5 text-brand-red focus:text-brand-red focus:bg-danger-soft"
          onSelect={handleLogout}
        >
          <LogOut className="size-3.5" />
          <span className="text-sm">退出登录</span>
        </DropdownMenuItem>
      </div>
    </div>
  );
}
