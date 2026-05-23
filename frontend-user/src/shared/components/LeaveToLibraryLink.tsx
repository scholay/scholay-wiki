import { forwardRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ConfirmPopover } from './ConfirmPopover';

/**
 * 「跳去文献集」专用包装链接 ——
 *
 * 用户在 文献搜索 / 期刊搜索 等工作区里,侧栏顶部有"我的文献集"快捷入口
 * (文件夹行、"管理"、"去创建"等)。直接点会离开当前搜索上下文,翻页 /
 * 关键词 / 筛选器都丢。所以这里挂一道二次确认 —— **就地 Popover**(不是全屏 Dialog),
 * 只在用户**当前不在 /library**时弹,避免文献集内部互跳也被拦。
 *
 * 行为细节:
 *   - `⌘/Ctrl + click` / 中键 / `target=_blank` —— 浏览器原生新标签页打开,直接放行
 *   - 已经在 /library 路由下 —— 不弹,正常跳转
 *   - 否则 —— `e.preventDefault()` 拦下,弹 ConfirmPopover 在链接旁,确认后 navigate
 *
 * forwardRef 透传,样式由调用方传 className,组件只管行为。
 */
export interface LeaveToLibraryLinkProps
  extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: string;
  children: ReactNode;
}

export const LeaveToLibraryLink = forwardRef<
  HTMLAnchorElement,
  LeaveToLibraryLinkProps
>(function LeaveToLibraryLink({ to, onClick, children, ...rest }, ref) {
  const navigate = useNavigate();
  const location = useLocation();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    // 让浏览器原生行为走:新标签页 / 中键 / shift / 非主键点击
    if (
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey ||
      e.button !== 0 ||
      rest.target === '_blank'
    ) {
      return;
    }
    // 已经在文献集内部 —— 文件夹间互跳是工作区内的常规操作,不弹
    if (location.pathname.startsWith('/library')) return;

    e.preventDefault();
    setConfirmOpen(true);
  };

  return (
    <ConfirmPopover
      asAnchor
      open={confirmOpen}
      onOpenChange={setConfirmOpen}
      title="离开当前页面?"
      description="将跳转到「我的文献集」,可通过浏览器后退返回搜索条件。"
      confirmText="前往文献集"
      cancelText="继续在这里"
      side="right"
      align="start"
      onConfirm={() => navigate(to)}
    >
      <Link ref={ref} to={to} onClick={handleClick} {...rest}>
        {children}
      </Link>
    </ConfirmPopover>
  );
});
