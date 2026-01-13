/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useOutletContext } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import { useToast } from '../components/ToastContainer';
import { useOrderModal } from '../contexts/OrderModalContext';
import { useRechargeModal } from '../contexts/RechargeModalContext';
// eslint-disable-next-line no-unused-vars
import api, { orderAPI, paymentAPI, walletAPI, fundAPI } from '../services/api'; // paymentAPI 保留供将来使用
import CheckinCalendar from '../components/CheckinCalendar';
import EntcoinIcon from '../components/EntcoinIcon';
import GoldIcon from '../components/GoldIcon';
import logger from '../utils/logger';
import './styles/settings/index.css';

// 拆分出的子组件和 Hooks
import { InvitationTab, AccountTab } from './settings/tabs';
import { useInvitationData, useAccountData } from './settings/hooks';

const Settings = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated, user, logout, refreshUser } = useAuth();
  // eslint-disable-next-line no-unused-vars
  const { showSuccess, showError, showInfo } = useToast(); // showInfo 保留供将来使用
  const { openOrderModal } = useOrderModal();
  const { openRechargeModal } = useRechargeModal();
  const outletContext = useOutletContext();
  // eslint-disable-next-line no-unused-vars
  const onOpenDrawer = outletContext?.onOpenDrawer; // 保留供将来使用

  const [activeTab, setActiveTab] = useState('profile'); // profile, account, subscription, invitation
  const [loading, setLoading] = useState(false);
  // isEditingProfile 已废弃，改为 hover 原地编辑

  // Profile form state
  const [profile, setProfile] = useState({
    name: '',
    userId: '',
    bio: ''
  });

  // Account security form state
  const [accountForm, setAccountForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  // Binding form state
  const [bindPhone, setBindPhone] = useState('');
  const [bindEmail, setBindEmail] = useState('');
  const [bindPhoneCode, setBindPhoneCode] = useState('');
  const [bindEmailCode, setBindEmailCode] = useState('');
  const [phoneCodeCountdown, setPhoneCodeCountdown] = useState(0);
  const [emailCodeCountdown, setEmailCodeCountdown] = useState(0);

  // Account management - 使用提取的 hook
  const accountData = useAccountData(user);

  // Subscription state
  const [currentSubscription, setCurrentSubscription] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [subscriptionLoading, setSubscriptionLoading] = useState(false); // 保留供将来使用

  // Billing history state
  const [billingHistory, setBillingHistory] = useState([]);
  // eslint-disable-next-line no-unused-vars
  const [billingPage, setBillingPage] = useState(1); // 保留供将来分页使用
  const [billingTotal, setBillingTotal] = useState(0);
  const [billingLoading, setBillingLoading] = useState(false);

  // Wallet state - 钱包状态
  const [wallet, setWallet] = useState(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [transactionPage, setTransactionPage] = useState(1);
  const [transactionTotal, setTransactionTotal] = useState(0);
  const [transactionLoading, setTransactionLoading] = useState(false);
  const [transactionFilter, setTransactionFilter] = useState('all'); // all, gold, diamond
  const [transactionBizFilter, setTransactionBizFilter] = useState('all'); // all, daily_checkin, register_gift, etc.
  const [transactionDateRange, setTransactionDateRange] = useState({ start: '', end: '' });
  // eslint-disable-next-line no-unused-vars
  const [transactionStats, setTransactionStats] = useState({ totalIncome: 0, totalExpense: 0 }); // 保留供将来统计使用
  // eslint-disable-next-line no-unused-vars
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false); // 保留供将来高级筛选使用

  // Exchange state - 兑换状态
  const [exchangeRate, setExchangeRate] = useState(100); // 1恩特币=100经费
  const [exchangeAmount, setExchangeAmount] = useState('');
  const [exchangeLoading, setExchangeLoading] = useState(false);
  const [showExchangeModal, setShowExchangeModal] = useState(false);
  const [, setRechargeInfo] = useState(null); // 充值信息暂未在UI中使用

  // 当月基金状态
  const [currentFund, setCurrentFund] = useState(null);
  const [fundLoading, setFundLoading] = useState(true);

  // Records tab state - 流水/账单切换
  // eslint-disable-next-line no-unused-vars
  const [recordsTab, setRecordsTab] = useState('transactions'); // 'transactions' or 'orders' - 保留供将来使用

  // 业务显示信息（用于交易流水动态展示）
  const [bizDisplayInfos, setBizDisplayInfos] = useState({});

  // Invitation state - 使用提取的 hook
  const invitationData = useInvitationData();

  // Handle URL parameters for WeChat/GitHub binding feedback and tab switching
  useEffect(() => {
    const tab = searchParams.get('tab');
    const wechatBindStatus = searchParams.get('wechat_bind_status');
    const githubBindStatus = searchParams.get('github_bind_status');
    const message = searchParams.get('message');

    // Switch to specified tab if provided
    if (tab && ['profile', 'account', 'subscription', 'invitation'].includes(tab)) {
      setActiveTab(tab);
    }

    // Show WeChat binding feedback
    if (wechatBindStatus && message) {
      if (wechatBindStatus === 'success') {
        showSuccess(message);
      } else if (wechatBindStatus === 'error') {
        showError(message);
      }

      // Clean up URL parameters after showing toast
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('wechat_bind_status');
      newParams.delete('message');
      newParams.delete('tab');
      setSearchParams(newParams);
    }

    // Show GitHub binding feedback
    if (githubBindStatus && message) {
      if (githubBindStatus === 'success') {
        showSuccess(message);
        // Refresh user profile to show updated GitHub binding
        fetchUserProfile();
      } else if (githubBindStatus === 'error') {
        showError(message);
      }

      // Clean up URL parameters after showing toast
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('github_bind_status');
      newParams.delete('message');
      newParams.delete('tab');
      setSearchParams(newParams);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, setSearchParams, showSuccess, showError]);

  useEffect(() => {
    // Allow authenticated users to stay on this page
    // No redirect needed - if not authenticated, they can still view the page structure
    if (isAuthenticated) {
      fetchUserProfile();
      fetchSubscriptionData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  useEffect(() => {
    if (activeTab === 'subscription') {
      fetchSubscriptionData();
      fetchBillingHistory(1);
      fetchWalletData();
      fetchTransactions(1);
      fetchExchangeInfo();
      fetchBizDisplayInfos(); // 获取业务显示信息
      fetchCurrentFund(); // 获取当月基金
    } else if (activeTab === 'invitation') {
      invitationData.fetchInvitationData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);


  // Countdown for phone code
  useEffect(() => {
    if (phoneCodeCountdown > 0) {
      const timer = setTimeout(() => setPhoneCodeCountdown(phoneCodeCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [phoneCodeCountdown]);

  // Countdown for email code
  useEffect(() => {
    if (emailCodeCountdown > 0) {
      const timer = setTimeout(() => setEmailCodeCountdown(emailCodeCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [emailCodeCountdown]);

  // modalCodeCountdown 的倒计时已移至 useAccountData hook

  // 切换 Tab 时同步更新 URL 参数
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const fetchUserProfile = async () => {
    try {
      // Call refreshUser to get latest data from backend
      const userData = await refreshUser();
      if (userData) {
        setProfile({
          name: userData.username || userData.email || '',
          userId: userData.id || '',
          bio: userData.bio || ''
        });
      } else if (user) {
        // Fallback to cached user data
        setProfile({
          name: user.username || user.email || '',
          userId: user.id || '',
          bio: user.bio || ''
        });
      }
    } catch (error) {
      logger.error('Failed to fetch user profile:', error);
    }
  };

  // 设置账号管理成功后的回调
  useEffect(() => {
    accountData.setOnSuccess(fetchUserProfile);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountData.setOnSuccess]);

  const fetchSubscriptionData = async () => {
    try {
      setSubscriptionLoading(true);

      // Fetch current subscription only
      const subResponse = await api.get('/user/subscription/my');
      if (subResponse.data.code === 0) {
        setCurrentSubscription(subResponse.data.data);
      }
    } catch (error) {
      logger.error('Failed to fetch subscription data:', error);
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const fetchBillingHistory = async (page = 1) => {
    try {
      setBillingLoading(true);
      const response = await orderAPI.getBillingHistory(page, 10);
      if (response.data.code === 0) {
        setBillingHistory(response.data.data.orders || []);
        setBillingTotal(response.data.data.total || 0);
        setBillingPage(page);
      }
    } catch (error) {
      logger.error('Failed to fetch billing history:', error);
      showError('获取历史账单失败');
    } finally {
      setBillingLoading(false);
    }
  };

  // 获取钱包数据
  const fetchWalletData = async () => {
    try {
      setWalletLoading(true);
      const response = await walletAPI.getWallet();
      if (response.data.code === 0) {
        setWallet(response.data.data);
      }
    } catch (error) {
      logger.error('Failed to fetch wallet:', error);
    } finally {
      setWalletLoading(false);
    }
  };

  // 获取当月基金
  const fetchCurrentFund = async () => {
    try {
      setFundLoading(true);
      const response = await fundAPI.getCurrentFund();
      if (response.data?.code === 0 && response.data?.data) {
        setCurrentFund(response.data.data);
      }
    } catch (error) {
      logger.error('Failed to fetch current fund:', error);
    } finally {
      setFundLoading(false);
    }
  };

  // 获取交易流水
  const fetchTransactions = async (page = 1, filters = {}) => {
    try {
      setTransactionLoading(true);
      const currencyType = filters.currencyType ?? transactionFilter;
      const bizType = filters.bizType ?? transactionBizFilter;
      const dateRange = filters.dateRange ?? transactionDateRange;
      
      const params = { page, pageSize: 10 };
      if (currencyType !== 'all') {
        params.currencyType = currencyType;
      }
      if (bizType !== 'all') {
        params.bizType = bizType; // 使用 biz_type 筛选业务类型
      }
      if (dateRange.start) {
        params.startTime = dateRange.start + ' 00:00:00';
      }
      if (dateRange.end) {
        params.endTime = dateRange.end + ' 23:59:59';
      }
      
      const response = await walletAPI.getTransactions(params);
      if (response.data.code === 0) {
        const txList = response.data.data.transactions || [];
        setTransactions(txList);
        setTransactionTotal(response.data.data.total || 0);
        setTransactionPage(page);
        
        // 计算统计数据
        let totalIncome = 0;
        let totalExpense = 0;
        txList.forEach(tx => {
          if (tx.amount >= 0) {
            totalIncome += tx.amount;
          } else {
            totalExpense += Math.abs(tx.amount);
          }
        });
        setTransactionStats({ totalIncome, totalExpense });
      }
    } catch (error) {
      logger.error('Failed to fetch transactions:', error);
    } finally {
      setTransactionLoading(false);
    }
  };

  // 切换货币类型筛选 - 保留供将来使用
  // eslint-disable-next-line no-unused-vars
  const handleTransactionFilterChange = (filter) => {
    setTransactionFilter(filter);
    fetchTransactions(1, { currencyType: filter });
  };

  // 切换业务类型筛选 - 保留供将来使用
  // eslint-disable-next-line no-unused-vars
  const handleBizFilterChange = (bizType) => {
    setTransactionBizFilter(bizType);
    fetchTransactions(1, { bizType });
  };

  // 切换时间范围筛选 - 保留供将来使用
  // eslint-disable-next-line no-unused-vars
  const handleDateRangeChange = (field, value) => {
    const newRange = { ...transactionDateRange, [field]: value };
    setTransactionDateRange(newRange);
    fetchTransactions(1, { dateRange: newRange });
  };

  // 清除筛选条件 - 保留供将来使用
  // eslint-disable-next-line no-unused-vars
  const handleClearFilters = () => {
    setTransactionFilter('all');
    setTransactionBizFilter('all');
    setTransactionDateRange({ start: '', end: '' });
    fetchTransactions(1, { currencyType: 'all', bizType: 'all', dateRange: { start: '', end: '' } });
  };

  // 获取兑换和充值信息
  const fetchExchangeInfo = async () => {
    try {
      const [exchangeRes, rechargeRes] = await Promise.all([
        walletAPI.getExchangeInfo(),
        walletAPI.getRechargeInfo()
      ]);
      if (exchangeRes.data.code === 0) {
        setExchangeRate(exchangeRes.data.data.diamond_to_gold_rate || 100);
      }
      if (rechargeRes.data.code === 0) {
        setRechargeInfo(rechargeRes.data.data);
      }
    } catch (error) {
      logger.error('Failed to fetch exchange info:', error);
    }
  };

  // 获取业务显示信息
  const fetchBizDisplayInfos = async () => {
    try {
      const response = await walletAPI.getBizDisplayInfos();
      if (response.data.code === 0) {
        setBizDisplayInfos(response.data.data || {});
      }
    } catch (error) {
      logger.error('Failed to fetch biz display infos:', error);
    }
  };

  // 执行恩特币兑换经费
  const handleExchange = async () => {
    const amount = parseInt(exchangeAmount, 10);
    if (!amount || amount <= 0) {
      showError('请输入有效的兑换数量');
      return;
    }
    if (amount > (wallet?.diamond || 0)) {
      showError('恩特币余额不足');
      return;
    }

    try {
      setExchangeLoading(true);
      const response = await walletAPI.exchangeDiamondToGold(amount);
      if (response.data.code === 0) {
        const { gold_received, current_gold, current_diamond } = response.data.data;
        setWallet(prev => ({
          ...prev,
          gold: current_gold,
          diamond: current_diamond
        }));
        showSuccess(`兑换成功！获得 ${gold_received} 经费`);
        setShowExchangeModal(false);
        setExchangeAmount('');
        // 刷新交易记录
        fetchTransactions(1, transactionFilter);
      } else {
        showError(response.data.message || '兑换失败');
      }
    } catch (error) {
      logger.error('Exchange failed:', error);
      showError(error.response?.data?.message || '兑换失败，请稍后重试');
    } finally {
      setExchangeLoading(false);
    }
  };

  // 邀请相关函数已移至 useInvitationData hook

  const handleLogout = () => {
    logout();
    navigate('/');
  };


  // handleProfileSave 已废弃，改为使用 handleSaveName 和 handleSaveBio 进行原地编辑

  // 保留供将来使用
  // eslint-disable-next-line no-unused-vars
  const handlePasswordChange = async () => {
    if (accountForm.newPassword !== accountForm.confirmPassword) {
      showError('两次输入的密码不一致');
      return;
    }

    if (accountForm.newPassword.length < 8) {
      showError('新密码长度至少为8个字符');
      return;
    }

    setLoading(true);

    try {
      const response = await api.post('/user/change-password', {
        current_password: accountForm.currentPassword,
        new_password: accountForm.newPassword
      });

      if (response.data.code === 0) {
        showSuccess('密码修改成功');
        setAccountForm({
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        });
      } else {
        showError('密码修改失败：' + response.data.message);
      }
    } catch (error) {
      showError('密码修改失败,请稍后重试');
      logger.error('Failed to change password:', error);
    } finally {
      setLoading(false);
    }
  };

  // Send phone verification code - 保留供将来使用
  // eslint-disable-next-line no-unused-vars
  const handleSendPhoneCode = async () => {
    if (!bindPhone || !/^1[3-9]\d{9}$/.test(bindPhone)) {
      showError('请输入有效的手机号码');
      return;
    }

    if (phoneCodeCountdown > 0) return;

    setLoading(true);

    try {
      const response = await api.post('/user/send-phone-code', {
        phone: bindPhone,
        purpose: 'bind'
      });

      if (response.data.code === 0) {
        setPhoneCodeCountdown(60);
        showSuccess('验证码已发送');
      } else {
        showError('发送验证码失败：' + response.data.message);
      }
    } catch (error) {
      showError('发送验证码失败,请稍后重试');
      logger.error('Failed to send phone code:', error);
    } finally {
      setLoading(false);
    }
  };

  // Send email verification code - 保留供将来使用
  // eslint-disable-next-line no-unused-vars
  const handleSendEmailCode = async () => {
    if (!bindEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bindEmail)) {
      showError('请输入有效的邮箱地址');
      return;
    }

    if (emailCodeCountdown > 0) return;

    setLoading(true);

    try {
      const response = await api.post('/user/send-code', {
        email: bindEmail,
        purpose: 'bind'
      });

      if (response.data.code === 0) {
        setEmailCodeCountdown(60);
        showSuccess('验证码已发送');
      } else {
        showError('发送验证码失败：' + response.data.message);
      }
    } catch (error) {
      showError('发送验证码失败,请稍后重试');
      logger.error('Failed to send email code:', error);
    } finally {
      setLoading(false);
    }
  };

  // Bind phone - 保留供将来使用
  // eslint-disable-next-line no-unused-vars
  const handleBindPhone = async () => {
    if (!bindPhone || !/^1[3-9]\d{9}$/.test(bindPhone)) {
      showError('请输入有效的手机号码');
      return;
    }

    if (!bindPhoneCode) {
      showError('请输入验证码');
      return;
    }

    setLoading(true);

    try {
      const response = await api.post('/user/bind-phone', {
        phone: bindPhone,
        code: bindPhoneCode
      });

      if (response.data.code === 0) {
        showSuccess('手机号绑定成功');
        setBindPhone('');
        setBindPhoneCode('');
        // Refresh user profile
        fetchUserProfile();
      } else {
        showError('绑定失败：' + response.data.message);
      }
    } catch (error) {
      showError('绑定失败,请稍后重试');
      logger.error('Failed to bind phone:', error);
    } finally {
      setLoading(false);
    }
  };

  // Bind email - 保留供将来使用
  // eslint-disable-next-line no-unused-vars
  const handleBindEmail = async () => {
    if (!bindEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bindEmail)) {
      showError('请输入有效的邮箱地址');
      return;
    }

    if (!bindEmailCode) {
      showError('请输入验证码');
      return;
    }

    setLoading(true);

    try {
      const response = await api.post('/user/bind-email', {
        email: bindEmail,
        code: bindEmailCode
      });

      if (response.data.code === 0) {
        showSuccess('邮箱绑定成功');
        setBindEmail('');
        setBindEmailCode('');
        // Refresh user profile
        fetchUserProfile();
      } else {
        showError('绑定失败：' + response.data.message);
      }
    } catch (error) {
      showError('绑定失败,请稍后重试');
      logger.error('Failed to bind email:', error);
    } finally {
      setLoading(false);
    }
  };

  // 账号管理相关函数已移至 useAccountData hook

  // 名字编辑状态
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState('');

  // 简介编辑状态
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [editingBio, setEditingBio] = useState('');

  // 保存名字
  const handleSaveName = async () => {
    if (editingName === profile.name) {
      setIsEditingName(false);
      return;
    }
    try {
      setLoading(true);
      await api.put('/user/profile', { name: editingName });
      setProfile({ ...profile, name: editingName });
      setIsEditingName(false);
      showSuccess('名字已更新');
      refreshUser();
    } catch (error) {
      logger.error('Failed to save name:', error);
      showError('保存失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  // 保存简介
  const handleSaveBio = async () => {
    if (editingBio === profile.bio) {
      setIsEditingBio(false);
      return;
    }
    try {
      setLoading(true);
      await api.put('/user/profile', { bio: editingBio });
      setProfile({ ...profile, bio: editingBio });
      setIsEditingBio(false);
      showSuccess('简介已更新');
    } catch (error) {
      logger.error('Failed to save bio:', error);
      showError('保存失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const renderProfileTab = () => (
    <div className="settings-section">
      <div className="profile-header">
        <h2>个人资料</h2>
      </div>

      {/* 个人资料卡片 */}
      <div className="profile-card">
        <div className="profile-card-header">
          {/* 左侧：头像 + 用户名 */}
          <div className="profile-header-left">
            <div className="avatar-wrapper">
              <div className="avatar-circle">
                {profile.name ? profile.name.charAt(0).toUpperCase() : 'U'}
              </div>
            </div>
            {/* 名字 - hover显示编辑 */}
            <div
              className={`profile-name-wrapper ${isEditingName ? 'editing' : ''}`}
              onClick={() => {
                if (!isEditingName) {
                  setEditingName(profile.name || '');
                  setIsEditingName(true);
                }
              }}
            >
              {isEditingName ? (
                <div className="inline-edit-name">
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    placeholder="输入名字"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveName();
                      if (e.key === 'Escape') setIsEditingName(false);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button className="inline-save-btn" onClick={(e) => { e.stopPropagation(); handleSaveName(); }} disabled={loading}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </button>
                  <button className="inline-cancel-btn" onClick={(e) => { e.stopPropagation(); setIsEditingName(false); }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              ) : (
                <>
                  <h3 className="profile-name">{profile.name || '未设置名字'}</h3>
                  <span className="edit-hint">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 20h9"/>
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                    </svg>
                  </span>
                </>
              )}
            </div>
          </div>
          {/* 右侧：会员身份 + 管理按钮 */}
          <div className="profile-header-right">
            <span className={`membership-badge ${currentSubscription?.plan_code || 'free'}`}>
              {currentSubscription?.plan_name || 'FREE'}
            </span>
            <button
              className="membership-manage-btn"
              onClick={() => handleTabChange('subscription')}
            >
              管理
            </button>
          </div>
        </div>

        {/* 个人简介 - hover显示编辑 */}
        <div
          className={`profile-bio-wrapper ${isEditingBio ? 'editing' : ''}`}
          onClick={() => {
            if (!isEditingBio) {
              setEditingBio(profile.bio || '');
              setIsEditingBio(true);
            }
          }}
        >
          {isEditingBio ? (
            <div className="inline-edit-bio">
              <textarea
                value={editingBio}
                onChange={(e) => setEditingBio(e.target.value)}
                placeholder="介绍一下自己..."
                rows="3"
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
              <div className="inline-edit-actions">
                <button className="inline-save-btn" onClick={(e) => { e.stopPropagation(); handleSaveBio(); }} disabled={loading}>
                  {loading ? '保存中...' : '保存'}
                </button>
                <button className="inline-cancel-btn" onClick={(e) => { e.stopPropagation(); setIsEditingBio(false); }}>
                  取消
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="profile-bio-label">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="17" y1="10" x2="3" y2="10"/>
                  <line x1="21" y1="6" x2="3" y2="6"/>
                  <line x1="21" y1="14" x2="3" y2="14"/>
                  <line x1="17" y1="18" x2="3" y2="18"/>
                </svg>
                <span>简介</span>
              </div>
              <p className="profile-bio-text">
                {profile.bio || <span className="empty-value">点击添加个人简介...</span>}
              </p>
              <span className="edit-hint bio-edit-hint">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 20h9"/>
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                </svg>
                编辑
              </span>
            </>
          )}
        </div>
      </div>

      {/* 签到日历 */}
      <CheckinCalendar />
    </div>
  );

  // renderAccountTab 已移至 AccountTab 组件
  // renderInvitationTab 已移至 InvitationTab 组件

  const renderSubscriptionTab = () => {
    // 获取交易类型标签
    const getTransactionTypeLabel = (type) => {
      const labels = {
        recharge: '充值',
        deduct: '消费',
        refund: '退款',
        reward: '奖励',
        gift: '赠送'
      };
      return labels[type] || type;
    };

    // 获取业务类型标签（优先使用动态配置）
    const getBizTypeLabel = (bizType) => {
      // 先从动态配置中获取
      if (bizDisplayInfos[bizType]?.display_name) {
        return bizDisplayInfos[bizType].display_name;
      }
      // 降级使用静态映射
      const labels = {
        register_gift: '注册赠送',
        daily_checkin: '每日签到',
        invite_reward: '邀请奖励',
        invite_milestone: '邀请里程碑奖励',
        membership_gift: '会员赠送',
        diamond_exchange: '恩特币兑换经费',
        diamond_to_gold: '恩特币兑换经费',
        diamond_recharge: '恩特币充值',
        peer_review: '智能审稿',
        ai_chat_low: 'AI聊天',
        ai_chat_mid: 'AI聊天',
        ai_chat_high: 'AI聊天',
        paper_analysis: '多维度分析',
        smart_analysis_low: '智能分析',
        smart_analysis_mid: '智能分析',
        smart_analysis_high: '智能分析',
        admin_recharge: '管理员充值',
        admin_deduct: '管理员扣除',
        expired_clear: '过期清空',
        refund: '退款'
      };
      return labels[bizType] || bizType || '其他';
    };

    // 获取业务类型备注（用于交易描述）
    const getBizTypeRemark = (bizType) => {
      // 先从动态配置中获取
      if (bizDisplayInfos[bizType]?.display_remark) {
        return bizDisplayInfos[bizType].display_remark;
      }
      return null;
    };

    return (
      <div className="settings-section subscription-section">
        <h2>资产管理</h2>

        {/* 主卡片 - 根据会员等级变色 */}
        <div className={`am-card ${currentSubscription?.plan_code || 'free'}`}>
          {/* 会员行 - 点击开通会员弹窗，已是会员则跳转管理页面 */}
          <div className="am-row am-member-row" onClick={() => {
            if (currentSubscription?.plan_code === 'free') {
              // 免费用户，打开弹窗选择套餐
              openOrderModal({ mode: 'subscription' });
            } else {
              // 已是会员，跳转到价格页面管理
              navigate('/pricing');
            }
          }}>
            <span className={`am-badge ${currentSubscription?.plan_code || 'free'}`}>
              {currentSubscription?.plan_name || 'FREE'}
            </span>
            <span className="am-text">
              {currentSubscription?.plan_code === 'free' 
                ? '开通会员享基金福利' 
                : currentSubscription?.end_date 
                  ? `${new Date(currentSubscription.end_date).toLocaleDateString('zh-CN')} 到期`
                  : '会员生效中'}
            </span>
            <span className="am-action">{currentSubscription?.plan_code === 'free' ? '开通' : '管理'}</span>
          </div>

          {/* 钱包和基金左右布局 */}
          <div className="am-wallet-fund-row">
            {/* 左侧：钱包（上下布局） */}
            <div className="am-wallet-section">
              <div className="am-wallet-item">
                <div className="am-wallet-left">
                  <span className="am-bal-icon"><EntcoinIcon size="lg" /></span>
                  <div className="am-bal-info">
                    <span className="am-bal-label">恩特币</span>
                    <span className="am-bal-num">{walletLoading ? '-' : (wallet?.diamond || 0)}</span>
                  </div>
                </div>
                <button className="am-btn primary" onClick={() => openRechargeModal(() => fetchWalletData())}>充值</button>
              </div>
              <div className="am-wallet-item">
                <div className="am-wallet-left">
                  <span className="am-bal-icon"><GoldIcon size="lg" /></span>
                  <div className="am-bal-info">
                    <span className="am-bal-label">经费</span>
                    <span className="am-bal-num">{walletLoading ? '-' : (wallet?.gold || 0)}</span>
                  </div>
                </div>
                <button className="am-btn" onClick={() => setShowExchangeModal(true)} disabled={!wallet?.diamond}>兑换</button>
              </div>
            </div>

            {/* 右侧：当月基金 */}
            <div className="am-fund-section" onClick={() => navigate('/fund-center')}>
              <div className="am-fund-header">
                <span className="am-fund-title">
                  {currentFund ? '本月基金' : '会员福利'}
                </span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </div>
              {fundLoading ? (
                <div className="am-fund-loading">
                  <div className="spinner small"></div>
                </div>
              ) : currentFund ? (
                <div className="am-fund-content">
                  <div className="am-fund-name">{currentFund.fund_name}</div>
                  <div className="am-fund-table">
                    {currentFund.pro_gold_amount > 0 && (
                      <div className="am-fund-row">
                        <span className="am-fund-badge pro">PRO</span>
                        <div className="am-fund-rewards">
                          <span className="am-fund-reward"><GoldIcon size="sm" /><span>+{currentFund.pro_gold_amount}</span></span>
                        </div>
                      </div>
                    )}
                    {currentFund.max_gold_amount > 0 && (
                      <div className="am-fund-row">
                        <span className="am-fund-badge max">MAX</span>
                        <div className="am-fund-rewards">
                          <span className="am-fund-reward"><GoldIcon size="sm" /><span>+{currentFund.max_gold_amount}</span></span>
                          {currentFund.max_diamond_amount > 0 && (
                            <span className="am-fund-reward"><EntcoinIcon size="sm" /><span>+{currentFund.max_diamond_amount}</span></span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="am-fund-default">
                  <div className="am-fund-table">
                    <div className="am-fund-row">
                      <span className="am-fund-badge pro">PRO</span>
                      <div className="am-fund-rewards">
                        <span className="am-fund-reward"><GoldIcon size="sm" /><span>+5000</span></span>
                      </div>
                      <span className="am-fund-period">/月</span>
                    </div>
                    <div className="am-fund-row">
                      <span className="am-fund-badge max">MAX</span>
                      <div className="am-fund-rewards">
                        <span className="am-fund-reward"><GoldIcon size="sm" /><span>+10000</span></span>
                        <span className="am-fund-reward"><EntcoinIcon size="sm" /><span>+6</span></span>
                      </div>
                      <span className="am-fund-period">/月</span>
                    </div>
                  </div>
                  <div className="am-fund-tip">开通会员每月领取</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 流水与账单 - 左右分栏 */}
        <div className="am-records-split">
          {/* 左侧 - 交易流水 */}
          <div className="am-records-column am-transactions-column">
            <div className="am-column-header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
              <span>交易流水</span>
              {transactions.length > 0 && <span className="am-column-count">{transactionTotal}笔</span>}
            </div>
            <div className="am-column-content">
              {transactionLoading ? (
                <div className="am-column-loading">
                  <div className="spinner"></div>
                </div>
              ) : transactions.length > 0 ? (
                <>
                  <div className="am-transaction-list">
                    {transactions.map((tx, index) => (
                      <div key={tx.id} className={`am-tx-row ${tx.amount >= 0 ? 'income' : 'expense'}`}>
                        <div className="am-tx-left">
                          <div className="am-tx-icon">
                            {tx.currency_type === 'gold' ? <GoldIcon size="md" /> : <EntcoinIcon size="md" />}
                          </div>
                          <div className="am-tx-detail">
                            <span className="am-tx-name">
                              {tx.biz_type?.startsWith('fund_') 
                                ? (tx.description?.split(' - ')[0] || '基金赠送') 
                                : getBizTypeLabel(tx.biz_type)}
                            </span>
                            <span className="am-tx-remark">
                              {tx.biz_type?.startsWith('fund_') 
                                ? (tx.description || '会员福利发放')
                                : (getBizTypeRemark(tx.biz_type) || tx.description || getTransactionTypeLabel(tx.transaction_type))}
                            </span>
                            <span className="am-tx-meta">
                              {new Date(tx.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                        <div className="am-tx-right">
                          <span className={`am-tx-value ${tx.amount >= 0 ? 'plus' : 'minus'}`}>
                            {tx.amount >= 0 ? '+' : ''}{tx.amount.toLocaleString()}
                          </span>
                          <span className="am-tx-balance">余{tx.balance_after.toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {transactionTotal > 10 && (
                    <div className="am-column-pagination">
                      <button disabled={transactionPage === 1} onClick={() => fetchTransactions(transactionPage - 1)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="15 18 9 12 15 6"/>
                        </svg>
                      </button>
                      <span>{transactionPage}/{Math.ceil(transactionTotal / 10)}</span>
                      <button disabled={transactionPage >= Math.ceil(transactionTotal / 10)} onClick={() => fetchTransactions(transactionPage + 1)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="9 18 15 12 9 6"/>
                        </svg>
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="am-column-empty">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                  </svg>
                  <p>暂无交易记录</p>
                </div>
              )}
            </div>
          </div>

          {/* 右侧 - 历史账单 */}
          <div className="am-records-column am-billing-column">
            <div className="am-column-header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                <line x1="1" y1="10" x2="23" y2="10"/>
              </svg>
              <span>历史账单</span>
              {billingHistory.length > 0 && <span className="am-column-count">{billingTotal}笔</span>}
            </div>
            <div className="am-column-content">
              {billingLoading ? (
                <div className="am-column-loading">
                  <div className="spinner"></div>
                </div>
              ) : billingHistory.length > 0 ? (
                <div className="am-billing-list">
                  {billingHistory.map((order) => (
                    <div key={order.id} className="am-bill-row">
                      <div className="am-bill-left">
                        <div className="am-bill-icon-wrap">
                          {order.order_type === 'recharge' ? (
                            <EntcoinIcon size="md" />
                          ) : (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2">
                              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                              <path d="M2 17l10 5 10-5"/>
                              <path d="M2 12l10 5 10-5"/>
                            </svg>
                          )}
                        </div>
                        <div className="am-bill-detail">
                          <span className="am-bill-title">
                            {order.order_type === 'recharge' ? '恩特币充值' : `${order.plan_name}会员`}
                          </span>
                          <span className="am-bill-meta">
                            {new Date(order.payment_time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            {order.order_type !== 'recharge' && (
                              <>
                                <span className="am-bill-sep">·</span>
                                {order.billing_cycle === 'monthly' ? '月付' : '年付'}
                              </>
                            )}
                          </span>
                        </div>
                      </div>
                      <div className="am-bill-right">
                        <span className="am-bill-price">¥{order.final_amount.toFixed(2)}</span>
                        <span className={`am-bill-status ${order.status}`}>
                          {order.status === 'paid' ? '已支付' : order.status === 'pending' ? '待支付' : '已取消'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="am-column-empty">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                    <line x1="1" y1="10" x2="23" y2="10"/>
                  </svg>
                  <p>暂无订单记录</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Exchange Modal - 兑换弹窗 */}
        {showExchangeModal && (
          <div className="modal-overlay" onClick={() => setShowExchangeModal(false)}>
            <div className="exchange-modal" onClick={e => e.stopPropagation()}>
              <div className="exchange-modal-header">
                <h3>恩特币兑换经费</h3>
                <button className="modal-close" onClick={() => setShowExchangeModal(false)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
              <div className="exchange-modal-body">
                <div className="exchange-notice">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="16" x2="12" y2="12"/>
                    <line x1="12" y1="8" x2="12.01" y2="8"/>
                  </svg>
                  <span>恩特币可兑换经费，但经费无法兑换恩特币</span>
                </div>
                <div className="exchange-rate-info">
                  <span className="rate-label">兑换比例</span>
                  <span className="rate-value">1 恩特币 = {exchangeRate} 经费</span>
                </div>
                <div className="exchange-balance">
                  <span>当前恩特币余额: <strong>{wallet?.diamond || 0}</strong></span>
                </div>
                <div className="exchange-input-group">
                  <label>兑换数量</label>
                  <div className="exchange-input-wrapper">
                    <input
                      type="number"
                      min="1"
                      max={wallet?.diamond || 0}
                      value={exchangeAmount}
                      onChange={e => setExchangeAmount(e.target.value)}
                      placeholder="输入恩特币数量"
                    />
                    <button 
                      className="exchange-max-btn"
                      onClick={() => setExchangeAmount(String(wallet?.diamond || 0))}
                    >
                      全部
                    </button>
                  </div>
                </div>
                {exchangeAmount && parseInt(exchangeAmount, 10) > 0 && (
                  <div className="exchange-preview">
                    <span className="preview-label">预计获得</span>
                    <span className="preview-value">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="#f59e0b">
                        <circle cx="12" cy="12" r="10"/>
                      </svg>
                      {parseInt(exchangeAmount, 10) * exchangeRate} 经费
                    </span>
                  </div>
                )}
              </div>
              <div className="exchange-modal-footer">
                <button 
                  className="btn-cancel"
                  onClick={() => setShowExchangeModal(false)}
                >
                  取消
                </button>
                <button 
                  className="btn-confirm"
                  onClick={handleExchange}
                  disabled={exchangeLoading || !exchangeAmount || parseInt(exchangeAmount, 10) <= 0 || parseInt(exchangeAmount, 10) > (wallet?.diamond || 0)}
                >
                  {exchangeLoading ? '兑换中...' : '确认兑换'}
                </button>
              </div>
            </div>
          </div>
        )}



      </div>
    );
  };

  const renderExternalLinks = () => null;

  const renderLogoutSection = () => (
    <div className="settings-section logout-section">
      <button className="btn-logout" onClick={handleLogout}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        <span>注销登录</span>
      </button>
    </div>
  );

  return (
    <div className="settings-page">
      <div className="settings-container">
        <div className="settings-layout">
          {/* Left Sidebar */}
          <div className="settings-sidebar">
            <div className="settings-title-row">
              <h1 className="settings-title">设置</h1>
            </div>

            <div className="settings-menu">
              <div className="menu-section">
                <div className="menu-section-title">我的账户</div>
                <button
                  className={`menu-item ${activeTab === 'profile' ? 'active' : ''}`}
                  onClick={() => handleTabChange('profile')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                  <span>个人资料</span>
                </button>
                <button
                  className={`menu-item ${activeTab === 'subscription' ? 'active' : ''}`}
                  onClick={() => handleTabChange('subscription')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="8" width="18" height="12" rx="2" ry="2"/>
                    <path d="M3 8v-2a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  <span>资产管理</span>
                </button>
                <button
                  className={`menu-item ${activeTab === 'invitation' ? 'active' : ''}`}
                  onClick={() => handleTabChange('invitation')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                  <span>邀请推广</span>
                </button>
                <button
                  className={`menu-item ${activeTab === 'account' ? 'active' : ''}`}
                  onClick={() => handleTabChange('account')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M12 1v6m0 6v6M5.64 5.64l4.24 4.24m4.24 4.24l4.24 4.24M1 12h6m6 0h6M5.64 18.36l4.24-4.24m4.24-4.24l4.24-4.24"/>
                  </svg>
                  <span>授权管理</span>
                </button>
              </div>

              {renderExternalLinks()}
              {renderLogoutSection()}
            </div>
          </div>

          {/* Right Content */}
          <div className="settings-content">
            {activeTab === 'profile' && renderProfileTab()}
            {activeTab === 'subscription' && renderSubscriptionTab()}
            {activeTab === 'invitation' && (
              <InvitationTab
                invitation={invitationData.invitation}
                invitees={invitationData.invitees}
                invitationLoading={invitationData.invitationLoading}
                copySuccess={invitationData.copySuccess}
                generateInvitation={invitationData.generateInvitation}
                copyToClipboard={invitationData.copyToClipboard}
                getInvitationUrl={invitationData.getInvitationUrl}
              />
            )}
            {activeTab === 'account' && (
              <AccountTab
                user={user}
                loading={accountData.loading}
                accountModal={accountData.accountModal}
                setAccountModal={accountData.setAccountModal}
                modalForm={accountData.modalForm}
                setModalForm={accountData.setModalForm}
                modalCodeCountdown={accountData.modalCodeCountdown}
                getLoginMethodCount={accountData.getLoginMethodCount}
                handleOpenModal={accountData.handleOpenModal}
                handleCloseModal={accountData.handleCloseModal}
                handleBindWeChat={accountData.handleBindWeChat}
                handleBindGitHub={accountData.handleBindGitHub}
                handleCheckAvailability={accountData.handleCheckAvailability}
                handleSendModalCode={accountData.handleSendModalCode}
                handleSendUnbindCode={accountData.handleSendUnbindCode}
                handleModalSubmit={accountData.handleModalSubmit}
              />
            )}
          </div>
        </div>
      </div>

      {/* Mobile Bottom Tab Bar */}
      <div className="settings-mobile-tabs">
        <button
          className={`mobile-tab-item ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => handleTabChange('profile')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <span>资料</span>
        </button>
        <button
          className={`mobile-tab-item ${activeTab === 'subscription' ? 'active' : ''}`}
          onClick={() => handleTabChange('subscription')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="8" width="18" height="12" rx="2" ry="2"/>
            <path d="M3 8v-2a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>资产</span>
        </button>
        <button
          className={`mobile-tab-item ${activeTab === 'invitation' ? 'active' : ''}`}
          onClick={() => handleTabChange('invitation')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <span>邀请</span>
        </button>
        <button
          className={`mobile-tab-item ${activeTab === 'account' ? 'active' : ''}`}
          onClick={() => handleTabChange('account')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 1v6m0 6v6M5.64 5.64l4.24 4.24m4.24 4.24l4.24 4.24M1 12h6m6 0h6M5.64 18.36l4.24-4.24m4.24-4.24l4.24-4.24"/>
          </svg>
          <span>授权</span>
        </button>
      </div>
    </div>
  );
};

export default Settings;
