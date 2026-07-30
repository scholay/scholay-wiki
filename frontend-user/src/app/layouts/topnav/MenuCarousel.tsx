import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Globe, Search } from 'lucide-react';
import { IconButton } from '@/shared/components/IconButton';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/shared/ui/popover';
import { cn } from '@/shared/lib/utils';
import {
  browserTabUrl,
  useBrowserTabs,
} from '@/stores/browser-tabs.store';
import {
  AllMenusPanel,
  navigateToMenu,
} from './AllMenusOverlay';
import type { Menu } from '@/app/menus';

/**
 * 顶栏中段 —— 浏览器入口 + 全站功能搜索框。
 * 搜索框聚焦按名称过滤；完整分类目录改由左侧「当前功能名」展开。
 */
export function MenuCarousel() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const anchorRef = useRef<HTMLLabelElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isInDetailPane = /^\/(paper|author|journal|pdf)\//.test(
    location.pathname,
  );
  const onBrowser = isInDetailPane;

  const browserTabs = useBrowserTabs((s) => s.tabs);
  const browserActiveId = useBrowserTabs((s) => s.activeTabId);
  const refreshReturnTo = useBrowserTabs((s) => s.refreshReturnTo);
  const hasBrowserTabs = browserTabs.length > 0;

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery('');
  };

  const openSearch = () => {
    setSearchOpen(true);
  };

  const goBrowser = () => {
    const target =
      browserTabs.find((t) => t.id === browserActiveId) ?? browserTabs[0];
    if (!target) return;
    if (!isInDetailPane) {
      refreshReturnTo(target.id, `${location.pathname}${location.search}`);
    }
    navigate(browserTabUrl(target));
  };

  const handleSelect = (menu: Menu) => {
    navigateToMenu(navigate, menu);
    closeSearch();
    inputRef.current?.blur();
  };

  const isInsideAnchor = (node: EventTarget | null) => {
    if (!(node instanceof Node)) return false;
    return Boolean(anchorRef.current?.contains(node));
  };

  /** 空闲：图标 + hint 居中，看上去像按钮；聚焦/有字后左对齐成搜索框 */
  const idle = !searchOpen && !query;

  return (
    <div className="flex w-full items-center justify-center gap-1.5">
      {hasBrowserTabs && (
        <>
          <IconButton
            tooltip="浏览器"
            aria-label="浏览器"
            className={cn(
              'rounded-lg',
              onBrowser
                ? 'cursor-default bg-foreground text-background hover:bg-foreground hover:text-background'
                : 'bg-surface-2',
            )}
            onClick={goBrowser}
          >
            <Globe strokeWidth={2} />
          </IconButton>
          <span aria-hidden className="h-5 w-px shrink-0 bg-border-separator" />
        </>
      )}

      <Popover
        open={searchOpen}
        onOpenChange={(next) => {
          // 关闭由 blur / 点外 / 选中驱动;打开只认输入框 focus,避免与
          // 「焦点留在锚点输入框」打架被立刻关掉。
          if (!next) closeSearch();
        }}
      >
        <PopoverAnchor asChild>
          <label
            ref={anchorRef}
            className={cn(
              'relative flex h-9 w-[260px] items-center gap-2 rounded-lg border bg-surface-1 px-2.5 lg:w-[420px]',
              'transition-colors',
              idle && 'cursor-pointer justify-center',
              searchOpen
                ? 'border-foreground/25 bg-background ring-2 ring-foreground/5'
                : 'border-border hover:border-border-strong hover:bg-surface-2',
            )}
          >
            <Search
              className="size-3.5 shrink-0 text-faint"
              strokeWidth={2}
              aria-hidden
            />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                openSearch();
              }}
              onFocus={openSearch}
              onClick={openSearch}
              placeholder="搜索全站功能…"
              aria-label="搜索全站功能"
              aria-expanded={searchOpen}
              aria-controls="topnav-all-menus"
              aria-haspopup="listbox"
              autoComplete="off"
              className={cn(
                'h-full bg-transparent text-sm text-foreground outline-none placeholder:text-faint',
                idle
                  ? 'w-[9.5em] shrink-0 cursor-pointer text-center caret-transparent'
                  : 'min-w-0 flex-1 cursor-text',
              )}
            />
          </label>
        </PopoverAnchor>
        <PopoverContent
          id="topnav-all-menus"
          align="center"
          sideOffset={8}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onFocusOutside={(e) => {
            if (isInsideAnchor(e.target)) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (isInsideAnchor(e.target)) e.preventDefault();
          }}
          className="w-[min(420px,calc(100vw-48px))] overflow-hidden border border-border p-0 shadow-lg"
        >
          <AllMenusPanel query={query} onSelect={handleSelect} />
        </PopoverContent>
      </Popover>
    </div>
  );
}
