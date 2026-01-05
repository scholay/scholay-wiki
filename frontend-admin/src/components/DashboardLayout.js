/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import { showToast } from './Toast';
import { LogoWithBackground } from './Logo';
import './DashboardLayout.css';

const DashboardLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [couponMenuOpen, setCouponMenuOpen] = useState(false);
  const [businessDataMenuOpen, setBusinessDataMenuOpen] = useState(false);
  const [messageMenuOpen, setMessageMenuOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);

  const handlePasswordChange = (e) => {
    setPasswordForm({
      ...passwordForm,
      [e.target.name]: e.target.value,
    });
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showToast('新密码两次输入不一致', 'error');
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      showToast('密码长度至少为8个字符', 'error');
      return;
    }

    setLoading(true);

    try {
      const { adminAPI } = await import('../services/api');
      const response = await adminAPI.updatePassword(
        passwordForm.oldPassword,
        passwordForm.newPassword
      );

      if (response.data.code === 0) {
        showToast('密码修改成功', 'success');
        setPasswordForm({
          oldPassword: '',
          newPassword: '',
          confirmPassword: '',
        });
        setTimeout(() => {
          setShowPasswordModal(false);
        }, 1000);
      } else {
        showToast(response.data.message || '密码修改失败', 'error');
      }
    } catch (err) {
      showToast(err.response?.data?.message || '操作失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path) => {
    return location.pathname === path;
  };

  return (
    <div className="dashboard">
      {mobileMenuOpen && (
        <div className="mobile-overlay" onClick={() => setMobileMenuOpen(false)} />
      )}

      <aside className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo">
            <LogoWithBackground size={32} />
          </div>
          <h2>Scholar</h2>
        </div>

        <nav className="sidebar-nav">
          <a
            onClick={() => { navigate('/dashboard'); setMobileMenuOpen(false); }}
            className={`nav-item ${isActive('/dashboard') ? 'active' : ''}`}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"/>
            </svg>
            仪表盘
          </a>
          <a
            onClick={() => { navigate('/dashboard/users'); setMobileMenuOpen(false); }}
            className={`nav-item ${isActive('/dashboard/users') ? 'active' : ''}`}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/>
            </svg>
            用户管理
          </a>
          <a
            onClick={() => { navigate('/dashboard/orders'); setMobileMenuOpen(false); }}
            className={`nav-item ${isActive('/dashboard/orders') ? 'active' : ''}`}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M3 1a1 1 0 000 2h1.22l.305 1.222a.997.997 0 00.01.042l1.358 5.43-.893.892C3.74 11.846 4.632 14 6.414 14H15a1 1 0 000-2H6.414l1-1H14a1 1 0 00.894-.553l3-6A1 1 0 0017 3H6.28l-.31-1.243A1 1 0 005 1H3zM16 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM6.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"/>
            </svg>
            订单管理
          </a>

          {/* Coupon Management Parent Menu */}
          <div className="nav-group">
            <a
              onClick={() => setCouponMenuOpen(!couponMenuOpen)}
              className={`nav-item ${(isActive('/dashboard/coupons') || isActive('/dashboard/coupon-batches') || isActive('/dashboard/distributed-coupons')) ? 'active' : ''}`}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05L11.949 18H6.051L.333 13.98a1 1 0 01-.285-1.049l1.738-5.42-1.233-.617a1 1 0 11.894-1.788l1.599.799L7 4.323V3a1 1 0 011-1h2zm0 2.274L7 5.607v3.893a1 1 0 01-1 1H4.268l-1.2 3.748L7.586 17h4.828l4.519-2.752-1.2-3.748H14a1 1 0 01-1-1V5.607L10 4.274z"/>
              </svg>
              <span>折扣券管理</span>
              <svg
                className={`submenu-arrow ${couponMenuOpen ? 'open' : ''}`}
                width="16"
                height="16"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd"/>
              </svg>
            </a>
            {couponMenuOpen && (
              <div className="submenu">
                <a
                  onClick={() => { navigate('/dashboard/coupons'); setMobileMenuOpen(false); }}
                  className={`submenu-item ${isActive('/dashboard/coupons') ? 'active' : ''}`}
                >
                  创建折扣券
                </a>
                <a
                  onClick={() => { navigate('/dashboard/coupon-batches'); setMobileMenuOpen(false); }}
                  className={`submenu-item ${isActive('/dashboard/coupon-batches') ? 'active' : ''}`}
                >
                  批量发放
                </a>
                <a
                  onClick={() => { navigate('/dashboard/distributed-coupons'); setMobileMenuOpen(false); }}
                  className={`submenu-item ${isActive('/dashboard/distributed-coupons') ? 'active' : ''}`}
                >
                  发放列表
                </a>
              </div>
            )}
          </div>
          <a
            onClick={() => { navigate('/dashboard/third-party-accounts'); setMobileMenuOpen(false); }}
            className={`nav-item ${isActive('/dashboard/third-party-accounts') ? 'active' : ''}`}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 2a2 2 0 00-2 2v11a3 3 0 106 0V4a2 2 0 00-2-2H4zm1 14a1 1 0 100-2 1 1 0 000 2zm5-1.757l4.9-4.9a2 2 0 000-2.828L13.485 5.1a2 2 0 00-2.828 0L10 5.757v8.486zM16 18H9.071l6-6H16a2 2 0 012 2v2a2 2 0 01-2 2z" clipRule="evenodd"/>
            </svg>
            第三方账号
          </a>
          {/* 业务数据 - 子菜单 */}
          <div className="nav-group">
            <a
              onClick={() => setBusinessDataMenuOpen(!businessDataMenuOpen)}
              className={`nav-item ${(isActive('/dashboard/default-business-data') || isActive('/dashboard/prompt-templates') || isActive('/dashboard/currency-config') || isActive('/dashboard/subscription-plans')) ? 'active' : ''}`}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z"/>
              </svg>
              <span>业务数据</span>
              <svg
                className={`submenu-arrow ${businessDataMenuOpen ? 'open' : ''}`}
                width="16"
                height="16"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd"/>
              </svg>
            </a>
            {businessDataMenuOpen && (
              <div className="submenu">
                <a
                  onClick={() => { navigate('/dashboard/subscription-plans'); setMobileMenuOpen(false); }}
                  className={`submenu-item ${isActive('/dashboard/subscription-plans') ? 'active' : ''}`}
                >
                  套餐管理
                </a>
                <a
                  onClick={() => { navigate('/dashboard/default-business-data'); setMobileMenuOpen(false); }}
                  className={`submenu-item ${isActive('/dashboard/default-business-data') ? 'active' : ''}`}
                >
                  分析维度
                </a>
                <a
                  onClick={() => { navigate('/dashboard/prompt-templates'); setMobileMenuOpen(false); }}
                  className={`submenu-item ${isActive('/dashboard/prompt-templates') ? 'active' : ''}`}
                >
                  提示词模板
                </a>
                <a
                  onClick={() => { navigate('/dashboard/currency-config'); setMobileMenuOpen(false); }}
                  className={`submenu-item ${isActive('/dashboard/currency-config') ? 'active' : ''}`}
                >
                  货币配置
                </a>
              </div>
            )}
          </div>

          {/* 站内信管理 - 子菜单 */}
          <div className="nav-group">
            <a
              onClick={() => setMessageMenuOpen(!messageMenuOpen)}
              className={`nav-item ${(isActive('/dashboard/messages') || isActive('/dashboard/message-templates')) ? 'active' : ''}`}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/>
                <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/>
              </svg>
              <span>站内信管理</span>
              <svg
                className={`submenu-arrow ${messageMenuOpen ? 'open' : ''}`}
                width="16"
                height="16"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd"/>
              </svg>
            </a>
            {messageMenuOpen && (
              <div className="submenu">
                <a
                  onClick={() => { navigate('/dashboard/messages'); setMobileMenuOpen(false); }}
                  className={`submenu-item ${isActive('/dashboard/messages') ? 'active' : ''}`}
                >
                  发送消息
                </a>
                <a
                  onClick={() => { navigate('/dashboard/message-templates'); setMobileMenuOpen(false); }}
                  className={`submenu-item ${isActive('/dashboard/message-templates') ? 'active' : ''}`}
                >
                  消息模板
                </a>
              </div>
            )}
          </div>
          <a
            onClick={() => { navigate('/dashboard/feedbacks'); setMobileMenuOpen(false); }}
            className={`nav-item ${isActive('/dashboard/feedbacks') ? 'active' : ''}`}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd"/>
            </svg>
            反馈管理
          </a>
          <a
            onClick={() => { navigate('/dashboard/usage-logs'); setMobileMenuOpen(false); }}
            className={`nav-item ${isActive('/dashboard/usage-logs') ? 'active' : ''}`}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/>
              <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd"/>
            </svg>
            使用统计
          </a>
          <a
            onClick={() => { navigate('/dashboard/settings'); setMobileMenuOpen(false); }}
            className={`nav-item ${isActive('/dashboard/settings') ? 'active' : ''}`}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/>
            </svg>
            系统设置
          </a>
        </nav>

        <div className="sidebar-footer">
          <button onClick={() => setShowPasswordModal(true)} className="nav-item">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"/>
            </svg>
            修改密码
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="top-bar">
          <div className="top-bar-left">
            <button
              className="mobile-menu-btn"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12h18M3 6h18M3 18h18" />
              </svg>
            </button>
          </div>
          <div className="user-menu">
            <div className="user-info">
              <div className="user-avatar">
                {user?.username?.charAt(0).toUpperCase()}
              </div>
              <div className="user-details">
                <span className="user-name">{user?.username}</span>
                <span className="user-role">管理员</span>
              </div>
            </div>
            <button onClick={handleLogout} className="btn-logout">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V4a1 1 0 00-1-1H3zm11 4.414l-4.293 4.293a1 1 0 01-1.414 0L4 7.414 5.414 6l3.293 3.293L13.586 6 15 7.414z" clipRule="evenodd"/>
              </svg>
              退出登录
            </button>
          </div>
        </header>

        <div className="dashboard-content">
          <Outlet />
        </div>
      </main>

      {showPasswordModal && (
        <div className="modal-overlay">
          <div className="modal fade-in">
            <div className="modal-header">
              <h2>修改密码</h2>
              <button onClick={() => setShowPasswordModal(false)} className="modal-close">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <form onSubmit={handlePasswordSubmit} className="modal-body">
              <div className="form-group">
                <label htmlFor="oldPassword">当前密码</label>
                <input
                  type="password"
                  id="oldPassword"
                  name="oldPassword"
                  className="input"
                  value={passwordForm.oldPassword}
                  onChange={handlePasswordChange}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="newPassword">新密码</label>
                <input
                  type="password"
                  id="newPassword"
                  name="newPassword"
                  className="input"
                  value={passwordForm.newPassword}
                  onChange={handlePasswordChange}
                  required
                  minLength={8}
                />
              </div>

              <div className="form-group">
                <label htmlFor="confirmPassword">确认新密码</label>
                <input
                  type="password"
                  id="confirmPassword"
                  name="confirmPassword"
                  className="input"
                  value={passwordForm.confirmPassword}
                  onChange={handlePasswordChange}
                  required
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="btn btn-secondary"
                >
                  取消
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? (
                    <>
                      <span className="spinner"></span>
                      <span style={{ marginLeft: '0.5rem' }}>修改中...</span>
                    </>
                  ) : (
                    '确认修改'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardLayout;
