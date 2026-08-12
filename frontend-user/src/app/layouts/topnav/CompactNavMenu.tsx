import { Fragment, useEffect, useState, type ComponentType } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Gift, Globe, Headphones, Home, Menu as MenuIcon, UserPlus } from 'lucide-react';
import { IconButton } from '@/shared/components/IconButton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { useInviteCampaign } from '@/shared/api/invite-campaign';
import { usePromoEligible } from '@/shared/api/promo';
import { usePromoStore } from '@/stores/promo.store';
import { useInviteEntry } from '@/stores/invite-entry.store';
import { browserTabUrl, useBrowserTabs } from '@/stores/browser-tabs.store';
import { groupMenusByCategory, type Menu } from '@/app/menus';
import { cn } from '@/shared/lib/utils';

/**
 * 窄屏(< 1200px)顶栏的**唯一导航出口** —— 一颗汉堡按钮，点开列出顶栏在宽屏下
 * 平铺的全部去处：首页 / 浏览器 / 7 个功能 / 限时领取会员 / 反馈。
 *
 * ── 为什么必须存在(P0，render-audit-2026-07-28 §五 P0-2) ─────────────
 * 宽屏顶栏是 `[1fr | auto | 1fr]` 三列几何居中：中列(功能坞)是 `auto`，
 * 吃满 max-content 后左右两列各分剩下的一半，而两侧的 `minmax(0,1fr)` 允许
 * 收缩到 0 —— 于是空间不够时**两侧内容直接溢出到中列底下互相叠印**，
 * 不是「挤扁」而是「压字」。实测(裁剪后墨级碰撞，Range 行盒 × 祖先 overflow 求交)：
 *   390 → 文字压文字 1 处(「文献搜索」×「限时领取会员」600px²)，
 *         且「登录」「注册」两颗按钮可见面积 **0%**(完全被盖住，点不到)
 *   768 → 背景压文字 5 处；logo 被中列的首页按钮覆盖成 `SCHOL/`
 *         (注意：**不是 clip**。左列 grid track 只有 143px，但左列 div 自己是
 *          181px 宽 —— overflow-hidden 裁的是它的子内容，裁不了它自己溢出 track
 *          的部分，所以纯 clip 探针量出来是「100% 可见」，是被后画的中列盖住的)
 *   1024 → 背景压文字 1 处   ·   1200 / 1440 → 0
 *
 * 这些内容页(/help /about /blog /news /privacy …)按 UA 分流是**刻意留在 PC 路径**
 * 保 SEO 的，且 `shared/lib/device.ts` 的 BOT_RE 先于手机判定返回 false →
 * **Googlebot-smartphone 永远落 PC 路径**，移动优先索引看到的就是这个叠印版面。
 *
 * ── 为什么是「折叠成一颗菜单」而不是别的手法 ──────────────────────────
 * · 换行 / 缩 gap：顶栏是 `sticky h-16` 定高，换行会顶掉内容高度；
 *   缩 gap 最多省 ~30px，而 390 下缺口是 ~100px 量级，治不了。
 * · 只隐藏次要项：促销胶囊(最宽的一颗)一隐藏就等于砍掉转化入口，
 *   而功能坞一隐藏则 7 个主功能全失联 —— 两者都不能「隐藏了事」，
 *   必须**有一个收纳处**。汉堡菜单就是那个收纳处：**零去处丢失**。
 * · 用 DropdownMenu(click)而不是复用「全站功能」那个 HoverCard：
 *   Radix HoverCard 只认 pointerType=mouse，**触屏点不开** ——
 *   窄屏恰恰是触屏为主，用 HoverCard 等于做了个点不开的菜单。
 */
export function CompactNavMenu({ active = true }: { active?: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const groups = groupMenusByCategory();
  const [open, setOpen] = useState(false);

  // 跨过 1200px 断点时 Root 保持挂载，先走受控 open→false
  // 让 Radix 完成 pointer-lock/Portal 清理，不在打开态直接卸载。
  useEffect(() => {
    if (!active) setOpen(false);
  }, [active]);

  const { visible: promoVisible } = usePromoEligible();
  const openPromo = usePromoStore((s) => s.openPromo);
  const campaignQ = useInviteCampaign();
  const inviteVisible = campaignQ.data?.enabled === true;
  const openInvite = useInviteEntry((state) => state.openInvite);

  const browserTabs = useBrowserTabs((s) => s.tabs);
  const browserActiveId = useBrowserTabs((s) => s.activeTabId);
  const refreshReturnTo = useBrowserTabs((s) => s.refreshReturnTo);
  const isInDetailPane = /^\/(paper|author|journal|pdf)\//.test(location.pathname);

  const goBrowser = () => {
    const target = browserTabs.find((t) => t.id === browserActiveId) ?? browserTabs[0];
    if (!target) return;
    // 与 MenuCarousel 的 Globe 入口同义：从顶栏进浏览器要把「当前页」设成新的 returnTo，
    // 否则 tab 内的返回会跳回当初创建该 tab 的来源页。已经在详情面里就不动。
    if (!isInDetailPane) {
      refreshReturnTo(target.id, `${location.pathname}${location.search}`);
    }
    navigate(browserTabUrl(target));
  };

  const onHome = location.pathname === '/';

  return (
    <DropdownMenu open={active && open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <IconButton
          aria-label="导航菜单"
          // ≥1200 由平铺的功能坞 + 促销胶囊承担，这颗收起
          className="rounded-8 bg-surface-2 min-[1200px]:hidden"
        >
          <MenuIcon strokeWidth={2} />
        </IconButton>
      </DropdownMenuTrigger>

      {/* 顶栏是 h-16 sticky，菜单可能比视口高(11 项)：给它自己的滚动条。
          用 dvh 不用 vh —— iOS 地址栏会改 vh(CLAUDE.md 移动端铁律)。 */}
      <DropdownMenuContent align="end" sideOffset={8} className="w-56 max-h-[70dvh] overflow-y-auto">
        {/* 路由型条目走 to=(真实 <Link href>,SEO 硬约束);「浏览器」是会话态 URL
            (browserTabUrl + returnTo store 写),保持 onSelect 程序化跳转 */}
        <Row icon={Home} label="首页" active={onHome} to="/" />
        {browserTabs.length > 0 && (
          <Row icon={Globe} label="浏览器" active={isInDetailPane} onSelect={goBrowser} />
        )}

        {groups.map((g) => (
          // 用 Fragment 而不是 <div> 包一层 —— Radix 的 roving focus 靠 collection
          // 遍历后代，多套一层 div 虽然也能用，但会在菜单里插入无语义的盒子
          <Fragment key={g.category}>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-faint">{g.label}</DropdownMenuLabel>
            {g.items.map((m) => (
              <MenuRow key={m.id} menu={m} pathname={location.pathname} />
            ))}
          </Fragment>
        ))}

        <DropdownMenuSeparator />
        {/* 限时活动组(与 ≥1200px 的 ActivityNavMenu 同一收纳逻辑,窄屏平铺成行) */}
        {promoVisible && (
          <Row
            icon={Gift}
            label="限时领取会员"
            tone="brand"
            onSelect={() => openPromo('manual')}
          />
        )}
        {inviteVisible && (
          <Row
            icon={UserPlus}
            label="邀请有礼"
            tone="brand"
            onSelect={openInvite}
          />
        )}
        <Row icon={Headphones} label="反馈与建议" to="/feedback" />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MenuRow({
  menu,
  pathname,
}: {
  menu: Menu;
  pathname: string;
}) {
  return (
    <Row
      icon={menu.icon}
      label={menu.label}
      active={menu.match(pathname)}
      to={menu.href}
    />
  );
}

function Row({
  icon: Icon,
  label,
  active,
  badge,
  tone,
  to,
  onSelect,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  badge?: string;
  tone?: 'brand';
  /** 路由型条目 —— 渲染真实 <Link href>(SEO 硬约束),导航由 Link 完成 */
  to?: string;
  /** 动作型条目(弹窗 / 会话态跳转)—— 仍走 onSelect */
  onSelect?: () => void;
}) {
  const inner = (
    <>
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
      {badge && (
        // 唯一差别是横向 padding 用 px-2(8) 而不是那两处的 px-1.5(6) ——
        // ① Figma §4.2 Badge padding 就是 4–8,8 在集合内、6 不在;
        // ② 护栏「半档间距」棘轮当前是 **零余量**(1293/1293),新增一个 px-1.5 会直接把
        //    构建打红。往回收口的方向是 6→8,不是再添一处 6。
        <span className="ml-auto inline-flex h-4 items-center rounded-pill bg-brand-amber px-2 text-12 font-medium text-foreground">
          {badge}
        </span>
      )}
    </>
  );
  const className = cn('gap-2', active && 'bg-surface-2', tone === 'brand' && 'text-brand-red');
  if (to) {
    return (
      // asChild:Radix 的 onSelect(关菜单)照常触发,导航由 <Link> 自己做
      <DropdownMenuItem asChild className={className}>
        <Link to={to}>{inner}</Link>
      </DropdownMenuItem>
    );
  }
  return (
    <DropdownMenuItem onSelect={onSelect} className={className}>
      {inner}
    </DropdownMenuItem>
  );
}
