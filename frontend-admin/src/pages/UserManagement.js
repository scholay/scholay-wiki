/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect, useCallback } from 'react';
import { adminAPI } from '../services/api';
import { showToast } from '../components/Toast';
import UserStatisticsChart from '../components/UserStatisticsChart';
import OnlineUserChart from '../components/OnlineUserChart';
import UserDetailDrawer from '../components/UserDetailDrawer';
import EntcoinIcon from '../components/EntcoinIcon';
import GoldIcon from '../components/GoldIcon';
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

  // 搜索和筛选状态
  const [searchKeyword, setSearchKeyword] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPlan, setFilterPlan] = useState('');
  const [showCharts, setShowCharts] = useState(true);

  // 发放货币弹窗状态
  const [currencyModal, setCurrencyModal] = useState({ show: false, user: null });
  const [currencyForm, setCurrencyForm] = useState({
    currencyType: 'gold',
    amount: '',
    description: ''
  });
  const [currencyLoading, setCurrencyLoading] = useState(false);

  // 批量发放弹窗状态
  const [batchModal, setBatchModal] = useState({ show: false });
  const [batchForm, setBatchForm] = useState({
    currencyType: 'gold',
    amount: '',
    targetType: 'all',
    title: '',
    description: '',
    remark: ''
  });
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchPreview, setBatchPreview] = useState({ loading: false, userCount: 0 });

  const loadSubscriptionPlans = useCallback(async () => {
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
  }, []);

  const loadUserStatistics = useCallback(async () => {
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
  }, [pagination.page, pagination.pageSize, sortConfig.sortBy, sortConfig.sortOrder]);

  useEffect(() => {
    loadUserStatistics();
    loadUserList();
    loadSubscriptionPlans();
  }, [loadUserStatistics, loadUserList, loadSubscriptionPlans]);

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

  // 发放货币处理函数
  const handleCurrencyClick = (user) => {
    setCurrencyModal({ show: true, user });
    setCurrencyForm({ currencyType: 'gold', amount: '', description: '' });
  };

  const handleCurrencyCancel = () => {
    setCurrencyModal({ show: false, user: null });
    setCurrencyForm({ currencyType: 'gold', amount: '', description: '' });
  };

  const handleCurrencyConfirm = async () => {
    if (!currencyModal.user) return;
    
    const amount = parseInt(currencyForm.amount, 10);
    if (!amount || amount <= 0) {
      showToast('请输入有效的发放数量', 'error');
      return;
    }

    setCurrencyLoading(true);
    try {
      const response = await adminAPI.rechargeUser({
        user_id: currencyModal.user.id,
        currency_type: currencyForm.currencyType,
        amount: amount,
        description: currencyForm.description || `系统赠送${currencyForm.currencyType === 'gold' ? '经费' : '恩特币'}`
      });
      
      if (response.data.code === 0) {
        showToast(`成功发放 ${amount} ${currencyForm.currencyType === 'gold' ? '经费' : '恩特币'}`, 'success');
        handleCurrencyCancel();
        loadUserList();
      } else {
        showToast(response.data.message || '发放失败', 'error');
      }
    } catch (err) {
      showToast(err.response?.data?.message || '发放货币失败', 'error');
    } finally {
      setCurrencyLoading(false);
    }
  };

  // 批量发放处理函数
  const handleBatchClick = () => {
    setBatchModal({ show: true });
    setBatchForm({
      currencyType: 'gold',
      amount: '',
      targetType: 'all',
      title: '',
      description: '',
      remark: ''
    });
    setBatchPreview({ loading: false, userCount: 0 });
  };

  const handleBatchCancel = () => {
    setBatchModal({ show: false });
    setBatchForm({
      currencyType: 'gold',
      amount: '',
      targetType: 'all',
      title: '',
      description: '',
      remark: ''
    });
    setBatchPreview({ loading: false, userCount: 0 });
  };

  // 预览目标用户数量
  const handleBatchPreview = async (targetType) => {
    setBatchPreview({ loading: true, userCount: 0 });
    try {
      const response = await adminAPI.batchDistributePreview({
        target_type: targetType
      });
      if (response.data.code === 0 && response.data.data) {
        setBatchPreview({
          loading: false,
          userCount: response.data.data.user_count || 0,
          targetName: response.data.data.target_name || ''
        });
      }
    } catch (err) {
      showToast('获取用户数量失败', 'error');
      setBatchPreview({ loading: false, userCount: 0 });
    }
  };

  // 目标类型变更时预览用户数量
  const handleTargetTypeChange = (targetType) => {
    setBatchForm({ ...batchForm, targetType });
    handleBatchPreview(targetType);
  };

  const handleBatchConfirm = async () => {
    const amount = parseInt(batchForm.amount, 10);
    if (!amount || amount <= 0) {
      showToast('请输入有效的发放数量', 'error');
      return;
    }
    if (!batchForm.title.trim()) {
      showToast('请输入发放标题', 'error');
      return;
    }
    if (batchPreview.userCount === 0) {
      showToast('没有符合条件的用户', 'error');
      return;
    }

    setBatchLoading(true);
    try {
      const response = await adminAPI.batchDistribute({
        currency_type: batchForm.currencyType,
        amount: amount,
        target_type: batchForm.targetType,
        title: batchForm.title.trim(),
        description: batchForm.description.trim(),
        remark: batchForm.remark.trim()
      });

      if (response.data.code === 0) {
        const data = response.data.data;
        showToast(`批量发放任务已创建，批次号: ${data.batch_no}，将向 ${data.total_count} 个用户发放`, 'success');
        handleBatchCancel();
        loadUserList();
      } else {
        showToast(response.data.message || '批量发放失败', 'error');
      }
    } catch (err) {
      showToast(err.response?.data?.message || '批量发放失败', 'error');
    } finally {
      setBatchLoading(false);
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

  // 渲染会员等级（备用渲染函数）
  // eslint-disable-next-line no-unused-vars
  const renderSubscriptionPlan = (subscription) => {
    if (!subscription) {
      return <span className="um-plan-badge um-plan-free">免费</span>;
    }

    const planClass = `um-plan-badge um-plan-${subscription.plan_code.toLowerCase()}`;
    return (
      <span className={planClass}>
        {subscription.plan_name || subscription.plan_code}
      </span>
    );
  };

  // 渲染会员/钱包组合单元格
  const renderMemberWalletCell = (user) => {
    const subscription = user.subscription;
    const wallet = user.wallet;

    // 获取剩余天数的样式类
    const getExpiryClass = (days) => {
      if (days <= 0) return 'um-days-expired';
      if (days <= 3) return 'um-days-critical';
      if (days <= 7) return 'um-days-warning';
      if (days <= 30) return 'um-days-soon';
      return 'um-days-normal';
    };

    return (
      <div className="um-member-wallet-cell">
        {/* 会员信息行 */}
        <div className="um-mw-plan-row">
          {subscription ? (
            <>
              <span className={`um-mw-plan um-mw-plan-${subscription.plan_code.toLowerCase()}`}>
                {subscription.plan_name || subscription.plan_code}
              </span>
              <span className={`um-mw-days ${getExpiryClass(subscription.remaining_days)}`}>
                {subscription.remaining_days}天
              </span>
              {subscription.auto_renew && <span className="um-mw-renew">续</span>}
            </>
          ) : (
            <span className="um-mw-plan um-mw-plan-free">免费</span>
          )}
        </div>
        {/* 钱包信息行 */}
        <div className="um-mw-wallet-row">
          <span className="um-mw-gold">
            <GoldIcon size="xs" />
            <span>{wallet?.gold || 0}</span>
          </span>
          <span className="um-mw-diamond">
            <EntcoinIcon size="xs" />
            <span>{wallet?.diamond || 0}</span>
          </span>
        </div>
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
    // 会员筛选
    if (filterPlan) {
      if (filterPlan === 'free' && user.subscription) return false;
      if (filterPlan === 'paid' && !user.subscription) return false;
    }
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
              <span className="um-quick-stat-label">在线</span>
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
        <div className="um-header-right">
          <button
            className="um-batch-btn"
            onClick={handleBatchClick}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
            </svg>
            批量发放
          </button>
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
                      <th>会员/钱包</th>
                      <th>邀请者</th>
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
                                {user.github_login && <span className="um-contact-tag um-contact-github">{user.github_login}</span>}
                                {user.wechat_name && <span className="um-contact-tag um-contact-wechat">{user.wechat_name}</span>}
                              </div>
                            </div>
                          </td>
                          <td>{renderMemberWalletCell(user)}</td>
                          <td>
                            {user.invited_by ? (
                              <div className="um-inviter-info-cell">
                                <span className="um-inviter-id">#{user.invited_by.user_id}</span>
                                <span className="um-inviter-name">{user.invited_by.username || '-'}</span>
                              </div>
                            ) : (
                              <span className="um-no-inviter">-</span>
                            )}
                          </td>
                          <td>{getUserStatusLabel(user.status)}</td>
                          <td>
                            <div className="um-login-info-cell">
                              <div 
                                className="um-relative-time" 
                                title={formatDate(user.last_login_at)}
                              >
                                {formatRelativeTime(user.last_login_at)}
                              </div>
                              {user.last_login_ip && (
                                <div className="um-ip-location-cell">
                                  <div className="um-ip-address">{user.last_login_ip}</div>
                                  {user.last_login_ip_info && (
                                    <div className="um-location-info">{user.last_login_ip_info}</div>
                                  )}
                                </div>
                              )}
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
                                className="um-action-btn um-grant-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  handleGrantClick(user);
                                }}
                                title="发放会员"
                              >
                                会员
                              </button>
                              <button
                                className="um-action-btn um-currency-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  handleCurrencyClick(user);
                                }}
                                title="发放经费/恩特币"
                              >
                                货币
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
                        <td colSpan="7" className="no-data">
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
                <li>订阅记录</li>
                <li>订单和支付记录</li>
                <li>使用配额记录</li>
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

      {/* Grant Subscription Modal */}
      {grantModal.show && (
        <div className="modal-overlay" onClick={handleGrantCancel}>
          <div className="modal-content um-grant-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>发放会员套餐</h3>
            </div>
            <div className="modal-body">
              <p>为用户 <strong>{grantModal.user?.email || grantModal.user?.username || `ID: ${grantModal.user?.id}`}</strong> 发放会员套餐</p>
              
              <div className="um-form-group">
                <label>选择套餐</label>
                <select
                  value={grantForm.planCode}
                  onChange={(e) => setGrantForm({ ...grantForm, planCode: e.target.value })}
                  className="um-form-select"
                >
                  <option value="">请选择套餐</option>
                  {subscriptionPlans.map(plan => (
                    <option key={plan.plan_code} value={plan.plan_code}>
                      {plan.plan_name} - 月付 ¥{plan.current_price_monthly} / 年付 ¥{plan.current_price_yearly}
                    </option>
                  ))}
                </select>
              </div>

              <div className="um-form-group">
                <label>计费周期</label>
                <div className="um-radio-group">
                  <label className="um-radio-label">
                    <input
                      type="radio"
                      name="billingCycle"
                      value="monthly"
                      checked={grantForm.billingCycle === 'monthly'}
                      onChange={(e) => setGrantForm({ ...grantForm, billingCycle: e.target.value })}
                    />
                    <span>月付（1个月）</span>
                  </label>
                  <label className="um-radio-label">
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

              <div className="um-form-group">
                <label>发放原因（选填）</label>
                <textarea
                  value={grantForm.reason}
                  onChange={(e) => setGrantForm({ ...grantForm, reason: e.target.value })}
                  className="um-form-textarea"
                  placeholder="例如：活动赠送、客服补偿、测试账号等"
                  rows={3}
                />
              </div>

              <div className="um-grant-info-box">
                <p className="um-info-title">📋 发放说明</p>
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
                className="modal-btn confirm-btn um-primary-btn" 
                onClick={handleGrantConfirm}
                disabled={grantLoading || !grantForm.planCode}
              >
                {grantLoading ? '发放中...' : '确认发放'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Currency Grant Modal - 发放货币弹窗 */}
      {currencyModal.show && (
        <div className="modal-overlay" onClick={handleCurrencyCancel}>
          <div className="modal-content um-currency-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>发放经费/恩特币</h3>
            </div>
            <div className="modal-body">
              <p>为用户 <strong>{currencyModal.user?.email || currencyModal.user?.username || `ID: ${currencyModal.user?.id}`}</strong> 发放货币</p>
              
              <div className="um-form-group">
                <label>货币类型</label>
                <div className="um-currency-type-selector">
                  <button
                    type="button"
                    className={`um-currency-type-btn gold ${currencyForm.currencyType === 'gold' ? 'active' : ''}`}
                    onClick={() => setCurrencyForm({ ...currencyForm, currencyType: 'gold' })}
                  >
                    <span className="um-currency-icon"><GoldIcon size="lg" /></span>
                    <span>经费</span>
                  </button>
                  <button
                    type="button"
                    className={`um-currency-type-btn diamond ${currencyForm.currencyType === 'diamond' ? 'active' : ''}`}
                    onClick={() => setCurrencyForm({ ...currencyForm, currencyType: 'diamond' })}
                  >
                    <span className="um-currency-icon"><EntcoinIcon size="lg" /></span>
                    <span>恩特币</span>
                  </button>
                </div>
              </div>

              <div className="um-form-group">
                <label>发放数量</label>
                <input
                  type="number"
                  min="1"
                  value={currencyForm.amount}
                  onChange={(e) => setCurrencyForm({ ...currencyForm, amount: e.target.value })}
                  className="um-form-input"
                  placeholder={`输入${currencyForm.currencyType === 'gold' ? '经费' : '恩特币'}数量`}
                />
              </div>

              <div className="um-form-group">
                <label>发放说明（选填）</label>
                <textarea
                  value={currencyForm.description}
                  onChange={(e) => setCurrencyForm({ ...currencyForm, description: e.target.value })}
                  className="um-form-textarea"
                  placeholder="例如：活动赠送、客服补偿、测试账号等"
                  rows={3}
                />
              </div>

              <div className="um-grant-info-box">
                <p className="um-info-title">📋 发放说明</p>
                <ul>
                  <li>发放类型为"系统赠送"，将记录在用户的交易流水中</li>
                  <li>发放后用户余额将立即增加</li>
                  <li>此操作会记录管理员信息和发放原因</li>
                </ul>
              </div>
            </div>
            <div className="modal-footer">
              <button className="modal-btn cancel-btn" onClick={handleCurrencyCancel} disabled={currencyLoading}>
                取消
              </button>
              <button 
                className="modal-btn confirm-btn um-primary-btn" 
                onClick={handleCurrencyConfirm}
                disabled={currencyLoading || !currencyForm.amount || parseInt(currencyForm.amount, 10) <= 0}
              >
                {currencyLoading ? '发放中...' : '确认发放'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Currency Distribution Modal - 批量发放弹窗 */}
      {batchModal.show && (
        <div className="modal-overlay" onClick={handleBatchCancel}>
          <div className="modal-content um-batch-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>批量发放经费/恩特币</h3>
            </div>
            <div className="modal-body">
              <div className="um-form-group">
                <label>货币类型</label>
                <div className="um-currency-type-selector">
                  <button
                    type="button"
                    className={`um-currency-type-btn gold ${batchForm.currencyType === 'gold' ? 'active' : ''}`}
                    onClick={() => setBatchForm({ ...batchForm, currencyType: 'gold' })}
                  >
                    <span className="um-currency-icon"><GoldIcon size="lg" /></span>
                    <span>经费</span>
                  </button>
                  <button
                    type="button"
                    className={`um-currency-type-btn diamond ${batchForm.currencyType === 'diamond' ? 'active' : ''}`}
                    onClick={() => setBatchForm({ ...batchForm, currencyType: 'diamond' })}
                  >
                    <span className="um-currency-icon"><EntcoinIcon size="lg" /></span>
                    <span>恩特币</span>
                  </button>
                </div>
              </div>

              <div className="um-form-group">
                <label>目标用户</label>
                <div className="um-target-type-selector">
                  <button
                    type="button"
                    className={`um-target-type-btn ${batchForm.targetType === 'all' ? 'active' : ''}`}
                    onClick={() => handleTargetTypeChange('all')}
                  >
                    全部用户
                  </button>
                  <button
                    type="button"
                    className={`um-target-type-btn ${batchForm.targetType === 'members' ? 'active' : ''}`}
                    onClick={() => handleTargetTypeChange('members')}
                  >
                    会员用户
                  </button>
                  <button
                    type="button"
                    className={`um-target-type-btn ${batchForm.targetType === 'non_members' ? 'active' : ''}`}
                    onClick={() => handleTargetTypeChange('non_members')}
                  >
                    非会员用户
                  </button>
                </div>
                <div className="um-target-preview">
                  {batchPreview.loading ? (
                    <span className="um-preview-loading">查询中...</span>
                  ) : batchPreview.userCount > 0 ? (
                    <span className="um-preview-count">
                      将向 <strong>{batchPreview.userCount}</strong> 个用户发放
                    </span>
                  ) : (
                    <span className="um-preview-hint">选择目标用户类型后查看用户数量</span>
                  )}
                </div>
              </div>

              <div className="um-form-group">
                <label>发放数量（每人）</label>
                <input
                  type="number"
                  min="1"
                  value={batchForm.amount}
                  onChange={(e) => setBatchForm({ ...batchForm, amount: e.target.value })}
                  className="um-form-input"
                  placeholder={`输入每人发放的${batchForm.currencyType === 'gold' ? '经费' : '恩特币'}数量`}
                />
                {batchForm.amount && batchPreview.userCount > 0 && (
                  <div className="um-amount-total">
                    总计发放: <strong>{parseInt(batchForm.amount, 10) * batchPreview.userCount}</strong> {batchForm.currencyType === 'gold' ? '经费' : '恩特币'}
                  </div>
                )}
              </div>

              <div className="um-form-group">
                <label>发放标题（必填，用于站内信通知）</label>
                <input
                  type="text"
                  value={batchForm.title}
                  onChange={(e) => setBatchForm({ ...batchForm, title: e.target.value })}
                  className="um-form-input"
                  placeholder="例如：新年福利发放"
                  maxLength={200}
                />
              </div>

              <div className="um-form-group">
                <label>发放说明（选填，用于站内信通知）</label>
                <textarea
                  value={batchForm.description}
                  onChange={(e) => setBatchForm({ ...batchForm, description: e.target.value })}
                  className="um-form-textarea"
                  placeholder="例如：感谢您的支持，特此发放福利"
                  rows={2}
                  maxLength={500}
                />
              </div>

              <div className="um-form-group">
                <label>备注（选填，仅管理员可见）</label>
                <textarea
                  value={batchForm.remark}
                  onChange={(e) => setBatchForm({ ...batchForm, remark: e.target.value })}
                  className="um-form-textarea"
                  placeholder="例如：2025年新年活动批量发放"
                  rows={2}
                  maxLength={500}
                />
              </div>

              <div className="um-grant-info-box um-batch-info-box">
                <p className="um-info-title">发放说明</p>
                <ul>
                  <li>批量发放会创建一个发放批次，异步执行发放任务</li>
                  <li>每个用户发放成功后会收到站内信通知</li>
                  <li>发放记录会保存在交易流水中，可追溯</li>
                  <li>发放过程中请勿重复提交</li>
                </ul>
              </div>
            </div>
            <div className="modal-footer">
              <button className="modal-btn cancel-btn" onClick={handleBatchCancel} disabled={batchLoading}>
                取消
              </button>
              <button
                className="modal-btn confirm-btn um-primary-btn"
                onClick={handleBatchConfirm}
                disabled={batchLoading || !batchForm.amount || parseInt(batchForm.amount, 10) <= 0 || !batchForm.title.trim() || batchPreview.userCount === 0}
              >
                {batchLoading ? '发放中...' : `确认发放`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
