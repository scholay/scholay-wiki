/**
 * ============================================================================
 * AppDrawer —— 全局抽屉式侧栏（Drawer V2）
 * ----------------------------------------------------------------------------
 * 结构（参考 scholay.pen 4 个 sidebar 复用组件的通用骨架）：
 *
 *   ┌────────────────────┐  240px wide
 *   │ iconSelector  56px │  ← DrawerFeatureSwitcher
 *   ├────────────────────┤
 *   │                    │
 *   │  feature content   │  ← DrawerContent（按 activeFeature 切换）
 *   │                    │
 *   ├────────────────────┤
 *   │ user info     56px │
 *   ├────────────────────┤
 *   │ ‹ 收起        30px │
 *   └────────────────────┘
 *
 * 触发：顶栏的 ☰ 汉堡 → useDrawerV2().toggle()
 * 关闭：遮罩点击 / ESC / 收起 / 选中菜单项
 *
 * 路由同步：每次路由变化，把 activeFeature 调整为对应的 feature
 *   （仍保留用户在轮播中手动选择的能力）。
 * ============================================================================
 */
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronLeft } from 'lucide-react';
import { useAuth } from '../../../utils/AuthContext';
import { useDrawerV2 } from '../../../stores/drawerV2.store';
import { routeToFeature } from './features';
import DrawerFeatureSwitcher from './DrawerFeatureSwitcher';
import DrawerContent from './DrawerContent';
import './AppDrawer.css';

const getUserInitial = (user) => {
  if (!user) return '?';
  const name = user.username || user.email || user.phone || user.wechat_name || user.github_login;
  if (!name) return '?';
  const chinese = name.match(/[一-龥]/g);
  if (chinese && chinese.length > 0) return chinese[chinese.length - 1];
  return name.charAt(0).toUpperCase();
};

const getUserDisplayName = (user) => {
  if (!user) return '游客';
  if (user.username) return user.username;
  if (user.phone) return user.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
  if (user.email) {
    const prefix = user.email.split('@')[0];
    return prefix.length > 12 ? prefix.slice(0, 12) + '…' : prefix;
  }
  if (user.wechat_name) return user.wechat_name;
  if (user.github_login) return user.github_login;
  return '用户';
};

const AppDrawer = () => {
  const { isOpen, close, setFeature } = useDrawerV2();
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuMode, setMenuMode] = useState(false);

  // 路由变化时同步 activeFeature
  useEffect(() => {
    setFeature(routeToFeature(location.pathname));
    // 路由切换时退出"完整菜单"模式
    setMenuMode(false);
  }, [location.pathname, setFeature]);

  // 关闭抽屉时复位 menuMode
  useEffect(() => {
    if (!isOpen) setMenuMode(false);
  }, [isOpen]);

  const onUserClick = () => {
    if (isAuthenticated) {
      navigate('/settings');
      close();
    } else {
      window.dispatchEvent(new Event('auth:required'));
    }
  };

  // SSR safe portal target
  if (typeof document === 'undefined') return null;

  return ReactDOM.createPortal(
    <>
      <aside
        className={`drawerv2-panel ${isOpen ? 'is-open' : ''}`}
        role="navigation"
        aria-label="导航侧栏"
        aria-hidden={!isOpen}
      >
        <DrawerFeatureSwitcher onMenuClick={() => setMenuMode((v) => !v)} />

        <div className="drawerv2-body">
          <DrawerContent menuMode={menuMode} onMenuPick={close} />
        </div>

        <button
          type="button"
          className="drawerv2-user"
          onClick={onUserClick}
        >
          <span className={`drawerv2-user-avatar ${isAuthenticated ? '' : 'is-guest'}`}>
            {isAuthenticated ? getUserInitial(user) : '?'}
          </span>
          <span className="drawerv2-user-col">
            <span className="drawerv2-user-name">
              {isAuthenticated ? getUserDisplayName(user) : '点击登录'}
            </span>
            {isAuthenticated && user?.email && (
              <span className="drawerv2-user-sub">{user.email}</span>
            )}
          </span>
          <span className="drawerv2-user-chev">
            <ChevronDown size={14} strokeWidth={2} />
          </span>
        </button>

        <button
          type="button"
          className="drawerv2-collapse"
          onClick={close}
          aria-label="收起侧栏"
        >
          <ChevronLeft size={14} strokeWidth={2} />
          <span>收起</span>
        </button>
      </aside>
    </>,
    document.body,
  );
};

export default AppDrawer;
