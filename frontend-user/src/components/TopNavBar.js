/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * TopNavBar - 通用顶部导航栏组件
 * 
 * 功能：
 * 1. 左侧：菜单按钮（点击打开侧边栏）+ Logo
 * 2. 中间：面包屑导航 或 自定义内容
 * 3. 右侧：未登录显示登录按钮，已登录显示用户头像
 */

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import ThemeToggle from './ThemeToggle';
import GoldIcon from './GoldIcon';
import EntcoinIcon from './EntcoinIcon';
import { NormalSearchIcon } from './SearchIcons';
import MessageDropdown from './MessageDropdown';
import api, { walletAPI, checkinAPI, messageAPI } from '../services/api';
import wsClient from '../services/websocket';
import { useOrderModal } from '../contexts/OrderModalContext';
import { useRechargeModal } from '../contexts/RechargeModalContext';
import logger from '../utils/logger';
import './styles/TopNavBar.css';
import './MessageDropdown.css';

const TopNavBar = ({
  user,
  isAuthenticated,
  onMenuClick,
  onShowLogin,
  onLogout,
  // 额外的右侧按钮
  rightButtons,
  // 是否显示菜单按钮
  showMenuButton = true,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  useTheme(); // 确保主题 context 可用
  const { openOrderModal } = useOrderModal();
  const { openRechargeModal } = useRechargeModal();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [walletLoading, setWalletLoading] = useState(false); // 钱包加载状态
  // 签到相关状态
  const [checkinHistory, setCheckinHistory] = useState([]);
  const [checkinDetails, setCheckinDetails] = useState([]);
  const [futureRewards, setFutureRewards] = useState([]);
  const [checkinStats, setCheckinStats] = useState({ consecutiveDays: 0, totalDays: 0 });
  const [hasCheckedInToday, setHasCheckedInToday] = useState(false);
  // 站内信相关状态
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const userMenuRef = useRef(null);
  const avatarRef = useRef(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });

  // 获取未读消息数量
  const fetchUnreadCount = useCallback(async () => {
    try {
      const response = await messageAPI.getUnreadCount();
      if (response.data.code === 0) {
        setUnreadMessageCount(response.data.data.count || 0);
      }
    } catch (error) {
      logger.error('Failed to fetch unread message count:', error);
    }
  }, []);

  // 监听 WebSocket 未读数更新（实时更新小红点）
  useEffect(() => {
    const unsubscribe = wsClient.on('unreadCount', (data) => {
      logger.debug('[TopNavBar] WebSocket unread count update:', data);
      if (data && typeof data.count === 'number') {
        setUnreadMessageCount(data.count);
      }
    });
    return unsubscribe;
  }, []);

  // 获取订阅信息、钱包余额、邀请统计、签到信息、未读消息
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        // 获取订阅信息
        const subResponse = await api.get('/user/subscription/my');
        if (subResponse.data.code === 0) {
          setSubscription(subResponse.data.data);
        }

        // 获取钱包余额
        const walletResponse = await walletAPI.getWallet();
        if (walletResponse.data.code === 0) {
          setWallet(walletResponse.data.data);
        }

        // 获取签到信息
        const today = new Date();
        const checkinRes = await checkinAPI.getHistory(today.getFullYear(), today.getMonth() + 1);
        if (checkinRes.data.code === 0) {
          const data = checkinRes.data.data;
          const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
          setCheckinHistory(data.checkin_dates || []);
          setCheckinDetails(data.checkin_details || []);
          setFutureRewards(data.future_rewards || []);
          setCheckinStats({
            consecutiveDays: data.consecutive_days || 0,
            totalDays: data.total_days || 0
          });
          setHasCheckedInToday(data.checkin_dates?.includes(todayStr) || false);
        }

        // 获取未读消息数量
        await fetchUnreadCount();
      } catch (error) {
        logger.error('Failed to fetch user data:', error);
      }
    };

    if (user) {
      fetchUserData();
      // 每60秒刷新未读消息数量
      const interval = setInterval(fetchUnreadCount, 60000);
      return () => clearInterval(interval);
    }
  }, [user, fetchUnreadCount]);


  // 点击外部关闭用户菜单
  useEffect(() => {
    const handleClickOutside = (event) => {
      // 检查是否点击了消息弹窗（通过 Portal 渲染在 body 上）
      const messageModal = document.querySelector('.msg-modal-overlay');
      const checkinModal = document.querySelector('.um-checkin-overlay');
      
      if (showUserMenu &&
          userMenuRef.current &&
          !userMenuRef.current.contains(event.target) &&
          avatarRef.current &&
          !avatarRef.current.contains(event.target) &&
          // 排除消息弹窗和签到弹窗的点击
          (!messageModal || !messageModal.contains(event.target)) &&
          (!checkinModal || !checkinModal.contains(event.target))) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showUserMenu]);

  // 更新菜单位置
  const updateMenuPosition = () => {
    if (avatarRef.current) {
      const rect = avatarRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right
      });
    }
  };

  useEffect(() => {
    if (showUserMenu) {
      updateMenuPosition();
      window.addEventListener('resize', updateMenuPosition);
      window.addEventListener('scroll', updateMenuPosition);
      return () => {
        window.removeEventListener('resize', updateMenuPosition);
        window.removeEventListener('scroll', updateMenuPosition);
      };
    }
  }, [showUserMenu]);

  // 获取用户头像首字母
  const getUserInitial = () => {
    if (!user) return '?';
    const displayName = user.username || user.email;
    if (!displayName) return '?';
    return displayName.charAt(0).toUpperCase();
  };

  // 获取用户显示名（简短，用于顶部导航）
  const getUserDisplayName = () => {
    if (!user) return '用户';
    // 优先使用用户名
    if (user.username) return user.username;
    // 其次使用邮箱前缀
    if (user.email) {
      const emailPrefix = user.email.split('@')[0];
      return emailPrefix.length > 10 ? emailPrefix.substring(0, 10) + '...' : emailPrefix;
    }
    // 手机号隐藏中间4位
    if (user.phone) {
      return user.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
    }
    // 微信名
    if (user.wechat_name) return user.wechat_name;
    // GitHub 用户名
    if (user.github_login) return user.github_login;
    return '用户';
  };

  // 获取钱包余额
  const fetchWallet = useCallback(async () => {
    setWalletLoading(true);
    try {
      const walletResponse = await walletAPI.getWallet();
      if (walletResponse.data.code === 0) {
        setWallet(walletResponse.data.data);
      }
    } catch (error) {
      logger.error('Failed to fetch wallet:', error);
    } finally {
      setWalletLoading(false);
    }
  }, []);

  const handleAvatarClick = async () => {
    const willOpen = !showUserMenu;
    setShowUserMenu(willOpen);
    
    // 打开菜单时立即刷新钱包数据
    if (willOpen && user) {
      fetchWallet();
    }
  };

  return (
    <>
      <header className="top-nav-bar">
        {/* 左侧区域：菜单按钮 + 导航菜单 */}
        <div className="top-nav-left navbar-left">
          {showMenuButton && (
            <button
              className="top-nav-menu-btn"
              onClick={onMenuClick}
              aria-label="打开菜单"
            >
              <Menu size={22} />
            </button>
          )}
          
          {/* 主导航菜单 */}
          <nav className="top-nav-menu">
            <Link 
              to="/" 
              className={`nav-menu-item ${location.pathname === '/' || location.pathname === '/search-results' ? 'active' : ''}`}
            >
              <NormalSearchIcon size={18} />
              <span>学术搜索</span>
            </Link>
            <Link 
              to="/assistant" 
              className={`nav-menu-item ${location.pathname === '/assistant' || location.pathname.startsWith('/chat') || location.pathname.startsWith('/peer-review') ? 'active' : ''}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
              </svg>
              <span>精品AI工具</span>
            </Link>
          </nav>
        </div>

        {/* 右侧区域 */}
        <div className="top-nav-right navbar-right">
          {/* 额外的右侧按钮 */}
          {rightButtons}

          {/* 用户区域 */}
          {isAuthenticated ? (
            // 已登录：显示用户头像 + 用户名
            <div
              ref={avatarRef}
              className="top-nav-user"
              onClick={handleAvatarClick}
            >
              <div className="top-nav-avatar">
                {getUserInitial()}
                {/* 未读消息红点 */}
                {unreadMessageCount > 0 && (
                  <span className={`um-avatar-badge ${unreadMessageCount > 99 ? '' : unreadMessageCount > 9 ? '' : 'dot'}`}>
                    {unreadMessageCount > 99 ? '99+' : unreadMessageCount > 9 ? unreadMessageCount : ''}
                  </span>
                )}
              </div>
              <span className="top-nav-username">{getUserDisplayName()}</span>
            </div>
          ) : (
            // 未登录：显示价格方案、主题切换、登录按钮
            <div className="auth-buttons">
              {/* 桌面端显示的按钮 */}
              <button
                onClick={() => navigate('/pricing')}
                className="btn-auth btn-pricing desktop-only"
              >
                价格方案
              </button>
              <div className="desktop-only">
                <ThemeToggle />
              </div>
              <button
                onClick={onShowLogin}
                className="btn-auth btn-login-register desktop-only"
              >
                登录 / 注册
              </button>
              {/* 移动端显示的按钮 */}
              <button
                onClick={onShowLogin}
                className="btn-auth btn-login-mobile mobile-only"
              >
                登录
              </button>
            </div>
          )}
        </div>
      </header>

      {/* 用户菜单弹窗 - 卡片分层式设计 */}
      {showUserMenu && isAuthenticated && ReactDOM.createPortal(
        <div
          ref={userMenuRef}
          className="top-nav-user-menu"
          style={{
            position: 'fixed',
            top: `${menuPosition.top}px`,
            right: `${menuPosition.right}px`,
            zIndex: 10000
          }}
        >
          {/* 卡片1: 用户信息 */}
          <div className="um-card um-user-card">
            <div className="um-user-info">
              <div className="um-avatar">
                {getUserInitial()}
              </div>
              <div className="um-user-detail">
                <span className="um-username">{getUserDisplayName()}</span>
                <span
                  className={`um-plan-badge ${subscription?.plan_code || 'free'} clickable`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowUserMenu(false);
                    openOrderModal({ mode: 'subscription' });
                  }}
                  title="点击开通/续费会员"
                >
                  {subscription?.plan_name || 'FREE'}
                </span>
              </div>
            </div>
          </div>

          {/* 卡片2: 钱包 */}
          <div className={`um-card um-wallet-card ${walletLoading ? 'loading' : ''}`}>
            {/* 右上角查看明细按钮 - hover时显示 */}
            <button
              className="um-wallet-detail-btn"
              onClick={(e) => {
                e.stopPropagation();
                setShowUserMenu(false);
                navigate('/settings?tab=wallet');
              }}
            >
              查看明细
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
            <div className="um-wallet-grid">
              {/* 恩特币 */}
              <div className="um-wallet-item">
                <div className="um-wallet-item-header">
                  <EntcoinIcon size="sm" />
                  <span className="um-wallet-label">恩特币</span>
                </div>
                <div className="um-wallet-value-row">
                  <span className="um-wallet-value">
                    {walletLoading ? <span className="um-wallet-skeleton"></span> : (wallet?.diamond || 0).toLocaleString()}
                  </span>
                  <button
                    className="um-wallet-btn um-wallet-btn-primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowUserMenu(false);
                      openRechargeModal();
                    }}
                  >
                    充值
                  </button>
                </div>
              </div>
              {/* 经费 */}
              <div className="um-wallet-item">
                <div className="um-wallet-item-header">
                  <GoldIcon size="sm" />
                  <span className="um-wallet-label">经费</span>
                </div>
                <div className="um-wallet-value-row">
                  <span className="um-wallet-value">
                    {walletLoading ? <span className="um-wallet-skeleton"></span> : (wallet?.gold || 0).toLocaleString()}
                  </span>
                  <button
                    className="um-wallet-btn um-wallet-btn-secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowUserMenu(false);
                      navigate('/settings?tab=wallet&section=gold');
                    }}
                  >
                    兑换
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 卡片3: 签到 */}
          <div className="um-card um-checkin-card" onClick={() => { setShowUserMenu(false); navigate('/settings?tab=profile'); }}>
            <div className="um-checkin-header">
              <div className="um-checkin-header-left">
                <svg className="um-checkin-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                <span className="um-checkin-title">签到</span>
                <span className="um-checkin-streak">连续{checkinStats.consecutiveDays}天</span>
              </div>
              {(() => {
                const nextMilestone = futureRewards.find(r => r.is_milestone && r.consecutive_day > checkinStats.consecutiveDays);
                if (nextMilestone) {
                  const daysToMilestone = nextMilestone.consecutive_day - checkinStats.consecutiveDays;
                  return (
                    <span className="um-checkin-next-reward">
                      {daysToMilestone}天后+{nextMilestone.expected_gold}经费
                    </span>
                  );
                }
                return null;
              })()}
            </div>
            <div className="um-checkin-week-header">
              {['日', '一', '二', '三', '四', '五', '六'].map(d => <span key={d}>{d}</span>)}
            </div>
            <div className="um-checkin-days">
              {(() => {
                const today = new Date();
                const dayOfWeek = today.getDay();
                const weekStart = new Date(today);
                weekStart.setDate(today.getDate() - dayOfWeek);

                const days = [];
                for (let i = 0; i < 7; i++) {
                  const date = new Date(weekStart);
                  date.setDate(weekStart.getDate() + i);
                  const dayNum = date.getDate();
                  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                  const isToday = dateStr === todayStr;
                  const isPast = date < today && !isToday;
                  const isFuture = date > today;
                  const isChecked = checkinHistory.includes(dateStr);
                  const checkinDetail = checkinDetails.find(d => d.date === dateStr);
                  const goldReward = checkinDetail?.gold_reward || 0;
                  const futureReward = futureRewards.find(r => r.date === dateStr);
                  const expectedGold = futureReward?.expected_gold || 10;
                  const isMilestone = futureReward?.is_milestone || false;

                  days.push(
                    <div
                      key={i}
                      className={`um-day ${isToday ? 'today' : ''} ${isChecked ? 'checked' : ''} ${isFuture && !isToday ? 'future' : ''} ${isPast && !isChecked ? 'past' : ''} ${isMilestone ? 'milestone' : ''}`}
                    >
                      <span className="um-day-num">{dayNum}</span>
                      {isChecked && goldReward > 0 && (
                        <span className="um-day-reward checked">+{goldReward}</span>
                      )}
                      {isToday && !isChecked && (
                        <span className={`um-day-reward today ${isMilestone ? 'milestone' : ''}`}>+{expectedGold}</span>
                      )}
                      {isFuture && !isToday && (
                        <span className={`um-day-reward future ${isMilestone ? 'milestone' : ''}`}>+{expectedGold}</span>
                      )}
                      {isPast && !isChecked && (
                        <span className="um-day-reward past">+10</span>
                      )}
                      {isChecked && (
                        <div className="um-day-check">
                          <svg viewBox="0 0 24 24" fill="none">
                            <path d="M9 12L11 14L15 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      )}
                    </div>
                  );
                }
                return days;
              })()}
            </div>
          </div>

          {/* 消息通知入口 */}
          <div className="um-card um-message-card">
            <MessageDropdown
              unreadCount={unreadMessageCount}
              onUnreadCountChange={(countOrFn) => {
                if (typeof countOrFn === 'function') {
                  setUnreadMessageCount(countOrFn);
                } else {
                  setUnreadMessageCount(countOrFn);
                }
              }}
            />
          </div>

          {/* 底部操作区域 */}
          <div className="um-footer">
            <div className="um-theme-toggle">
              <ThemeToggle />
            </div>
            <button
              className="um-footer-btn um-settings-btn"
              onClick={() => {
                setShowUserMenu(false);
                navigate('/settings');
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              <span>设置</span>
            </button>
            <button
              className="um-footer-btn um-logout-btn"
              onClick={() => {
                setShowUserMenu(false);
                if (onLogout) {
                  onLogout();
                }
                navigate('/');
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              <span>退出</span>
            </button>
          </div>
        </div>,
        document.body
      )}

    </>
  );
};

export default TopNavBar;
