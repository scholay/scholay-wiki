/**
 * ============================================================================
 * Scholay V2 顶部导航栏
 * ----------------------------------------------------------------------------
 * 极简风：☰ 汉堡 + 七彩 Scholay 小 logo（左），用户/登录药丸（右）
 * 在 Home / SearchResults 等"无侧栏"页面共享。
 * ============================================================================
 */

import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useAuth } from '../../utils/AuthContext';
import { useDrawerV2 } from '../../stores/drawerV2.store';
import './NavBarV2.css';

// 七彩字母（每字一色，循环 红绿黄黑红绿黄）
const SMALL_LOGO = [
  { text: 'S', color: '#CC2222' },
  { text: 'c', color: '#2A7A2A' },
  { text: 'h', color: '#D4A017' },
  { text: 'o', color: '#111111' },
  { text: 'l', color: '#CC2222' },
  { text: 'a', color: '#2A7A2A' },
  { text: 'y', color: '#D4A017' },
];

const getUserInitial = (user) => {
  if (!user) return '?';
  const name = user.username || user.email || user.phone || user.wechat_name || user.github_login;
  if (!name) return '?';
  const chineseMatch = name.match(/[一-龥]/g);
  if (chineseMatch && chineseMatch.length > 0) return chineseMatch[chineseMatch.length - 1];
  return name.charAt(0).toUpperCase();
};

const getUserDisplayName = (user) => {
  if (!user) return '用户';
  if (user.username) return user.username;
  if (user.phone) return user.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
  if (user.email) {
    const prefix = user.email.split('@')[0];
    return prefix.length > 10 ? prefix.slice(0, 10) + '…' : prefix;
  }
  if (user.wechat_name) return user.wechat_name;
  if (user.github_login) return user.github_login;
  return '用户';
};

const NavBarV2 = ({ onLoginClick, onMenuClick }) => {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const { toggle: toggleDrawer } = useDrawerV2();

  const handleUserClick = () => {
    if (isAuthenticated) {
      navigate('/settings');
    } else if (onLoginClick) {
      onLoginClick();
    } else {
      // 兜底：派发全局 auth:required 事件
      window.dispatchEvent(new Event('auth:required'));
    }
  };

  const handleMenuClick = () => {
    if (onMenuClick) onMenuClick();
    else toggleDrawer();
  };

  return (
    <header className="navv2">
      <div className="navv2-left">
        <button
          type="button"
          className="navv2-hamburger"
          aria-label="打开菜单"
          onClick={handleMenuClick}
        >
          <Menu size={18} strokeWidth={2} />
        </button>
        <Link to="/" className="navv2-logo" aria-label="Scholay 首页">
          {SMALL_LOGO.map((l, i) => (
            <span key={i} style={{ color: l.color }}>{l.text}</span>
          ))}
        </Link>
      </div>

      <div className="navv2-right">
        <button
          type="button"
          className="navv2-user-pill"
          onClick={handleUserClick}
          aria-label={isAuthenticated ? '账户设置' : '登录 / 注册'}
        >
          <span
            className={`navv2-user-avatar ${isAuthenticated ? '' : 'is-guest'}`}
          >
            {isAuthenticated ? getUserInitial(user) : '?'}
          </span>
          <span className="navv2-user-name">
            {isAuthenticated ? getUserDisplayName(user) : '登录'}
          </span>
        </button>
      </div>
    </header>
  );
};

export default NavBarV2;
