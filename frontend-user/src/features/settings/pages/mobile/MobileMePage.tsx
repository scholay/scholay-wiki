import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  BookMarked,
  ChevronRight,
  LayoutDashboard,
  Link2,
  LogOut,
  ReceiptText,
  ShieldCheck,
  UserPen,
  UserPlus,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import { BrandLogo } from '@/shared/components/BrandLogo';
import { http } from '@/shared/lib/http';
import { getAuthToken } from '@/shared/lib/auth-token';
import { useAuthStore, useAuthStatus, canAccessAdmin } from '@/stores/auth.store';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { useProfile } from '@/shared/api/profile';
import { MobileAssetsCard } from '../../components/mobile/MobileAssetsCard';
import { useInviteCampaign } from '@/shared/api/invite-campaign';

/**
 * 移动端「我的」(/m/me):
 *   未登录 → 整页跳 /m/auth(PC AuthDialog 同款组件的整页形态,见 features/auth)
 *   已登录 → 用户卡 + 会员/资产卡(MobileAssetsCard) + 设置菜单 + 退出登录
 * 数据层全部复用 shared/api/profile 与 settings 的 membership hooks。
 */
export function MobileMePage() {
  const { authenticated } = useAuthStatus();

  return (
    <div className="h-full overflow-y-auto bg-surface-1">
      {authenticated ? <LoggedInView /> : <LoggedOutView />}
    </div>
  );
}

/** 未登录态:不再整页跳 /m/auth,改成提示 + 触发全局底部登录弹窗(就地登录)。 */
function LoggedOutView() {
  const openDialog = useAuthDialog((s) => s.openDialog);
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <BrandLogo size="lg" />
      <h1 className="mt-5 text-20 font-medium text-foreground">登录 Scholay</h1>
      <p className="mt-1.5 text-12 leading-paragraph text-muted-foreground">
        登录后查看你的会员、科研经费、文件夹与设置
      </p>
      <div className="mt-7 flex w-full max-w-xs flex-col gap-2.5">
        <Button className="h-12" onClick={() => openDialog('login')}>
          登录
        </Button>
        <Button variant="outline" className="h-12" onClick={() => openDialog('register')}>
          注册新账号
        </Button>
      </div>
    </div>
  );
}

function LoggedInView() {
  const campaignQ = useInviteCampaign();

  const profileQ = useProfile();
  const storedUser = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const qc = useQueryClient();

  // ?upgrade=1 承接(QuotaNotifier 移动分流 navigate('/m/me?upgrade=1')):
  // 自动打开 MobileAssetsCard 的开通会员弹层,并 replace 掉该参数(避免刷新/回退重复弹)。
  // signal 用递增计数:同一会话内第二次带参进来(参数已被清过又加上)仍能重新打开弹层。
  // 刻意放在 LoggedInView:未登录时不消费参数,登录完成挂载本组件时再承接。
  const [searchParams, setSearchParams] = useSearchParams();
  const [membershipSignal, setMembershipSignal] = useState(0);
  useEffect(() => {
    if (searchParams.get('upgrade') !== '1') return;
    setMembershipSignal((n) => n + 1);
    const next = new URLSearchParams(searchParams);
    next.delete('upgrade');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

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
        className="flex items-center gap-3 rounded-16 border border-border bg-surface-card p-4 active:bg-surface-2"
      >
        <Avatar className="size-14 bg-primary">
          {avatar && <AvatarImage src={avatar} alt={displayName} />}
          <AvatarFallback className="text-20 font-medium">{initial}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-16 font-medium text-foreground">{displayName}</p>
          {email && <p className="truncate text-12 text-faint">{email}</p>}
        </div>
        <ChevronRight className="size-4 shrink-0 text-faint" />
      </Link>

      {/* 管理后台入口 —— 仅 admin / super_admin 可见(身份判断走 isAdminRole);/admin 是同 URL 响应式后台,不跳 /m。 */}
      {canAccessAdmin(storedUser?.role) && (
        <nav className="overflow-hidden rounded-16 border border-brand-red/30 bg-surface-card">
          <MenuRow
            to="/admin"
            icon={<LayoutDashboard className="size-4.5 text-brand-red" />}
            label="进入管理后台"
            last
          />
        </nav>
      )}

      {/* 我的文件夹 —— 独立入口卡(收藏/分享/转存) */}
      <nav className="overflow-hidden rounded-16 border border-border bg-surface-card">
        <MenuRow
          to="/m/library"
          icon={<BookMarked className="size-4.5" />}
          label="我的文件夹"
          last
        />
      </nav>

      {/* 会员 / 资产 */}
      <MobileAssetsCard membershipSignal={membershipSignal} />

      {/* 设置菜单 */}
      <nav className="overflow-hidden rounded-16 border border-border bg-surface-card">
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
          last={campaignQ.data?.enabled !== true}
        />
        {campaignQ.data?.enabled === true && (
          <MenuRow
            to="/m/me/invite"
            icon={<UserPlus className="size-4.5" />}
            label="邀请好友"
            badge={
              campaignQ.data.inviter_registration_credits > 0
                ? `邀请有礼 +${campaignQ.data.inviter_registration_credits} 经费`
                : '邀请有礼'
            }
            last
          />
        )}
      </nav>

      <button
        type="button"
        onClick={handleLogout}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-16 border border-border bg-surface-card text-14 text-brand-red active:bg-danger-soft"
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
  badge,
  last,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  /** 行尾角标(如活动开启时的「得经费」),红字弱高亮。 */
  badge?: string;
  last?: boolean;
}) {
  return (
    <Link
      to={to}
      className={`flex h-12 items-center gap-3 px-4 active:bg-surface-2 ${last ? '' : 'border-b border-border-soft'}`}
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="flex-1 text-14 text-foreground">{label}</span>
      {badge && <span className="shrink-0 rounded-pill bg-brand-red/10 px-2 py-0.5 text-12 text-brand-red">{badge}</span>}
      <ChevronRight className="size-4 text-faint" />
    </Link>
  );
}
