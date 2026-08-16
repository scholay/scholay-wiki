import { Link } from 'react-router-dom';
import { PanelLeft } from 'lucide-react';
import { IconButton } from '@/shared/components/IconButton';
import { BrandLogo } from '@/shared/components/BrandLogo';

/**
 * 顶部导航最左:展开/收起 + Logo。
 * 功能入口在全站左轨,这里不再挂当前功能名 / 全站菜单。
 */
export function BrandSection({
  onToggleSidebar,
  canToggle = true,
}: {
  onToggleSidebar?: () => void;
  canToggle?: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <IconButton
        aria-label={canToggle ? '展开/收起侧栏' : '当前页面无侧栏'}
        tooltip={canToggle ? '展开/收起侧栏' : undefined}
        disabled={!canToggle}
        onClick={onToggleSidebar}
      >
        <PanelLeft />
      </IconButton>
      <Link to="/" className="inline-flex items-center">
        <BrandLogo size="sm" />
      </Link>
    </div>
  );
}
