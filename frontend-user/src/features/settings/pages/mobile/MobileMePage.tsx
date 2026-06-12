import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  ChevronRight,
  Link2,
  LogOut,
  ReceiptText,
  ShieldCheck,
  UserPen,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';
import { http } from '@/shared/lib/http';
import { getAuthToken } from '@/shared/lib/auth-token';
import { useAuthStore, useAuthStatus } from '@/stores/auth.store';
import { useProfile } from '@/shared/api/profile';
import { MobileAssetsCard } from '../../components/mobile/MobileAssetsCard';

/**
 * 移动端「我的」(/m/me):
 *   未登录 → 整页跳 /m/auth(PC AuthDialog 同款组件的整页形态,见 features/auth)
 *   已登录 → 用户卡 + 会员/资产卡(MobileAssetsCard) + 设置菜单 + 退出登录
 * 数据层全部复用 shared/api/profile 与 settings 的 membership hooks。
 */
export function MobileMePage() {
  const { authenticated } = useAuthStatus();

  if (!authenticated) return <Navigate to="/m/auth" replace />;

  return (
    <div className="h-full overflow-y-auto bg-surface-1">
      <LoggedInView />
    </div>
  );
}

function LoggedInView() {
  const profileQ = useProfile();
  const storedUser = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const profile = profileQ.data;
  const displayName =
    profile?.username || storedUser?.username || profile?.email || storedUser?.email || '用户';
  const email = profile?.email ?? storedUser?.email ?? '';
  const avatar = profile?.avatar_url ?? storedUser?.avatar ?? undefined;
  const initial = displayName.trim().charAt(0).toUpperCase();

  // 与桌面 UserMenuContent.handleLogout 同一套原子流程;
  // 差异:移动端退出后回 /m/feed(留在移动版),不回桌面首页。
  const handleLogout = () => {
    const token = getAuthToken();
    useAuthStore.getState().clear();
    qc.clear();
    void navigate('/m/feed');
    if (token) {
      void http
        .post('/user/logout', null, { headers: { Authorization: `Bearer ${token}` } })
        .catch(() => {});
    }
  };

  return (
    <div className="space-y-3 p-3">
      {/* 用户卡 */}
      <Link
        to="/m/me/profile"
        className="flex items-center gap-3 rounded-lg border border-border bg-background p-4 active:bg-surface-2"
      >
        <Avatar className="size-14 bg-primary">
          {avatar && <AvatarImage src={avatar} alt={displayName} />}
          <AvatarFallback className="text-lg font-bold">{initial}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold text-foreground">{displayName}</p>
          {email && <p className="truncate text-xs text-faint">{email}</p>}
        </div>
        <ChevronRight className="size-4 shrink-0 text-faint" />
      </Link>

      {/* 会员 / 资产 */}
      <MobileAssetsCard />

      {/* 设置菜单 */}
      <nav className="overflow-hidden rounded-lg border border-border bg-background">
        <MenuRow to="/m/me/profile" icon={<UserPen className="size-4.5" />} label="个人资料" />
        <MenuRow
          to="/m/me/security"
          icon={<ShieldCheck className="size-4.5" />}
          label="安全设置"
        />
        <MenuRow
          to="/m/me/connections"
          icon={<Link2 className="size-4.5" />}
          label="已连接账号"
        />
        <MenuRow
          to="/m/me/billing"
          icon={<ReceiptText className="size-4.5" />}
          label="资产明细"
          last
        />
      </nav>

      <button
        type="button"
        onClick={handleLogout}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-background text-md text-brand-red active:bg-danger-soft"
      >
        <LogOut className="size-4" />
        退出登录
      </button>
    </div>
  );
}

function MenuRow({
  to,
  icon,
  label,
  last,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  last?: boolean;
}) {
  return (
    <Link
      to={to}
      className={`flex h-12 items-center gap-3 px-4 active:bg-surface-2 ${last ? '' : 'border-b border-border-soft'}`}
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="flex-1 text-md text-foreground">{label}</span>
      <ChevronRight className="size-4 text-faint" />
    </Link>
  );
}
