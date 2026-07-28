import { useLocation, useNavigate } from 'react-router-dom';
import { Globe, Home, LayoutGrid } from 'lucide-react';
import { IconButton } from '@/shared/components/IconButton';
import { cn } from '@/shared/lib/utils';
import { browserTabUrl, useBrowserTabs } from '@/stores/browser-tabs.store';
import { AllMenusOverlay } from './AllMenusOverlay';
import { MenuDock } from './MenuDock';

/**
 * 顶栏中段 —— 固定入口 + 功能坞。
 *
 *   [浏览器?] [首页] │ ← MenuDock(可无限滚 / 光标放大) → │ [全站功能]
 *
 * ── 2026-07 改造:carousel → Dock ──────────────────────────────────
 * 原来是「离散换页 carousel」:active 项永久居中放大成黑底大 chip,
 * 左右两颗箭头一次翻一个。问题是不够灵活 —— 要跳到隔了 4 个的菜单得点 4 次,
 * 或者绕道「全站功能」浮层。
 * 现在换成 macOS Dock 式:光标移到哪一侧就朝哪一侧连续滚(越靠边越快)、
 * 悬停项放大、环形无边界。具体实现与取舍见 MenuDock.tsx 的注释。
 *
 * 数据流不变:URL 仍是唯一真理,点击只 navigate,不自己存选中态。
 */
export function MenuCarousel() {
  const navigate = useNavigate();
  const location = useLocation();

  const onHome = location.pathname === '/';
  // detail pane 路由(2026-05 由 /browser/* 改为 SEO 友好 canonical)
  const isInDetailPane = /^\/(paper|author|journal|pdf)\//.test(location.pathname);

  // 浏览器入口 —— 论文/期刊/学者/PDF 详情承载页。
  // 没有打开过任何详情 tab 时整个按钮**不渲染**(不是 disabled),
  // 避免出现一颗"无意义的灰按钮"占位污染顶栏。有 tab 才显出来,点击进活跃 tab。
  const browserTabs = useBrowserTabs((s) => s.tabs);
  const browserActiveId = useBrowserTabs((s) => s.activeTabId);
  const refreshReturnTo = useBrowserTabs((s) => s.refreshReturnTo);
  const hasBrowserTabs = browserTabs.length > 0;
  const goBrowser = () => {
    const target = browserTabs.find((t) => t.id === browserActiveId) ?? browserTabs[0];
    if (!target) return;
    // 关键:从顶栏 Globe 按钮跳浏览器,要把当前路径作为新的 returnTo —— 否则
    // tab 内的"返回"会跳回当初创建该 tab 的来源(可能是好几次操作前的页面),
    // 用户预期是"刚才从哪个页面点过来的就回那里"。已经在 detail pane 里就不动
    // (避免内部跳 tab 互相串改 returnTo)。
    if (!isInDetailPane) {
      refreshReturnTo(target.id, `${location.pathname}${location.search}`);
    }
    navigate(browserTabUrl(target));
  };

  return (
    <div className="flex items-center gap-1.5 justify-center w-full">
      {/* 浏览器入口 —— 放在首页(小房子)左边。没有 tab 时整颗按钮直接 unmount。 */}
      {hasBrowserTabs && (
        <IconButton
          tooltip="浏览器"
          aria-label="浏览器"
          className={cn(
            'rounded-8',
            isInDetailPane
              ? // active 态与首页按钮一致:固定黑底白字
                'bg-foreground text-on-dark cursor-default hover:bg-foreground hover:text-on-dark'
              : 'bg-surface-2'
          )}
          onClick={goBrowser}
        >
          <Globe strokeWidth={2} />
        </IconButton>
      )}

      <IconButton
        tooltip="首页"
        aria-label="首页"
        className={cn(
          'rounded-8',
          onHome
            ? // 选中态:固定黑底白字,显式同色 hover 抵消 IconButton 内置的
              // hover:bg-surface-2 / hover:text-foreground —— 否则 hover 会
              // 把按钮"变浅"看着像取消选中
              'bg-foreground text-on-dark cursor-default hover:bg-foreground hover:text-on-dark'
            : 'bg-surface-2'
        )}
        onClick={() => navigate('/')}
      >
        <Home strokeWidth={2} />
      </IconButton>

      <Separator />

      <MenuDock />

      <Separator />

      <AllMenusOverlay
        trigger={
          // 不挂 tooltip —— hover 即弹浮层,再叠 tooltip 会"两层提示打架"
          <IconButton aria-label="全站功能" className="rounded-8 bg-surface-2">
            <LayoutGrid strokeWidth={2} />
          </IconButton>
        }
      />
    </div>
  );
}

function Separator() {
  // `bg-divider` 是这条竖线的正名 —— globals.css 的 `--divider` 条目原文就是
  // 「Nav/Toolbar 内组间竖线(h-5 w-px)」。原先写的 `bg-border-separator` 是
  // 过渡兼容层的旧色名(指向同一个 --divider,零像素变化),按 CLAUDE.md §5 收口到新名。
  return <span aria-hidden className="h-5 w-px bg-divider shrink-0" />;
}
