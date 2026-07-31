import { Link } from 'react-router-dom';
import { BrandLogo } from '@/shared/components/BrandLogo';
import { CurrentFeatureLabel } from './CurrentFeatureLabel';

/**
 * 顶部导航最左:Logo | 当前功能名(悬停全站菜单)。
 * 侧栏开合改由侧栏顶部 SidebarCollapseButton（面板图标）负责,顶栏不再挂 ☰。
 */
export function BrandSection() {
  return (
    <div className="flex items-center gap-2">
      <Link to="/" className="inline-flex items-center">
        <BrandLogo size="sm" />
      </Link>
      <span aria-hidden className="h-5 w-px shrink-0 bg-border" />
      <CurrentFeatureLabel />
    </div>
  );
}
