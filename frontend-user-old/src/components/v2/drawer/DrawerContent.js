/**
 * ============================================================================
 * DrawerContent —— 抽屉中段：按 activeFeature 分发到不同的"侧栏内容"
 * ----------------------------------------------------------------------------
 * 已落地的变体：
 *   home     → HomeMenuPanel        (n0GFZR · 首页 · 全功能)
 *   search   → SearchSidebarPanel   (LxWuG / Ph9DE · 收藏夹 + 筛选)
 *   library  → SearchSidebarPanel   (hasFolders=true 的复用形态)
 *   settings → SettingsNavPanel     (o20rac · 设置 · 账户)
 *   features → ToolCatalogPanel     (i6tcp · 功能大全 · 黄页)
 *
 * 占位形态（等对应页面重写后再落地）：
 *   latex / review / submit / chat → 通用 placeholder
 *
 * 顶部点 ☰ 时进入 "完整菜单" 模式，覆盖任何 feature。
 * ============================================================================
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { useDrawerV2 } from '../../../stores/drawerV2.store';
import { FEATURES, getFeature } from './features';
import HomeMenuPanel from './panels/HomeMenuPanel';
import SettingsNavPanel from './panels/SettingsNavPanel';
import ToolCatalogPanel from './panels/ToolCatalogPanel';
import SearchSidebarPanel from './panels/SearchSidebarPanel';
import LibraryPanel from './panels/LibraryPanel';
import './DrawerPanels.css';

const FullMenu = ({ onPick }) => (
  <div className="drawerv2-menu">
    <div className="drawerv2-menu-title">全部功能</div>
    <div className="drawerv2-menu-list">
      {FEATURES.map((f) => {
        const Icon = f.icon;
        return (
          <Link
            key={f.key}
            to={f.route}
            className="drawerv2-menu-item"
            onClick={() => onPick?.(f.key)}
          >
            <span className="drawerv2-menu-icon"><Icon size={16} strokeWidth={2} /></span>
            <span className="drawerv2-menu-label">{f.label}</span>
          </Link>
        );
      })}
    </div>
  </div>
);

const FeaturePlaceholder = ({ feature }) => {
  const Icon = feature.icon;
  return (
    <div className="dp-empty">
      <div className="dp-empty-icon"><Icon size={28} strokeWidth={1.5} /></div>
      <div className="dp-empty-title">{feature.label}</div>
      <p className="dp-empty-desc">
        该侧栏的详细内容会在 {feature.label} 页面重写完成后接入。
      </p>
    </div>
  );
};

const PANEL_MAP = {
  home:     () => <HomeMenuPanel />,
  features: () => <ToolCatalogPanel />,
  search:   () => <SearchSidebarPanel hasFolders />,
  library:  () => <LibraryPanel />,
  settings: () => <SettingsNavPanel />,
};

const DrawerContent = ({ menuMode, onMenuPick }) => {
  const { activeFeature, setFeature } = useDrawerV2();

  if (menuMode) {
    return (
      <FullMenu
        onPick={(key) => {
          setFeature(key);
          onMenuPick?.();
        }}
      />
    );
  }

  const render = PANEL_MAP[activeFeature];
  if (render) return render();

  return <FeaturePlaceholder feature={getFeature(activeFeature)} />;
};

export default DrawerContent;
