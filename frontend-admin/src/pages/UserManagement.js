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
  const [activeView, setActiveView] = useState('list'); // 'list' or 'online'
  const [deleteConfirm, setDeleteConfirm] = useState({ show: false, userId: null, userEmail: '' });
  const [selectedUserId, setSelectedUserId] = useState(null);

  useEffect(() => {
    loadUserStatistics();
    loadUserList();
  }, [pagination.page]);

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
      const response = await adminAPI.getUserList(pagination.page, pagination.pageSize);
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

  const formatDate = (dateString) => {
    if (!dateString) return '从未登录';
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN');
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
                      <th>ID</th>
                      <th>用户名</th>
                      <th>联系方式</th>
                      <th>状态</th>
                      <th>最后登录</th>
                      <th>注册时间</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.length > 0 ? (
                      users.map(user => (
                        <tr key={user.id}>
                          <td>{user.id}</td>
                          <td>{user.username || '-'}</td>
                          <td className="contact-info-td">{renderContactInfo(user)}</td>
                          <td>{getUserStatusLabel(user.status)}</td>
                          <td>{formatDate(user.last_login_at)}</td>
                          <td>{formatDate(user.created_at)}</td>
                          <td>
                            <button
                              className="action-btn view-btn"
                              onClick={() => setSelectedUserId(user.id)}
                              title="查看详情"
                            >
                              查看
                            </button>
                            <button
                              className="action-btn delete-btn"
                              onClick={() => handleDeleteClick(user)}
                              title="删除用户"
                            >
                              删除
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="9" className="no-data">暂无用户数据</td>
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
    </div>
  );
};

export default UserManagement;
