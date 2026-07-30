import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { resolveFeatureChip, type Menu } from '@/app/menus';
import { cn } from '@/shared/lib/utils';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/shared/ui/hover-card';
import { AllMenusPanel, navigateToMenu } from './AllMenusOverlay';

/** 固定宽：图标 + 文案居中，避免前后按钮跟着抖 */
const CHIP_WIDTH = 'w-32';

/**
 * 顶栏后退 / 前进中间的当前功能名 —— 悬停展开全站功能菜单。
 * 左侧统一用右向箭头表示「当前位置」,不用各功能自己的图标。
 */
export function CurrentFeatureLabel() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { label } = resolveFeatureChip(pathname);

  const handleSelect = (menu: Menu) => {
    navigateToMenu(navigate, menu);
    setOpen(false);
  };

  return (
    <HoverCard
      open={open}
      onOpenChange={setOpen}
      openDelay={120}
      closeDelay={180}
    >
      <HoverCardTrigger asChild>
        <button
          type="button"
          title={label === '全站功能' ? '全站功能' : `${label} · 全站功能`}
          aria-label={
            label === '全站功能'
              ? '全站功能，悬停展开菜单'
              : `当前功能：${label}，悬停查看全站功能`
          }
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-controls="topnav-site-menu"
          className={cn(
            'inline-flex h-7 shrink-0 cursor-pointer items-center justify-center gap-1 rounded-md px-1.5',
            CHIP_WIDTH,
            'text-xs font-medium text-foreground transition-colors',
            'hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
            open && 'bg-background shadow-sm',
          )}
        >
          <ChevronRight
            className="size-3.5 shrink-0 text-subtle"
            strokeWidth={2}
            aria-hidden
          />
          <span className="min-w-0 truncate text-center">{label}</span>
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        id="topnav-site-menu"
        align="start"
        sideOffset={8}
        className="w-[min(280px,calc(100vw-48px))] overflow-hidden border border-border p-0 shadow-lg"
      >
        <AllMenusPanel compact onSelect={handleSelect} />
      </HoverCardContent>
    </HoverCard>
  );
}
