import { Link } from 'react-router-dom';
import { PanelLeft } from 'lucide-react';
import { IconButton } from '@/shared/components/IconButton';
import { BrandLogo } from '@/shared/components/BrandLogo';

/**
 * 顶部导航最左:hamburger + Logo。
 * 与 RailLinks 之间用 1px #E8E8E8 竖线分隔(在 TopNav 里渲染)。
 *
 * .pen `uTrcL` leftGroup gap 8。
 *
 * ☰ 按钮:
 *   - canToggle=false → 禁用(灰显,提示"当前页面无侧栏")
 *   - canToggle=true  → 启用,click 调 onToggleSidebar 触发全局开合
 *
 * 图标用 lucide PanelLeft 单一图标(不随状态切换);"展开/收起"靠点击交互体验,
 * 不靠图标本体的视觉差异传达。tooltip 一句话即可。
 */
export function BrandSection({
  onToggleSidebar,
  canToggle = true,
}: {
  onToggleSidebar?: () => void;
  canToggle?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
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
