import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Info,
  Link2,
  LogOut,
  Shield,
  ShieldCheck,
  Sparkles,
  Gem,
  Crown,
  User as UserIcon,
  type LucideIcon,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/shared/ui/dropdown-menu';
import { http } from '@/shared/lib/http';
import { getAuthToken } from '@/shared/lib/auth-token';
import { useAuthStore, canAccessAdmin } from '@/stores/auth.store';
import { cn } from '@/shared/lib/utils';

// 会员档位展示(与账户资产卡一致):Pro=宝石/琥珀,Max=皇冠/品牌红,Free=免费/绿。
type Tier = 'free' | 'pro' | 'max';
// 会员等级展示名全站统一:Free / Pro / Max。
const TIER_LABEL: Record<Tier, string> = { free: 'Free', pro: 'Pro', max: 'Max' };
const TIER_BADGE_CLS: Record<Tier, string> = {
  free: 'bg-brand-green/12 text-brand-green',
  pro: 'bg-brand-amber/10 text-brand-amber',
  max: 'bg-brand-red/10 text-brand-red',
};
const TIER_BADGE_ICON: Record<Tier, LucideIcon | null> = { free: null, pro: Gem, max: Crown };

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

  const isAdmin = user ? canAccessAdmin(user.role) : false;
  // 会员档位 —— 复用 ['settings','billing'] 缓存(与 QuotaNotifier / 会员页同源,通常已是热的)。
  // shared 不能引 feature API,这里直接打同一个 overview 端点。管理员不展示会员档,故不查。
  // 响应式登录态门控(getAuthToken 非响应式;user 订阅已让本组件跟随登录重渲,但 token 才是请求凭证真源)。
  const authToken = useAuthStore((s) => s.token);
  const { data: billing } = useQuery({
    queryKey: ['settings', 'billing'],
    queryFn: async () => (await http.get<{ data: { tier: string } }>('/user/billing/overview')).data.data,
    enabled: !!authToken && !isAdmin,
    staleTime: 30_000,
  });

  if (!user) return null;

  const initial = (user.username || user.email || '?').slice(0, 1).toUpperCase();
  const displayName = user.username || user.email.split('@')[0] || '用户';
  const tier = (['free', 'pro', 'max'].includes(billing?.tier ?? '') ? billing!.tier : 'free') as Tier;
  const TierIcon = TIER_BADGE_ICON[tier];
  const showUpgrade = !isAdmin && tier !== 'max'; // Free/Pro 显示"升级会员";Max 已顶级不显示

  const handleLogout = () => {
    const token = getAuthToken(); // 先捕获, 再立刻清本地 —— 退出"即时"且不被任何 401 弹框打断
    clearAuth(); // 原子清 token + user + cookie
    qc.clear(); // 清掉所有带登录态的缓存数据
    // 后台吊销服务端 token:显式带上刚捕获的 token(此刻 getAuthToken 已空)。失败无所谓,本地已清。
    if (token) {
      void http
        .post('/user/logout', null, { headers: { Authorization: `Bearer ${token}` } })
        .catch(() => {});
    }
    // 硬跳转回首页(整页刷新):qc.clear 清不掉组件内存态 —— 智能助手/写作等会话的 WS 连接 + 流式
    // 消息存在组件 useState/zustand 里,软导航(navigate)切走旧内容可能残留。整页刷新确保彻底清除。
    window.location.href = '/';
  };

  return (
    <div className="w-60">
      {/* ---------- Header: 大头像 + name + email + 角色徽章(居中,非 menuitem) ---------- */}
      <div className="flex flex-col items-center gap-1 px-4 py-4 select-none">
        <Avatar className="size-[52px] bg-primary mb-1">
          {user.avatar && <AvatarImage src={user.avatar} alt={displayName} />}
          <AvatarFallback className="text-16 font-medium">{initial}</AvatarFallback>
        </Avatar>
        <span className="text-16 font-medium text-foreground">{displayName}</span>
        <span className="text-12 text-faint">{user.email}</span>
        {isAdmin ? (
          <span className="mt-1 inline-flex items-center rounded-pill bg-danger-soft px-2.5 py-0.5 text-12 font-medium text-brand-red">
            管理员
          </span>
        ) : (
          <span className={cn('mt-1 inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-12 font-medium', TIER_BADGE_CLS[tier])}>
            {TierIcon && <TierIcon className="size-3" />}
            {TIER_LABEL[tier]}
          </span>
        )}
      </div>

      {/* 快捷升级会员(Free/Pro 可见,Max 顶级隐藏)→ 进套餐页选购 */}
      {showUpgrade && (
        <div className="px-3 pb-3">
          <DropdownMenuItem
            className={cn(
              'w-full cursor-pointer justify-center gap-1.5 rounded-8 bg-brand-red px-3 py-2 text-on-brand',
              // DropdownMenuItem 默认 hover/highlight 是 data-[highlighted]:bg-surface-2 + focus:text-foreground,
              // 会盖掉红底→白字浮在浅灰上(washed out)。显式覆盖这两个状态保持红底白字。
              'hover:bg-brand-red/90 focus-visible:bg-brand-red/90 focus:text-on-brand',
              'data-[highlighted]:bg-brand-red/90 data-[highlighted]:text-on-brand',
            )}
            onSelect={() => navigate('/pricing')}
          >
            <Sparkles className="size-3.5" />
            <span className="text-14 font-medium">升级会员</span>
          </DropdownMenuItem>
        </div>
      )}

      <DropdownMenuSeparator />

      {/* ---------- 设置区:直链到 settings 的 4 个真实 tab —— 顺序 / 图标 / 名称都与
           SettingsLayout.tsx 的 TABS 一一对应(profile/membership/security/connections),
           避免下拉菜单与设置页漂移。末尾再补「帮助中心」「管理员后台」两条非设置项。 ---------- */}
      <div className="p-1.5">
        <DropdownMenuItem
          className="cursor-pointer rounded-8 px-3 py-2 gap-2.5"
          onSelect={() => navigate('/settings/profile')}
        >
          <UserIcon className="size-3.5 text-faint" />
          <span className="text-14 text-subtle">个人资料</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer rounded-8 px-3 py-2 gap-2.5"
          onSelect={() => navigate('/settings/membership')}
        >
          <Crown className="size-3.5 text-faint" />
          <span className="text-14 text-subtle">账户资产</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer rounded-8 px-3 py-2 gap-2.5"
          onSelect={() => navigate('/settings/security')}
        >
          <Shield className="size-3.5 text-faint" />
          <span className="text-14 text-subtle">安全设置</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer rounded-8 px-3 py-2 gap-2.5"
          onSelect={() => navigate('/settings/connections')}
        >
          <Link2 className="size-3.5 text-faint" />
          <span className="text-14 text-subtle">已连接账号</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer rounded-8 px-3 py-2 gap-2.5"
          onSelect={() => navigate('/help')}
        >
          <Info className="size-3.5 text-faint" />
          <span className="text-14 text-subtle">帮助中心</span>
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

      {/* ---------- 退出登录(红) ---------- */}
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
