import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ExternalLink,
  Gauge,
  Info,
  Link2,
  LogOut,
  Shield,
  ShieldCheck,
  Gem,
  Crown,
  User as UserIcon,
  type LucideIcon,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/shared/ui/dropdown-menu';
import { http } from '@/shared/lib/http';
import { getAuthToken } from '@/shared/lib/auth-token';
import { isPhoneDevice } from '@/shared/lib/device';
import { formatResetAt } from '@/shared/lib/quota-display';
import { quotaNavigate } from '@/shared/lib/quota-events';
import { useAuthStore, canAccessAdmin } from '@/stores/auth.store';
import { useQuotaStore } from '@/stores/quota.store';
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

/** /user/billing/overview 的**本菜单消费子集**。
 *  mirrors backend/internal/vip/quota.go Overview(P5:percent 是真值,绝对额度已抹除)。
 *  与 QuotaNotifier / 会员页共用 queryKey ['settings','billing'],通常直接命中缓存、零请求。 */
interface BillingLite {
  tier: string;
  token: {
    percent: number; // 已用百分比(0..100)
    unlimited: boolean;
    window_reset_at: string | null;
  };
}

/**
 * 「剩余用量」可展开项 —— 收起态一行给出剩余百分比,展开后出进度条、恢复时刻与明细入口。
 *
 * 🔴 `onSelect` 必须 preventDefault:Radix 的 DropdownMenuItem 默认选中即关菜单,
 * 不拦的话点一下菜单就没了,永远看不到展开态。展开面板本身**不是** menuitem
 * (它不可选、只承载信息),所以放在项外面,键盘导航不会停在上面。
 */
function MenuUsageItem({ token }: { token?: BillingLite['token'] }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  // 加载中 / 不限额度不渲染:后者没有「余量」概念,画一条 100% 的条只会误导。
  if (!token || token.unlimited) return null;

  const used = Math.min(100, Math.max(0, token.percent));
  const remaining = Math.round(100 - used);
  const exhausted = used >= 100;
  const resetAt = formatResetAt(token.window_reset_at);

  return (
    <div className="p-1.5">
      <DropdownMenuItem
        // 展开而不是导航 —— 见上方红字
        onSelect={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="cursor-pointer gap-2.5 rounded-8 px-3 py-2"
      >
        <Gauge className={cn('size-3.5', exhausted ? 'text-brand-red' : 'text-faint')} />
        <span className="text-14 text-subtle">剩余用量</span>
        <span
          className={cn(
            'ml-auto text-12 tabular-nums',
            exhausted ? 'font-medium text-brand-red' : 'text-faint',
          )}
        >
          {remaining}%
        </span>
        <ChevronDown
          className={cn('size-3.5 shrink-0 text-faint transition-transform', open && 'rotate-180')}
        />
      </DropdownMenuItem>

      {open && (
        <div className="px-3 pb-1 pt-2">
          {/* 细进度条:剩余量。动态宽度属「动态计算尺寸」,允许内联 style */}
          <div className="h-1 w-full overflow-hidden rounded-pill bg-surface-2">
            <div
              className={cn('h-full rounded-pill', exhausted ? 'bg-brand-red' : 'bg-brand-green')}
              style={{ width: `${remaining}%` }}
            />
          </div>
          <p className="mt-2 text-12 text-faint">
            {resetAt ? `${resetAt} 恢复满额` : '额度恢复后可继续使用'}
          </p>
          {/* 同上:走 Item 才会在导航前关掉菜单,否则跳过去菜单还浮在新页面上 */}
          <DropdownMenuItem
            onSelect={() => navigate('/settings/membership')}
            className="mt-2 cursor-pointer gap-1 rounded-4 px-0 py-0 text-12 text-subtle data-[highlighted]:bg-transparent data-[highlighted]:text-foreground"
          >
            查看明细
            <ExternalLink className="size-3" />
          </DropdownMenuItem>
        </div>
      )}
    </div>
  );
}

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
 *
 * ── 2026-08-13 改版(对齐大厂账号菜单的交互)────────────────────────────────
 * ① **升级 CTA 从整宽大按钮改成跟在档位徽章旁的小控件**,并按档位分化:
 *      free → 实心小按钮「开通会员」;pro → 下划线文案「升级」;max → 不出现。
 *    大按钮在账号菜单里是最重的一块,但它既不是这个菜单的主任务(导航才是),
 *    又对 Max 用户永远无效 —— 缩到徽章旁既保住入口,又把重量还给下面的导航项。
 * ② **点击一律开全局购买弹窗**(useQuotaStore.openSubscribe),不再跳 /pricing:
 *    菜单里的升级意图是「我现在就要买」,跳到介绍页等于把用户从结账台推回货架。
 *    弹窗的 mode / 可选组合由 QuotaNotifier 按当前档位推导(free=subscribe、pro=upgrade)。
 * ③ **额度从常驻两行改成可展开菜单项**(参照 Claude 账号菜单的「剩余用量」):
 *    收起态只占一行给出剩余百分比,展开才出进度条、恢复时刻与明细入口。
 *    该项此前挂在 UserSection 里(仅顶栏有),移进本组件后侧栏入口也一并拥有 —— 修掉旧的不一致。
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
    queryFn: async () =>
      (await http.get<{ data: BillingLite }>('/user/billing/overview')).data.data,
    enabled: !!authToken && !isAdmin,
    staleTime: 30_000,
  });

  if (!user) return null;

  const initial = (user.username || user.email || '?').slice(0, 1).toUpperCase();
  const displayName = user.username || user.email.split('@')[0] || '用户';
  const tier = (['free', 'pro', 'max'].includes(billing?.tier ?? '') ? billing!.tier : 'free') as Tier;
  const TierIcon = TIER_BADGE_ICON[tier];

  /** 开通 / 升级 —— 一律拉全局购买弹窗,不跳 /pricing(见文件头 ②)。
   *  弹窗常驻挂在 providers 层的 QuotaNotifier 里,由 quota.store 的 subscribeOpen 控制;
   *  它会按当前档位自己推导 mode(free=subscribe / pro=upgrade)与合法组合。
   *  手机 UA 没有这个弹窗(移动端走 /m/me 的会员区),按全站既有分流处理。 */
  const openPurchase = () => {
    if (isPhoneDevice()) quotaNavigate('/m/me?upgrade=1');
    else useQuotaStore.getState().openSubscribe();
  };

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
        {/* 档位徽章 + 分档 CTA 同行 —— CTA「跟在套餐位置」,不再是下面那块整宽大按钮。
            free 实心小按钮 / pro 下划线文案 / max 不出现(见文件头 ①②)。 */}
        <div className="mt-1 flex items-center gap-2">
          {isAdmin ? (
            <span className="inline-flex items-center rounded-pill bg-danger-soft px-2.5 py-1 text-12 font-medium text-brand-red">
              管理员
            </span>
          ) : (
            <>
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-12 font-medium',
                  TIER_BADGE_CLS[tier],
                )}
              >
                {TierIcon && <TierIcon className="size-3" />}
                {TIER_LABEL[tier]}
              </span>
              {/* 🔴 CTA 必须是 DropdownMenuItem 而不是裸 <button>:
                  下拉是 z-popover(70)、购买弹窗是 z-modal(60) —— 裸 button 点完菜单不关,
                  会整块浮在弹窗**上面**。Radix 的 Item 选中即关,顺序正好是「先关菜单再开弹窗」。
                  代价是要覆盖 Item 的基线样式(px-2 py-1.5 / highlight 底色),下面逐条写明。 */}
              {tier === 'free' && (
                // h-control-xs = 24px(设计系统控件阶梯最小档)。实心小按钮:free 用户的
                // 首要动作是「开通」,给它唯一的填充度。
                // 覆盖 highlight:Item 默认 data-[highlighted]:bg-surface-2 会把红底冲成浅灰。
                <DropdownMenuItem
                  onSelect={openPurchase}
                  className={cn(
                    'h-control-xs shrink-0 cursor-pointer justify-center rounded-pill bg-brand-red px-2.5 py-0 text-12 font-medium text-on-brand',
                    'focus:text-on-brand focus-visible:bg-brand-red/90',
                    'data-[highlighted]:bg-brand-red/90 data-[highlighted]:text-on-brand',
                  )}
                >
                  开通会员
                </DropdownMenuItem>
              )}
              {tier === 'pro' && (
                // pro 已付费,升级是可选动作而非号召 —— 降级成下划线文案,
                // 不与旁边的档位徽章抢视觉重量。清掉 Item 的内边距,让它读起来就是一段文字。
                <DropdownMenuItem
                  onSelect={openPurchase}
                  className={cn(
                    'shrink-0 cursor-pointer rounded-4 px-0 py-0 text-12 font-medium text-brand-red underline underline-offset-2',
                    'focus:text-brand-red data-[highlighted]:bg-transparent data-[highlighted]:no-underline',
                  )}
                >
                  升级
                </DropdownMenuItem>
              )}
              {/* max 顶档:不出现任何 CTA */}
            </>
          )}
        </div>
      </div>

      <DropdownMenuSeparator />

      {/* 剩余用量 —— 可展开菜单项(管理员豁免:不查也不显示额度) */}
      {!isAdmin && <MenuUsageItem token={billing?.token} />}

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
