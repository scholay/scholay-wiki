/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { adminAPI } from '../services/api';
import { showToast } from '../components/Toast';
import UserStatisticsChart from '../components/UserStatisticsChart';
import OnlineUserChart from '../components/OnlineUserChart';
import UserDetailDrawer from '../components/UserDetailDrawer';
import './UserManagement.css';

// 内存优化配置
const MAX_ONLINE_USERS_DISPLAY = 500; // 最多显示 500 个在线用户

const UserManagement = () => {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    onlineUsers: 0,
    onlineGuests: 0,
    todayRegistrations: 0,
    weekRegistrations: 0,
    monthRegistrations: 0,
    yearRegistrations: 0,
  });
  const [users, setUsers] = useState([]);
  const [onlineUsersList, setOnlineUsersList] = useState([]);
  
  // Mounted ref to prevent state updates after unmount
  const isMountedRef = useRef(true);
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

  // 搜索和筛选状态
  const [searchKeyword, setSearchKeyword] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPlan, setFilterPlan] = useState('');
  const [showCharts, setShowCharts] = useState(true);

  const loadUserStatistics = useCallback(async () => {
    try {
      const response = await adminAPI.getUserStatistics();
      if (response.data.code === 0 && response.data.data) {
        setStats({
          onlineUsers: response.data.data.online_users || 0,
          onlineGuests: response.data.data.online_guests || 0,
          todayRegistrations: response.data.data.today_registrations || 0,
          weekRegistrations: response.data.data.week_registrations || 0,
          monthRegistrations: response.data.data.month_registrations || 0,
          yearRegistrations: response.data.data.year_registrations || 0,
        });
      }
    } catch (err) {
      console.error('Failed to load user statistics:', err);
    }
  }, []);

  const loadUserList = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminAPI.getUserList(
        pagination.page,
        pagination.pageSize,
        sortConfig.sortBy,
        sortConfig.sortOrder
      );
      // Check if component is still mounted before updating state
      if (!isMountedRef.current) return;
      
      if (response.data.code === 0 && response.data.data) {
        setUsers(response.data.data.users || []);
        setPagination(prev => ({
          ...prev,
          total: response.data.data.total || 0,
        }));
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      showToast('加载用户列表失败', 'error');
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [pagination.page, pagination.pageSize, sortConfig.sortBy, sortConfig.sortOrder]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    loadUserStatistics();
    loadUserList();
  }, [loadUserStatistics, loadUserList]);

  const loadOnlineUsers = async () => {
    setLoading(true);
    try {
      const response = await adminAPI.getOnlineUsers();
      // Check if component is still mounted
      if (!isMountedRef.current) return;
      
      if (response.data.code === 0 && response.data.data) {
        // Limit the number of online users to prevent memory issues
        const onlineUsers = response.data.data.online_users || [];
        const limitedUsers = onlineUsers.slice(0, MAX_ONLINE_USERS_DISPLAY);
        setOnlineUsersList(limitedUsers);
        
        if (onlineUsers.length > MAX_ONLINE_USERS_DISPLAY) {
          showToast(`显示前 ${MAX_ONLINE_USERS_DISPLAY} 个在线用户（共 ${onlineUsers.length} 个）`, 'info');
        }
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      showToast('加载在线用户失败', 'error');
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
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
      return <span className="um-sort-icon">↕</span>;
    }
    return sortConfig.sortOrder === 'desc' 
      ? <span className="um-sort-icon active">↓</span> 
      : <span className="um-sort-icon active">↑</span>;
  };

  const getUserStatusLabel = (status) => {
    switch (status) {
      case 1:
        return <span className="um-status-badge um-status-active">正常</span>;
      case 0:
        return <span className="um-status-badge um-status-inactive">未激活</span>;
      case 2:
        return <span className="um-status-badge um-status-suspended">已封禁</span>;
      default:
        return <span className="um-status-badge">未知</span>;
    }
  };

  // 渲染会员状态单元格
  const renderMemberCell = () => {
    return (
      <div className="um-member-cell">
        <span className="um-mw-plan um-mw-plan-free">免费</span>
      </div>
    );
  };

  // eslint-disable-next-line no-unused-vars
  const renderContactInfo = (user) => {
    const contactInfo = [];

    if (user.email) {
      contactInfo.push(
        <div key="email" className="um-contact-info-detail">
          <span className="um-info-label">邮箱:</span> {user.email}
        </div>
      );
    }
    if (user.phone) {
      contactInfo.push(
        <div key="phone" className="um-contact-info-detail">
          <span className="um-info-label">手机:</span> {user.phone}
        </div>
      );
    }
    if (user.wechat_name) {
      contactInfo.push(
        <div key="wechat_name" className="um-contact-info-detail">
          <span className="um-info-label">微信:</span> {user.wechat_name}
        </div>
      );
    } else if (user.wechat_openid) {
      contactInfo.push(
        <div key="wechat_openid" className="um-contact-info-detail">
          <span className="um-info-label">微信:</span> 微信用户
        </div>
      );
    }
    if (user.wechat_union_id) {
      contactInfo.push(
        <div key="wechat_union_id" className="um-contact-info-detail">
          <span className="um-info-label">UnionID:</span> {user.wechat_union_id}
        </div>
      );
    }
    if (user.github_login) {
      contactInfo.push(
        <div key="github_login" className="um-contact-info-detail">
          <span className="um-info-label">GitHub:</span> {user.github_login}
        </div>
      );
    }

    if (contactInfo.length === 0) {
      return <span className="um-empty-contact">-</span>;
    }

    return (
      <div className="um-contact-info-cell">
        {contactInfo.map((info, index) => (
          <React.Fragment key={index}>
            {index > 0 && <div className="um-contact-info-divider"></div>}
            {info}
          </React.Fragment>
        ))}
      </div>
    );
  };

  // 过滤用户列表
  const filteredUsers = users.filter(user => {
    // 搜索关键词过滤
    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase();
      const matchId = user.id.toString().includes(keyword);
      const matchName = user.username?.toLowerCase().includes(keyword);
      const matchEmail = user.email?.toLowerCase().includes(keyword);
      const matchPhone = user.phone?.includes(keyword);
      if (!matchId && !matchName && !matchEmail && !matchPhone) {
        return false;
      }
    }
    // 状态筛选
    if (filterStatus !== '' && user.status !== parseInt(filterStatus, 10)) {
      return false;
    }
    // 会员筛选（订阅系统已移除，所有用户均为免费）
    if (filterPlan === 'paid') return false;
    return true;
  });

  const totalPages = Math.ceil(pagination.total / pagination.pageSize);

  return (
    <div className="um-container">
      {/* 顶部区域：标题 + 统计摘要 */}
      <div className="um-header-section">
        <div className="um-header-left">
          <div className="um-header-title">
            <h1>用户管理</h1>
            <p>管理和分析平台用户数据</p>
          </div>
          <div className="um-quick-stats">
            <div className="um-quick-stat um-quick-stat-online">
              <span className="um-quick-stat-value">{stats.onlineUsers}</span>
              <span className="um-quick-stat-label">用户在线</span>
            </div>
            <div className="um-quick-stat um-quick-stat-guest">
              <span className="um-quick-stat-value">{stats.onlineGuests}</span>
              <span className="um-quick-stat-label">访客在线</span>
            </div>
            <div className="um-quick-stat um-quick-stat-today">
              <span className="um-quick-stat-value">{stats.todayRegistrations}</span>
              <span className="um-quick-stat-label">今日新增</span>
            </div>
            <div className="um-quick-stat um-quick-stat-total">
              <span className="um-quick-stat-value">{pagination.total}</span>
              <span className="um-quick-stat-label">总用户</span>
            </div>
          </div>
        </div>
      </div>

      {/* 图表区域 - 可折叠 */}
      <div className="um-charts-wrapper">
        <div className="um-charts-header" onClick={() => setShowCharts(!showCharts)}>
          <h3>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="20" x2="18" y2="10"></line>
              <line x1="12" y1="20" x2="12" y2="4"></line>
              <line x1="6" y1="20" x2="6" y2="14"></line>
            </svg>
            数据趋势
          </h3>
          <button className={`um-collapse-btn ${showCharts ? '' : 'collapsed'}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
        </div>
        {showCharts && (
          <div className="um-charts-section">
            <div className="um-chart-card">
              <div className="um-chart-title">用户注册趋势</div>
              <UserStatisticsChart />
            </div>
            <div className="um-chart-card">
              <div className="um-chart-title">在线用户趋势</div>
              <OnlineUserChart />
            </div>
          </div>
        )}
      </div>

      {/* 工具栏：搜索 + 筛选 + 视图切换 */}
      <div className="um-toolbar">
        <div className="um-toolbar-left">
          <div className="um-search-box">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              placeholder="搜索用户ID、用户名、邮箱、手机号..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
            />
            {searchKeyword && (
              <button className="um-search-clear" onClick={() => setSearchKeyword('')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            )}
          </div>
          <div className="um-filter-group">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="um-filter-select"
            >
              <option value="">全部状态</option>
              <option value="1">正常</option>
              <option value="0">未激活</option>
              <option value="2">已封禁</option>
            </select>
            <select
              value={filterPlan}
              onChange={(e) => setFilterPlan(e.target.value)}
              className="um-filter-select"
            >
              <option value="">全部会员</option>
              <option value="free">免费用户</option>
              <option value="paid">付费会员</option>
            </select>
          </div>
        </div>
        <div className="um-toolbar-right">
          <div className="um-view-toggle">
            <button
              className={`um-toggle-btn ${activeView === 'list' ? 'active' : ''}`}
              onClick={() => handleViewChange('list')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"></path>
              </svg>
              全部用户
            </button>
            <button
              className={`um-toggle-btn ${activeView === 'online' ? 'active' : ''}`}
              onClick={() => handleViewChange('online')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 6v6l4 2"></path>
              </svg>
              在线用户
            </button>
          </div>
          <button className="um-refresh-btn" onClick={loadUserList}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"></path>
            </svg>
          </button>
        </div>
      </div>

      {/* User List */}
      <div className="um-table-container">
        {loading ? (
          <div className="loading-container">
            <span className="spinner"></span>
            <p>加载中...</p>
          </div>
        ) : (
          <>
            {activeView === 'list' && (
              <>
                <table className="um-table">
                  <thead>
                    <tr>
                      <th>用户信息</th>
                      <th>会员状态</th>
                      <th>状态</th>
                      <th
                        className="um-sortable-header"
                        onClick={() => handleSort('last_login_at')}
                      >
                        最后登录 {getSortIcon('last_login_at')}
                      </th>
                      <th
                        className="um-sortable-header"
                        onClick={() => handleSort('created_at')}
                      >
                        注册时间 {getSortIcon('created_at')}
                      </th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.length > 0 ? (
                      filteredUsers.map(user => (
                        <tr key={user.id}>
                          <td>
                            <div className="um-user-cell-combined">
                              <div className="um-user-main">
                                <span className="um-user-id">#{user.id}</span>
                                <span className="um-user-name">{user.username || '-'}</span>
                              </div>
                              <div className="um-user-contacts">
                                {user.email && <span className="um-contact-tag um-contact-email">{user.email}</span>}
                                {user.phone && <span className="um-contact-tag um-contact-phone">{user.phone}</span>}
                              </div>
                            </div>
                          </td>
                          <td>{renderMemberCell(user)}</td>
                          <td>{getUserStatusLabel(user.status)}</td>
                          <td>
                            <div 
                              className="um-relative-time" 
                              title={formatDate(user.last_login_at)}
                            >
                              {formatRelativeTime(user.last_login_at)}
                            </div>
                          </td>
                          <td>
                            <div 
                              className="um-relative-time" 
                              title={formatDate(user.created_at)}
                            >
                              {formatRelativeTime(user.created_at)}
                            </div>
                          </td>
                          <td>
                            <div className="um-action-buttons">
                              <button
                                className="um-action-btn um-view-btn"
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
                                className="um-action-btn um-delete-btn"
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
                        <td colSpan="6" className="no-data">
                          {searchKeyword || filterStatus || filterPlan ? '没有找到匹配的用户' : '暂无用户数据'}
                        </td>
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
              <table className="um-table">
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
                          <div className="um-ip-location-cell">
                            <div className="um-ip-address">{user.ip || '-'}</div>
                            {user.location && (
                              <div className="um-location-info">{user.location}</div>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="um-device-info-cell">
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
              <p className="um-warning-text">
                ⚠️ 此操作将删除该用户的所有数据（除统计数据外），包括：
              </p>
              <ul className="um-delete-list">
                <li>用户账号信息</li>
                <li>登录认证信息</li>
                <li>会话记录</li>
                <li>对话历史和消息</li>
              </ul>
              <p className="um-warning-text">此操作<strong>不可撤销</strong>！</p>
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

    </div>
  );
};

export default UserManagement;
