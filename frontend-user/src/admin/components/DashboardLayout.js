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
    navigate('/');
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
            href="#dashboard"
            onClick={(e) => { e.preventDefault(); navigate('/admin'); setMobileMenuOpen(false); }}
            className={`nav-item ${isActive('/admin') ? 'active' : ''}`}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"/>
            </svg>
            仪表盘
          </a>
          <a
            href="#users"
            onClick={(e) => { e.preventDefault(); navigate('/admin/users'); setMobileMenuOpen(false); }}
            className={`nav-item ${isActive('/admin/users') ? 'active' : ''}`}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/>
            </svg>
            用户管理
          </a>
          <a
            href="#third-party"
            onClick={(e) => { e.preventDefault(); navigate('/admin/third-party-accounts'); setMobileMenuOpen(false); }}
            className={`nav-item ${isActive('/admin/third-party-accounts') ? 'active' : ''}`}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 2a2 2 0 00-2 2v11a3 3 0 106 0V4a2 2 0 00-2-2H4zm1 14a1 1 0 100-2 1 1 0 000 2zm5-1.757l4.9-4.9a2 2 0 000-2.828L13.485 5.1a2 2 0 00-2.828 0L10 5.757v8.486zM16 18H9.071l6-6H16a2 2 0 012 2v2a2 2 0 01-2 2z" clipRule="evenodd"/>
            </svg>
            第三方账号
          </a>
          {/* 业务数据 - 子菜单 */}
          <div className="nav-group">
            <a
              href="#business-data"
              onClick={(e) => { e.preventDefault(); setBusinessDataMenuOpen(!businessDataMenuOpen); }}
              className={`nav-item ${(isActive('/admin/default-business-data') || isActive('/admin/prompt-templates') || isActive('/admin/latex-agent-config')) ? 'active' : ''}`}
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
                  href="#business-data-default"
                  onClick={(e) => { e.preventDefault(); navigate('/admin/default-business-data'); setMobileMenuOpen(false); }}
                  className={`submenu-item ${isActive('/admin/default-business-data') ? 'active' : ''}`}
                >
                  分析维度
                </a>
                <a
                  href="#prompt-templates"
                  onClick={(e) => { e.preventDefault(); navigate('/admin/prompt-templates'); setMobileMenuOpen(false); }}
                  className={`submenu-item ${isActive('/admin/prompt-templates') ? 'active' : ''}`}
                >
                  提示词模板
                </a>
                <a
                  href="#latex-agent-config"
                  onClick={(e) => { e.preventDefault(); navigate('/admin/latex-agent-config'); setMobileMenuOpen(false); }}
                  className={`submenu-item ${isActive('/admin/latex-agent-config') ? 'active' : ''}`}
                >
                  LaTeX Agent 配置
                </a>
              </div>
            )}
          </div>

          {/* 站内信管理 - 子菜单 */}
          <div className="nav-group">
            <a
              href="#messages"
              onClick={(e) => { e.preventDefault(); setMessageMenuOpen(!messageMenuOpen); }}
              className={`nav-item ${(isActive('/admin/messages') || isActive('/admin/message-templates')) ? 'active' : ''}`}
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
                  href="#send-messages"
                  onClick={(e) => { e.preventDefault(); navigate('/admin/messages'); setMobileMenuOpen(false); }}
                  className={`submenu-item ${isActive('/admin/messages') ? 'active' : ''}`}
                >
                  发送消息
                </a>
                <a
                  href="#message-templates"
                  onClick={(e) => { e.preventDefault(); navigate('/admin/message-templates'); setMobileMenuOpen(false); }}
                  className={`submenu-item ${isActive('/admin/message-templates') ? 'active' : ''}`}
                >
                  消息模板
                </a>
              </div>
            )}
          </div>
          <a
            href="#feedbacks"
            onClick={(e) => { e.preventDefault(); navigate('/admin/feedbacks'); setMobileMenuOpen(false); }}
            className={`nav-item ${isActive('/admin/feedbacks') ? 'active' : ''}`}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd"/>
            </svg>
            反馈管理
          </a>
          <a
            href="#usage-logs"
            onClick={(e) => { e.preventDefault(); navigate('/admin/usage-logs'); setMobileMenuOpen(false); }}
            className={`nav-item ${isActive('/admin/usage-logs') ? 'active' : ''}`}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/>
              <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd"/>
            </svg>
            使用统计
          </a>
          <a
            href="#hot-content"
            onClick={(e) => { e.preventDefault(); navigate('/admin/hot-content'); setMobileMenuOpen(false); }}
            className={`nav-item ${isActive('/admin/hot-content') ? 'active' : ''}`}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd"/>
            </svg>
            热门内容
          </a>
          <a
            href="#code-snippets"
            onClick={(e) => { e.preventDefault(); navigate('/admin/code-snippets'); setMobileMenuOpen(false); }}
            className={`nav-item ${isActive('/admin/code-snippets') ? 'active' : ''}`}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd"/>
            </svg>
            代码片段
          </a>
          <a
            href="#settings"
            onClick={(e) => { e.preventDefault(); navigate('/admin/settings'); setMobileMenuOpen(false); }}
            className={`nav-item ${isActive('/admin/settings') ? 'active' : ''}`}
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
                      <span className="ml-1">修改中...</span>
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
