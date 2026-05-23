/**
 * ============================================================================
 * DrawerFeatureSwitcher —— 抽屉顶部的功能轮播切换器
 * ----------------------------------------------------------------------------
 * 布局（参考 scholay.pen iconSelector "GXejx"）：
 *   [home]    ‹  [prev]  [active]  [next]  ›    [☰]
 *
 * 全部图标用 lucide-react 矢量组件，不用 emoji。
 * ============================================================================
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, ChevronLeft, ChevronRight, Menu } from 'lucide-react';
import { useDrawerV2 } from '../../../stores/drawerV2.store';
import { FEATURES, getFeature, neighborFeature } from './features';

const DrawerFeatureSwitcher = ({ onMenuClick }) => {
  const navigate = useNavigate();
  const { activeFeature, setFeature, close } = useDrawerV2();

  const active = getFeature(activeFeature);
  const prev = neighborFeature(activeFeature, -1);
  const next = neighborFeature(activeFeature, 1);

  const ActiveIcon = active.icon;
  const PrevIcon = prev.icon;
  const NextIcon = next.icon;

  const jumpTo = (feature) => {
    setFeature(feature.key);
    navigate(feature.route);
  };

  const goHome = () => {
    setFeature('home');
    navigate(FEATURES[0].route);
    close();
  };

  return (
    <div className="drawerv2-feature-switcher">
      <button
        type="button"
        className={`dfs-side-btn ${activeFeature === 'home' ? 'is-active' : ''}`}
        onClick={goHome}
        title="返回首页"
        aria-label="返回首页"
      >
        <Home size={16} strokeWidth={2} />
      </button>

      <div className="dfs-center">
        <button
          type="button"
          className="dfs-chev"
          onClick={() => jumpTo(prev)}
          title={`上一个：${prev.label}`}
          aria-label={`切换到 ${prev.label}`}
        >
          <ChevronLeft size={16} strokeWidth={2} />
        </button>

        <button
          type="button"
          className="dfs-candidate"
          onClick={() => jumpTo(prev)}
          title={prev.label}
        >
          <PrevIcon size={14} strokeWidth={2} />
        </button>

        <button
          type="button"
          className="dfs-active"
          title={active.label}
          aria-current="page"
        >
          <ActiveIcon size={18} strokeWidth={2} />
        </button>

        <button
          type="button"
          className="dfs-candidate"
          onClick={() => jumpTo(next)}
          title={next.label}
        >
          <NextIcon size={14} strokeWidth={2} />
        </button>

        <button
          type="button"
          className="dfs-chev"
          onClick={() => jumpTo(next)}
          title={`下一个：${next.label}`}
          aria-label={`切换到 ${next.label}`}
        >
          <ChevronRight size={16} strokeWidth={2} />
        </button>
      </div>

      <button
        type="button"
        className="dfs-side-btn"
        onClick={onMenuClick}
        title="完整菜单"
        aria-label="打开完整功能菜单"
      >
        <Menu size={16} strokeWidth={2} />
      </button>
    </div>
  );
};

export default DrawerFeatureSwitcher;
