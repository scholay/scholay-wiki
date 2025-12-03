/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { adminAPI } from '../services/api';
import { showToast } from '../components/Toast';
import UserStatisticsChart from '../components/UserStatisticsChart';
import OnlineUserChart from '../components/OnlineUserChart';
import UserDetailDrawer from '../components/UserDetailDrawer';
import './UserManagement.css';

const UserManagement = () => {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    onlineUsers: 0,
    todayRegistrations: 0,
    weekRegistrations: 0,
    monthRegistrations: 0,
    yearRegistrations: 0,
  });
  const [users, setUsers] = useState([]);
  const [onlineUsersList, setOnlineUsersList] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
  });
  const [sortConfig, setSortConfig] = useState({
    sortBy: 'last_login_at',
    sortOrder: 'desc',
  });
  const [activeView, setActiveView] = useState('list'); // 'list' or 'online'
  const [deleteConfirm, setDeleteConfirm] = useState({ show: false, userId: null, userEmail: '' });
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [grantModal, setGrantModal] = useState({ show: false, user: null });
  const [grantForm, setGrantForm] = useState({ planCode: '', billingCycle: 'monthly', reason: '' });
  const [subscriptionPlans, setSubscriptionPlans] = useState([]);
  const [grantLoading, setGrantLoading] = useState(false);

  useEffect(() => {
    loadUserStatistics();
    loadUserList();
    loadSubscriptionPlans();
  }, [pagination.page, sortConfig]);

  const loadSubscriptionPlans = async () => {
    try {
      const response = await adminAPI.getSubscriptionPlans();
      if (response.data.code === 0 && response.data.data) {
        // Filter out free plan
        const paidPlans = response.data.data.filter(plan => plan.plan_code !== 'FREE');
        setSubscriptionPlans(paidPlans);
      }
    } catch (err) {
      console.error('Failed to load subscription plans:', err);
    }
  };

  const loadUserStatistics = async () => {
    try {
      const response = await adminAPI.getUserStatistics();
      if (response.data.code === 0 && response.data.data) {
        setStats({
          onlineUsers: response.data.data.online_users || 0,
          todayRegistrations: response.data.data.today_registrations || 0,
          weekRegistrations: response.data.data.week_registrations || 0,
          monthRegistrations: response.data.data.month_registrations || 0,
          yearRegistrations: response.data.data.year_registrations || 0,
        });
      }
    } catch (err) {
      console.error('Failed to load user statistics:', err);
    }
  };

  const loadUserList = async () => {
    setLoading(true);
    try {
      const response = await adminAPI.getUserList(
        pagination.page, 
        pagination.pageSize,
        sortConfig.sortBy,
        sortConfig.sortOrder
      );
      if (response.data.code === 0 && response.data.data) {
        setUsers(response.data.data.users || []);
        setPagination(prev => ({
          ...prev,
          total: response.data.data.total || 0,
        }));
      }
    } catch (err) {
      showToast('加载用户列表失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadOnlineUsers = async () => {
    setLoading(true);
    try {
      const response = await adminAPI.getOnlineUsers();
      if (response.data.code === 0 && response.data.data) {
        setOnlineUsersList(response.data.data.online_users || []);
      }
    } catch (err) {
      showToast('加载在线用户失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleViewChange = (view) => {
    setActiveView(view);
    if (view === 'online') {
      loadOnlineUsers();
    }
  };

  const handlePageChange = (newPage) => {
    setPagination(prev => ({ ...prev, page: newPage }));
  };

  const handleDeleteClick = (user) => {
    setDeleteConfirm({
      show: true,
      userId: user.id,
      userEmail: user.email || user.username || `用户ID: ${user.id}`,
    });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm.userId) return;

    try {
      const response = await adminAPI.deleteUser(deleteConfirm.userId);
      if (response.data.code === 0) {
        showToast('用户删除成功', 'success');
        setDeleteConfirm({ show: false, userId: null, userEmail: '' });
        // Refresh the user list and statistics
        loadUserList();
        loadUserStatistics();
      } else {
        showToast(response.data.message || '删除失败', 'error');
      }
    } catch (err) {
      showToast(err.response?.data?.message || '删除用户失败', 'error');
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirm({ show: false, userId: null, userEmail: '' });
  };

  // Grant subscription handlers
  const handleGrantClick = (user) => {
    setGrantModal({ show: true, user });
    setGrantForm({ planCode: subscriptionPlans[0]?.plan_code || '', billingCycle: 'monthly', reason: '' });
  };

  const handleGrantCancel = () => {
    setGrantModal({ show: false, user: null });
    setGrantForm({ planCode: '', billingCycle: 'monthly', reason: '' });
  };

  const handleGrantConfirm = async () => {
    if (!grantModal.user || !grantForm.planCode) {
      showToast('请选择会员套餐', 'error');
      return;
    }

    setGrantLoading(true);
    try {
      const response = await adminAPI.grantSubscription(
        grantModal.user.id,
        grantForm.planCode,
        grantForm.billingCycle,
        grantForm.reason
      );
      if (response.data.code === 0) {
        showToast('会员套餐发放成功', 'success');
        handleGrantCancel();
        // Refresh the user list
        loadUserList();
      } else {
        showToast(response.data.message || '发放失败', 'error');
      }
    } catch (err) {
      showToast(err.response?.data?.message || '发放会员套餐失败', 'error');
    } finally {
      setGrantLoading(false);
    }
  };

  // 格式化为相对时间
  const formatRelativeTime = (dateString) => {
    if (!dateString) return '从未登录';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    if (diffSeconds < 60) return '刚刚';
    if (diffMinutes < 60) return `${diffMinutes}分钟前`;
    if (diffHours < 24) {
      if (diffMinutes >= 30 && diffHours < 1) return '半小时前';
      return `${diffHours}小时前`;
    }
    if (diffDays < 30) return `${diffDays}天前`;
    if (diffMonths < 12) return `${diffMonths}个月前`;
    return `${diffYears}年前`;
  };

  // 格式化为精确时间
  const formatDate = (dateString) => {
    if (!dateString) return '从未登录';
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN');
  };

  // 处理排序点击
  const handleSort = (field) => {
    setSortConfig(prev => ({
      sortBy: field,
      sortOrder: prev.sortBy === field && prev.sortOrder === 'desc' ? 'asc' : 'desc',
    }));
    // 重置到第一页
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  // 获取排序图标
  const getSortIcon = (field) => {
    if (sortConfig.sortBy !== field) {
      return <span className="sort-icon">↕</span>;
    }
    return sortConfig.sortOrder === 'desc' 
      ? <span className="sort-icon active">↓</span> 
      : <span className="sort-icon active">↑</span>;
  };

  const getUserStatusLabel = (status) => {
    switch (status) {
      case 1:
        return <span className="status-badge status-active">正常</span>;
      case 0:
        return <span className="status-badge status-inactive">未激活</span>;
      case 2:
        return <span className="status-badge status-suspended">已封禁</span>;
      default:
        return <span className="status-badge">未知</span>;
    }
  };

  // 渲染联系方式列（包含邮箱、手机号、微信、GitHub）
  const renderSubscriptionPlan = (subscription) => {
    if (!subscription) {
      return <span className="plan-badge plan-free">免费</span>;
    }

    const planClass = `plan-badge plan-${subscription.plan_code}`;
    return (
      <span className={planClass}>
        {subscription.plan_name || subscription.plan_code}
      </span>
    );
  };

  const renderSubscriptionExpiry = (subscription) => {
    if (!subscription || !subscription.end_date) {
      return <span className="expiry-none">-</span>;
    }

    const endDate = new Date(subscription.end_date);
    const remainingDays = subscription.remaining_days;

    let expiryClass = 'expiry-normal';
    let warningIcon = null;

    if (remainingDays <= 0) {
      expiryClass = 'expiry-expired';
      warningIcon = '❌';
    } else if (remainingDays <= 3) {
      expiryClass = 'expiry-critical';
      warningIcon = '🔴';
    } else if (remainingDays <= 7) {
      expiryClass = 'expiry-warning';
      warningIcon = '⚠️';
    } else if (remainingDays <= 30) {
      expiryClass = 'expiry-soon';
    }

    return (
      <div className={`subscription-expiry ${expiryClass}`}>
        <div className="expiry-date">
          {warningIcon && <span className="expiry-icon">{warningIcon}</span>}
          {endDate.toLocaleDateString('zh-CN')}
        </div>
        <div className="expiry-days">
          剩余 {remainingDays} 天
        </div>
        {subscription.auto_renew && (
          <div className="expiry-auto-renew">自动续费</div>
        )}
      </div>
    );
  };

  const renderContactInfo = (user) => {
    const contactInfo = [];

    if (user.email) {
      contactInfo.push(
        <div key="email" className="contact-info-detail">
          <span className="info-label">邮箱:</span> {user.email}
        </div>
      );
    }
    if (user.phone) {
      contactInfo.push(
        <div key="phone" className="contact-info-detail">
          <span className="info-label">手机:</span> {user.phone}
        </div>
      );
    }
    if (user.wechat_name) {
      contactInfo.push(
        <div key="wechat_name" className="contact-info-detail">
          <span className="info-label">微信:</span> {user.wechat_name}
        </div>
      );
    } else if (user.wechat_openid) {
      contactInfo.push(
        <div key="wechat_openid" className="contact-info-detail">
          <span className="info-label">微信:</span> 微信用户
        </div>
      );
    }
    if (user.wechat_union_id) {
      contactInfo.push(
        <div key="wechat_union_id" className="contact-info-detail">
          <span className="info-label">UnionID:</span> {user.wechat_union_id}
        </div>
      );
    }
    if (user.github_login) {
      contactInfo.push(
        <div key="github_login" className="contact-info-detail">
          <span className="info-label">GitHub:</span> {user.github_login}
        </div>
      );
    }

    if (contactInfo.length === 0) {
      return <span className="empty-contact">-</span>;
    }

    return (
      <div className="contact-info-cell">
        {contactInfo.map((info, index) => (
          <React.Fragment key={index}>
            {index > 0 && <div className="contact-info-divider"></div>}
            {info}
          </React.Fragment>
        ))}
      </div>
    );
  };

  const totalPages = Math.ceil(pagination.total / pagination.pageSize);

  return (
    <div className="user-management-container">
      <div className="page-header">
        <h1>用户管理</h1>
        <p>查看和管理注册用户</p>
      </div>

      {/* Statistics Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon stat-icon-success">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M12 6v6l4 2"></path>
            </svg>
          </div>
          <div className="stat-content">
            <div className="stat-label">在线用户</div>
            <div className="stat-value">{stats.onlineUsers}</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon stat-icon-primary">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
            </svg>
          </div>
          <div className="stat-content">
            <div className="stat-label">今日注册</div>
            <div className="stat-value">{stats.todayRegistrations}</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon stat-icon-info">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
          </div>
          <div className="stat-content">
            <div className="stat-label">本周注册</div>
            <div className="stat-value">{stats.weekRegistrations}</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon stat-icon-warning">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
            </svg>
          </div>
          <div className="stat-content">
            <div className="stat-label">本月注册</div>
            <div className="stat-value">{stats.monthRegistrations}</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon stat-icon-danger">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <path d="M8 14h.01M12 14h.01M16 14h.01"></path>
            </svg>
          </div>
          <div className="stat-content">
            <div className="stat-label">今年注册</div>
            <div className="stat-value">{stats.yearRegistrations}</div>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="charts-section">
        <div className="chart-card">
          <div className="chart-header">
            <h3>用户注册趋势</h3>
          </div>
          <UserStatisticsChart />
        </div>

        <div className="chart-card">
          <div className="chart-header">
            <h3>在线用户趋势</h3>
          </div>
          <OnlineUserChart />
        </div>
      </div>

      {/* View Toggle */}
      <div className="view-toggle">
        <button
          className={`toggle-btn ${activeView === 'list' ? 'active' : ''}`}
          onClick={() => handleViewChange('list')}
        >
          全部用户
        </button>
        <button
          className={`toggle-btn ${activeView === 'online' ? 'active' : ''}`}
          onClick={() => handleViewChange('online')}
        >
          在线用户
        </button>
      </div>

      {/* User List */}
      <div className="user-table-container">
        {loading ? (
          <div className="loading-container">
            <span className="spinner"></span>
            <p>加载中...</p>
          </div>
        ) : (
          <>
            {activeView === 'list' && (
              <>
                <table className="user-table">
                  <thead>
                    <tr>
                      <th>用户</th>
                      <th>联系方式</th>
                      <th>会员信息</th>
                      <th>邀请者</th>
                      <th>状态</th>
                      <th 
                        className="sortable-header"
                        onClick={() => handleSort('last_login_at')}
                      >
                        最后登录 {getSortIcon('last_login_at')}
                      </th>
                      <th 
                        className="sortable-header"
                        onClick={() => handleSort('created_at')}
                      >
                        注册时间 {getSortIcon('created_at')}
                      </th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.length > 0 ? (
                      users.map(user => (
                        <tr key={user.id}>
                          <td>
                            <div className="user-info-cell">
                              <span className="user-id">#{user.id}</span>
                              <span className="user-name">{user.username || '-'}</span>
                            </div>
                          </td>
                          <td className="contact-info-td">{renderContactInfo(user)}</td>
                          <td>
                            <div className="subscription-info-cell">
                              {renderSubscriptionPlan(user.subscription)}
                              {renderSubscriptionExpiry(user.subscription)}
                            </div>
                          </td>
                          <td>
                            {user.invited_by ? (
                              <div className="inviter-info-cell">
                                <span className="inviter-id">#{user.invited_by.user_id}</span>
                                <span className="inviter-name">{user.invited_by.username || '-'}</span>
                              </div>
                            ) : (
                              <span className="no-inviter">-</span>
                            )}
                          </td>
                          <td>{getUserStatusLabel(user.status)}</td>
                          <td>
                            <div className="login-info-cell">
                              <div 
                                className="relative-time" 
                                title={formatDate(user.last_login_at)}
                              >
                                {formatRelativeTime(user.last_login_at)}
                              </div>
                              {user.last_login_ip && (
                                <div className="ip-location-cell">
                                  <div className="ip-address">{user.last_login_ip}</div>
                                  {user.last_login_ip_info && (
                                    <div className="location-info">{user.last_login_ip_info}</div>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                          <td>
                            <div 
                              className="relative-time" 
                              title={formatDate(user.created_at)}
                            >
                              {formatRelativeTime(user.created_at)}
                            </div>
                          </td>
                          <td>
                            <div className="action-buttons">
                              <button
                                className="action-btn view-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  setSelectedUserId(user.id);
                                }}
                                title="查看详情"
                              >
                                详情
                              </button>
                              <button
                                className="action-btn grant-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  handleGrantClick(user);
                                }}
                                title="发放会员"
                              >
                                发放
                              </button>
                              <button
                                className="action-btn delete-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  handleDeleteClick(user);
                                }}
                                title="删除用户"
                              >
                                删除
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="8" className="no-data">暂无用户数据</td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="pagination">
                    <button
                      className="pagination-btn"
                      onClick={() => handlePageChange(pagination.page - 1)}
                      disabled={pagination.page === 1}
                    >
                      上一页
                    </button>
                    <span className="pagination-info">
                      第 {pagination.page} / {totalPages} 页 (共 {pagination.total} 条)
                    </span>
                    <button
                      className="pagination-btn"
                      onClick={() => handlePageChange(pagination.page + 1)}
                      disabled={pagination.page === totalPages}
                    >
                      下一页
                    </button>
                  </div>
                )}
              </>
            )}

            {activeView === 'online' && (
              <table className="user-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>邮箱</th>
                    <th>用户名</th>
                    <th>最后活跃时间</th>
                    <th>IP地址/地区</th>
                    <th>设备信息</th>
                  </tr>
                </thead>
                <tbody>
                  {onlineUsersList.length > 0 ? (
                    onlineUsersList.map((user, index) => (
                      <tr key={user.id || index}>
                        <td>{user.id}</td>
                        <td>{user.email || '-'}</td>
                        <td>{user.username || '-'}</td>
                        <td>{formatDate(user.last_activity)}</td>
                        <td>
                          <div className="ip-location-cell">
                            <div className="ip-address">{user.ip || '-'}</div>
                            {user.location && (
                              <div className="location-info">{user.location}</div>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="device-info-cell">
                            {user.device || '-'}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6" className="no-data">暂无在线用户</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm.show && (
        <div className="modal-overlay" onClick={handleDeleteCancel}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>确认删除用户</h3>
            </div>
            <div className="modal-body">
              <p>您确定要删除用户 <strong>{deleteConfirm.userEmail}</strong> 吗？</p>
              <p className="warning-text">
                ⚠️ 此操作将删除该用户的所有数据（除统计数据外），包括：
              </p>
              <ul className="delete-list">
                <li>用户账号信息</li>
                <li>登录认证信息</li>
                <li>会话记录</li>
                <li>对话历史和消息</li>
                <li>订阅记录</li>
                <li>订单和支付记录</li>
                <li>使用配额记录</li>
              </ul>
              <p className="warning-text">此操作<strong>不可撤销</strong>！</p>
            </div>
            <div className="modal-footer">
              <button className="modal-btn cancel-btn" onClick={handleDeleteCancel}>
                取消
              </button>
              <button className="modal-btn confirm-btn danger-btn" onClick={handleDeleteConfirm}>
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Detail Drawer */}
      {selectedUserId && (
        <UserDetailDrawer
          userId={selectedUserId}
          onClose={() => setSelectedUserId(null)}
        />
      )}

      {/* Grant Subscription Modal */}
      {grantModal.show && (
        <div className="modal-overlay" onClick={handleGrantCancel}>
          <div className="modal-content grant-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>发放会员套餐</h3>
            </div>
            <div className="modal-body">
              <p>为用户 <strong>{grantModal.user?.email || grantModal.user?.username || `ID: ${grantModal.user?.id}`}</strong> 发放会员套餐</p>
              
              <div className="form-group">
                <label>选择套餐</label>
                <select
                  value={grantForm.planCode}
                  onChange={(e) => setGrantForm({ ...grantForm, planCode: e.target.value })}
                  className="form-select"
                >
                  <option value="">请选择套餐</option>
                  {subscriptionPlans.map(plan => (
                    <option key={plan.plan_code} value={plan.plan_code}>
                      {plan.plan_name} - 月付 ¥{plan.current_price_monthly} / 年付 ¥{plan.current_price_yearly}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>计费周期</label>
                <div className="radio-group">
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="billingCycle"
                      value="monthly"
                      checked={grantForm.billingCycle === 'monthly'}
                      onChange={(e) => setGrantForm({ ...grantForm, billingCycle: e.target.value })}
                    />
                    <span>月付（1个月）</span>
                  </label>
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="billingCycle"
                      value="yearly"
                      checked={grantForm.billingCycle === 'yearly'}
                      onChange={(e) => setGrantForm({ ...grantForm, billingCycle: e.target.value })}
                    />
                    <span>年付（12个月）</span>
                  </label>
                </div>
              </div>

              <div className="form-group">
                <label>发放原因（选填）</label>
                <textarea
                  value={grantForm.reason}
                  onChange={(e) => setGrantForm({ ...grantForm, reason: e.target.value })}
                  className="form-textarea"
                  placeholder="例如：活动赠送、客服补偿、测试账号等"
                  rows={3}
                />
              </div>

              <div className="grant-info-box">
                <p className="info-title">📋 发放说明</p>
                <ul>
                  <li>系统将创建一笔订单记录，支付方式为"系统发放"</li>
                  <li>订单金额显示为套餐原价，折扣为100%，实付金额为0</li>
                  <li>用户会员状态将立即生效</li>
                  <li>此操作会记录管理员ID和发放原因</li>
                </ul>
              </div>
            </div>
            <div className="modal-footer">
              <button className="modal-btn cancel-btn" onClick={handleGrantCancel} disabled={grantLoading}>
                取消
              </button>
              <button 
                className="modal-btn confirm-btn primary-btn" 
                onClick={handleGrantConfirm}
                disabled={grantLoading || !grantForm.planCode}
              >
                {grantLoading ? '发放中...' : '确认发放'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
