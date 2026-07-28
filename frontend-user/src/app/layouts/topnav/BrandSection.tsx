import { Link } from 'react-router-dom';
import { PanelLeft } from 'lucide-react';
import { IconButton } from '@/shared/components/IconButton';
import { BrandLogo } from '@/shared/components/BrandLogo';

/**
 * 顶部导航最左:hamburger + Logo。
 * 与 RailLinks 之间用 1px 竖线分隔(在 TopNav 里渲染,走 `bg-border` token)——
 * 原注释写死的 `#E8E8E8` 是 .pen 时代的值,已退休,不要照抄。
 *
 * 组内 gap 8(Figma §5 观测间距集合 {4,8,10,12,16,24,32,40} 内)。
 * (原依据 .pen `uTrcL`,该真源 2026-07 已作废。)
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
    // 🔴 `shrink-0` 是硬约束不是微调:Logo 里的两个 <svg> 本身就是 shrink-0 + 固定
    // 内联宽高,一旦本行被压窄,svg 不会跟着缩、而是**溢出**到相邻列底下被后画的
    // 内容盖住 —— 768 宽下 logo 被中列首页按钮盖成 `SCHOL/` 就是这么来的
    // (纯 clip 探针量不出来:被裁的不是它,是它被覆盖)。
    // 让本行不可压缩后,挤压全部落到能横滚的 RailLinks 上,与 TopNav 的设计意图一致。
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
