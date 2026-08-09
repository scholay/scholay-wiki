import { useNavigate } from'react-router-dom';
import { useQuery } from'@tanstack/react-query';
import { Headphones } from 'lucide-react';
import { canAccessAdmin, useAuthStatus } from'@/stores/auth.store';
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
  DropdownMenuItem,
  DropdownMenuTrigger,
} from'@/shared/ui/dropdown-menu';
import { IconButton } from'@/shared/components/IconButton';
import { NotificationBell } from'@/shared/components/NotificationBell';
import { InviteNavButton } from '@/shared/components/InviteNavButton';
import { ActivityNavMenu } from './ActivityNavMenu';
import { UserMenuContent } from'@/shared/components/UserMenuContent';
import { http } from'@/shared/lib/http';
import { getAuthToken } from'@/shared/lib/auth-token';
import { resetInfo } from'@/shared/lib/quota-display';
import { cn } from'@/shared/lib/utils';

/**
 * 顶部导航右段:通知 + 用户 pill / 登录注册 CTA。
 *
 * 对照 .pen`fFyGp`rightGroup:
 * notif 32×32 rounded-8 bg-surface-2
 * userPill rounded-pill bg-surface-2, padding [4,14,4,4], gap 8, 32 avatar
 *
 * ── < 1200px 的瘦身(P0-2 配套，见 TopNav.tsx 顶部注释) ─────────────────
 * 促销胶囊(~130px)与反馈按钮(~40px)在窄屏收进 CompactNavMenu ——
 * **不是删掉**，两个去处在汉堡菜单里都在，点击行为完全一致。
 * 用户名(max-w-28 = 112px)在窄屏隐藏，pill 退化成纯头像。
 * 三项合计让出 ~280px，正是 390 宽下「登录/注册被盖到 0% 可见」的缺口来源。
 * 铃铛与登录/注册**任何宽度都保留** —— 未读通知与转化入口不接受降级。
 */
export function UserSection() {
  // 登录与否只看 token(authenticated);user 仅用于展示身份,已登录但 profile 未到时为 null。
  const { authenticated, user } = useAuthStatus();
  const openDialog = useAuthDialog((s) => s.openDialog);
  const navigate = useNavigate();

  return (
    <div className="flex items-center gap-2">
      {/* 限时领取会员推广入口 —— 仅推广开启且非付费会员时显示(组件内部自判),点击弹二维码。
          < 1200 收进 CompactNavMenu(它是右段最宽的一颗,也是 P0 叠印的主要来源) */}
      {/* Pen 独立“邀请有礼”按钮；与右侧的会员限时活动互不收纳。 */}
      <InviteNavButton className="hidden min-[1200px]:inline-flex" />
      <ActivityNavMenu className="hidden min-[1200px]:inline-flex" />

      {/* 反馈 / 客服入口 —— /feedback 是 public 路由,登录与否都给入口。
          放在通知铃铛左边、用户区最外侧,与通知一组,视觉一致 (rounded-8 + bg-surface-2)。
          < 1200 收进 CompactNavMenu */}
      <IconButton
        tooltip="反馈与建议" aria-label="反馈与建议" onClick={() => navigate('/feedback')}
        className="rounded-8 bg-surface-2 hidden min-[1200px]:inline-flex">
        <Headphones strokeWidth={2} />
      </IconButton>

      {/* 通知按钮仅登录态显示 —— 未登录用户没有站内信概念,
          且 /user/messages 是 protected 接口,挂着也是 401 */}
      {authenticated && <NotificationBell />}

      {!authenticated ? (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => openDialog('login')}>
            登录
          </Button>
          <Button
            variant="primary" size="sm" onClick={() => openDialog('register')}
          >
            注册
          </Button>
        </div>
      ) : user ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button" className={cn('inline-flex items-center gap-2 h-10 pl-1 pr-1 min-[1200px]:pr-3.5 rounded-pill bg-surface-2', 'hover:bg-surface-3 transition-colors', '')}
            >
              <Avatar className="h-8 w-8 bg-primary">
                {user.avatar && <AvatarImage src={user.avatar} alt={user.email} />}
                <AvatarFallback className="text-12">
                  {(user.username ?? user.email).slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {/* 窄屏只留头像 —— 用户名占 112px,是右段第三大的宽度项 */}
              <span className="hidden min-[1200px]:inline text-12 font-medium text-foreground max-w-28 truncate">
                {user.username ?? maskEmail(user.email)}
              </span>
            </button>
          </DropdownMenuTrigger>
          {/* p-0 让 UserMenuContent 自己控制内部 padding;w-auto 由 content 撑 240 */}
          <DropdownMenuContent align="end" sideOffset={8} className="p-0 w-auto">
            {/* 常驻额度余量 —— 管理员不查额度(与 UserMenuContent 同款豁免) */}
            {!canAccessAdmin(user.role) && <MenuQuotaSummary />}
            <UserMenuContent />
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        // 已登录但 profile 尚未拉到(token 有效、user 暂为 null)—— 渲染静态身份占位,
        // **绝不**回退成登录/注册按钮(那会让已登录用户看起来"未登录")。profile 一到自动切到上面的 pill。
        <div
          className="inline-flex items-center gap-2 h-10 pl-1 pr-1 min-[1200px]:pr-3.5 rounded-pill bg-surface-2" aria-label="账户加载中">
          <Avatar className="h-8 w-8 bg-primary">
            <AvatarFallback className="text-12">·</AvatarFallback>
          </Avatar>
          <span className="hidden min-[1200px]:inline text-12 font-medium text-faint">我的账户</span>
        </div>
      )}
    </div>
  );
}

// mirrors backend/internal/vip/quota.go Overview.token(P5:percent 是真值,绝对额度已抹除)。
// 只声明本组件消费的字段;端点/queryKey 与 QuotaNotifier 同款(['settings','billing'],通常命中缓存)。
interface QuotaOverviewLite {
  token: {
    percent: number; // 本周期已用百分比(0..100)
    unlimited: boolean;
    window_started_at: string | null;
    window_reset_at: string | null;
    window_days: number;
  };
}

/**
 * 用户下拉里的常驻额度余量 —— 一行:剩余 % 细进度条 + 相对重置时间。
 * percent>=100 转红「额度已用完」;点击进账户资产页。未登录 / 加载中 / 不限额度不渲染。
 * app/layouts 不 import features(方向铁律),与 UserMenuContent 同款 inline useQuery。
 */
function MenuQuotaSummary() {
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ['settings', 'billing'],
    queryFn: async () =>
      (await http.get<{ data: QuotaOverviewLite }>('/user/billing/overview')).data.data,
    enabled: !!getAuthToken(),
    staleTime: 30_000,
  });

  const t = data?.token;
  if (!t || t.unlimited) return null; // 加载中不渲染;不限额度没有「余量」概念

  const used = Math.min(100, Math.max(0, t.percent));
  const remaining = Math.round(100 - used);
  const exhausted = used >= 100;
  const { rel } = resetInfo(t); // 「3 天后重置」「满额」「即将重置」等相对口径

  return (
    <div className="w-60 border-b border-border-hairline p-2">
      <DropdownMenuItem
        className="cursor-pointer rounded-8 px-3 py-2"
        onSelect={() => navigate('/settings/membership')}
      >
        <div className="flex w-full flex-col gap-1">
          <div className="flex items-center justify-between gap-2 text-12">
            <span className={exhausted ? 'font-medium text-brand-red' : 'text-subtle'}>
              {exhausted ? '额度已用完' : `额度剩余 ${remaining}%`}
            </span>
            <span className="shrink-0 text-faint">{rel}</span>
          </div>
          {/* 细进度条:剩余量;动态宽度属「动态计算尺寸」,允许内联 style */}
          <div className="h-1 w-full overflow-hidden rounded-pill bg-surface-2">
            <div
              className={cn('h-full rounded-pill', exhausted ? 'bg-brand-red' : 'bg-brand-green')}
              style={{ width: `${remaining}%` }}
            />
          </div>
        </div>
      </DropdownMenuItem>
    </div>
  );
}

function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  if (!name || !domain) return email;
  const visible = name.slice(0, Math.max(1, Math.min(2, name.length - 1)));
  return`${visible}**`;
}
