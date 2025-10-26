import React, { useState, useEffect } from 'react';
import { adminAPI } from '../services/api';
import { showToast } from '../components/Toast';
import UserStatisticsChart from '../components/UserStatisticsChart';
import OnlineUserChart from '../components/OnlineUserChart';
import './UserManagement.css';

const UserManagement = () => {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    totalUsers: 0,
    onlineUsers: 0,
  });
  const [users, setUsers] = useState([]);
  const [onlineUsersList, setOnlineUsersList] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
  });
  const [activeView, setActiveView] = useState('list'); // 'list' or 'online'

  useEffect(() => {
    loadUserStatistics();
    loadUserList();
  }, [pagination.page]);

  const loadUserStatistics = async () => {
    try {
      const response = await adminAPI.getUserStatistics();
      if (response.data.code === 0 && response.data.data) {
        setStats({
          totalUsers: response.data.data.total_users || 0,
          onlineUsers: response.data.data.online_users || 0,
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
          <div className="stat-icon stat-icon-primary">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
          </div>
          <div className="stat-content">
            <div className="stat-label">总用户数</div>
            <div className="stat-value">{stats.totalUsers}</div>
          </div>
        </div>

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
          <div className="stat-icon stat-icon-info">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </div>
          <div className="stat-content">
            <div className="stat-label">在线率</div>
            <div className="stat-value">
              {stats.totalUsers > 0
                ? ((stats.onlineUsers / stats.totalUsers) * 100).toFixed(1) + '%'
                : '0%'}
            </div>
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
                      <th>邮箱</th>
                      <th>用户名</th>
                      <th>状态</th>
                      <th>最后登录</th>
                      <th>注册时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.length > 0 ? (
                      users.map(user => (
                        <tr key={user.id}>
                          <td>{user.id}</td>
                          <td>{user.email || '-'}</td>
                          <td>{user.username || '-'}</td>
                          <td>{getUserStatusLabel(user.status)}</td>
                          <td>{formatDate(user.last_login_at)}</td>
                          <td>{formatDate(user.created_at)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="6" className="no-data">暂无用户数据</td>
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
                    <th>IP地址</th>
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
                        <td>{user.ip || '-'}</td>
                        <td className="user-agent">{user.user_agent || '-'}</td>
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
    </div>
  );
};

export default UserManagement;
