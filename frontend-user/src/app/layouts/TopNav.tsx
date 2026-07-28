import { BrandSection } from './topnav/BrandSection';
import { RailLinks } from './topnav/RailLinks';
import { MenuCarousel } from './topnav/MenuCarousel';
import { CompactNavMenu } from './topnav/CompactNavMenu';
import { UserSection } from './topnav/UserSection';
import { useSidebar } from '@/stores/sidebar.store';

/**
 * 顶部导航 —— **两种形态**，阈值 1200px。
 *
 * ── ≥ 1200px：三段式 grid，Carousel **几何居中**(不被左侧 Rail 挤压) ────────
 *
 *   ┌──────────────────────────────────────────────────────────────────────────┐
 *   │ [☰] [Logo]  [Rail chips→ overflow scroll] │ [坞] [全站功能] │ [促销][反馈][Bell][User] │
 *   │ ←──── Left col (1fr, min-w-0) ────→       ←─ Center col (auto) ─→   ←─Right col 1fr─→
 *   └──────────────────────────────────────────────────────────────────────────┘
 *
 *   布局原理(关键!):
 *    - CSS Grid `[minmax(0,1fr) auto minmax(0,1fr)]`,左右两列等分剩余空间,
 *      中间列 auto width = 内容宽度自适应。这样 carousel 永远停在视口几何中心。
 *    - Left col 加 `min-w-0` + 内部 Rail 走 `overflow-x-auto`,
 *      rail 多到挤不下 → 在自己列里横滚,不会推动 center 偏移。
 *    - Carousel viewport 用响应式 max-w:窄屏 320px / 宽屏 460px。
 *
 * ── < 1200px：单行 flex，中列整体收进汉堡菜单(CompactNavMenu) ──────────────
 *
 *   ┌──────────────────────────────────────┐
 *   │ [☰] [Logo]        …spacer…   [≡][Bell][User] │
 *   └──────────────────────────────────────┘
 *
 * 🔴 **为什么必须分形态(P0，render-audit-2026-07-28 §五 P0-2)**
 * 上面那个 grid 的两侧是 `minmax(0,1fr)` —— **下界是 0**。空间不够时侧列不会
 * 「把内容挤扁」，而是让内容**溢出到中列底下叠印**(侧列 div 自身按 fit-content
 * 取到 max-content 宽度，`overflow-hidden` 裁的是它的子内容、裁不了它自己溢出
 * grid track 的那截，所以它会一路画到中列身上)。裁剪后墨级碰撞实测：
 *   390 → 文字压文字 1 处、且「登录」「注册」可见面积 **0%**(完全被盖住，点不到)
 *   768 → 背景压文字 5 处、logo 被中列首页按钮盖成 `SCHOL/`
 *   1024 → 1 处   ·   **1200 / 1440 → 0**
 * 阈值取 1200 而不是 Tailwind 的 `lg`(1024)，是因为 1200 才是实测的
 * 「几何干净下界」(1024 只是「目视干净」——文字压文字为 0，但背景仍压着促销文案)。
 * 这也正好让 **≥1200 的桌面观感一像素不动**：所有响应式类都写成 `min-[1200px]:`，
 * 在 1200 以上分支里与改造前的类名逐字相同。
 *
 * 放大器：`/help` `/about` `/blog` `/news` `/privacy` 等内容页按 UA 分流是
 * **刻意留在 PC 路径**保 SEO 的，且 `shared/lib/device.ts` 的 BOT_RE 先于手机判定
 * 返回 false → Googlebot-smartphone 永远落 PC 路径，移动优先索引看到的就是这个版面。
 */
export function TopNav() {
  const { rail, expanded, hasPanel, toggle } = useSidebar();
  const showRail = !expanded && rail.length > 0;

  return (
    <header
      className="
        h-16 flex items-center gap-2 px-3 border-b border-border bg-background sticky top-0 z-nav
        min-[1200px]:grid min-[1200px]:gap-3 min-[1200px]:px-6
        min-[1200px]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]
      "
    >
      {/* Left col —— Brand + Rail(rail 内部自行 overflow scroll)。
          `flex-1` 只在窄屏的 flex 形态下生效(grid item 不认 flex 属性)，
          用它把右侧那组顶到行尾，省掉一个只为占位存在的 spacer 节点。 */}
      <div className="min-w-0 flex flex-1 items-center gap-2 justify-self-start overflow-hidden">
        <BrandSection onToggleSidebar={toggle} canToggle={hasPanel} />
        {showRail && (
          // Rail 是「当前页 sidebar 的收起态入口」，窄屏没有可用的 sidebar 版面，
          // 且它是仅次于坞的宽度大户 —— 一并收起。
          <div className="hidden min-w-0 items-center gap-2 min-[1200px]:flex">
            {/* 组间竖线走 `bg-divider`(globals.css 原文:「Nav/Toolbar 内组间竖线(h-5 w-px)」),
                与 MenuCarousel / BrowserTabsBar 的同类竖线统一 */}
            <span aria-hidden className="h-5 w-px bg-divider shrink-0" />
            <RailLinks />
          </div>
        )}
      </div>

      {/* Center col —— Carousel,auto width,几何居中。
          窄屏整段 display:none —— 里面的 MenuDock 有 rAF 主循环，
          `hidden` 会让 viewport clientWidth = 0，主循环 early-return，不空转。 */}
      <div className="hidden items-center justify-self-center min-[1200px]:flex">
        <MenuCarousel />
      </div>

      {/* Right col —— 窄屏的汉堡菜单 + User actions。
          `shrink-0`:右侧是「登录/注册」「头像」这类不可截断的元素，
          宁可让左侧 flex-1 的 brand 区让位，也不能把它压没(改造前它被压到 0%)。 */}
      <div className="flex min-w-0 shrink-0 items-center gap-2 justify-self-end overflow-hidden">
        <CompactNavMenu />
        <UserSection />
      </div>
    </header>
  );
}
