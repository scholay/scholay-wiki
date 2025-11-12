import React, { useState, useEffect } from 'react';
import { adminAPI } from '../services/api';
import { showToast } from './Toast';
import './UserDetailDrawer.css';

const UserDetailDrawer = ({ userId, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    if (userId) {
      loadUserDetail();
    }
  }, [userId]);

  const loadUserDetail = async () => {
    setLoading(true);
    try {
      const response = await adminAPI.getUserDetail(userId);
      if (response.data.code === 0 && response.data.data) {
        setDetail(response.data.data);
      } else {
        showToast('加载用户详情失败', 'error');
      }
    } catch (err) {
      showToast(err.response?.data?.message || '加载用户详情失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('zh-CN');
  };

  const formatCurrency = (amount) => {
    return `¥${amount.toFixed(2)}`;
  };

  const getStatusLabel = (status) => {
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

  const getPlanBadgeClass = (code) => {
    if (code === 'free') return 'plan-badge plan-free';
    if (code === 'pro') return 'plan-badge plan-pro';
    if (code === 'max') return 'plan-badge plan-max';
    return 'plan-badge';
  };

  if (!userId) return null;

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer-container" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <h2>用户详情</h2>
          <button className="drawer-close" onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="drawer-content">
          {loading ? (
            <div className="drawer-loading">
              <div className="spinner"></div>
              <p>加载中...</p>
            </div>
          ) : detail ? (
            <>
              {/* Basic Info */}
              <div className="detail-section">
                <h3 className="section-title">基本信息</h3>
                <div className="info-grid">
                  <div className="info-item">
                    <label>用户ID</label>
                    <span>{detail.id}</span>
                  </div>
                  <div className="info-item">
                    <label>状态</label>
                    <span>{getStatusLabel(detail.status)}</span>
                  </div>
                  <div className="info-item">
                    <label>用户名</label>
                    <span>{detail.username || '-'}</span>
                  </div>
                  <div className="info-item">
                    <label>邮箱</label>
                    <span>
                      {detail.email || '-'}
                      {detail.email && (
                        <span className={`verify-badge ${detail.email_verified ? 'verified' : 'unverified'}`}>
                          {detail.email_verified ? '已验证' : '未验证'}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="info-item">
                    <label>手机号</label>
                    <span>
                      {detail.phone || '-'}
                      {detail.phone && (
                        <span className={`verify-badge ${detail.phone_verified ? 'verified' : 'unverified'}`}>
                          {detail.phone_verified ? '已验证' : '未验证'}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="info-item">
                    <label>登录方式</label>
                    <span>
                      {detail.auth_providers && detail.auth_providers.length > 0
                        ? detail.auth_providers.map(p => (
                            <span key={p} className="provider-tag">{p}</span>
                          ))
                        : '-'}
                    </span>
                  </div>
                  <div className="info-item">
                    <label>注册时间</label>
                    <span>{formatDate(detail.created_at)}</span>
                  </div>
                  <div className="info-item">
                    <label>最后登录</label>
                    <span>{formatDate(detail.last_login_at)}</span>
                  </div>
                </div>
              </div>

              {/* Subscription Info */}
              {detail.current_subscription && (
                <div className="detail-section">
                  <h3 className="section-title">当前订阅</h3>
                  <div className="subscription-card">
                    <div className="subscription-header">
                      <span className={getPlanBadgeClass(detail.current_subscription.plan_code)}>
                        {detail.current_subscription.plan_name}
                      </span>
                      <span className="billing-cycle-badge">
                        {detail.current_subscription.billing_cycle === 'monthly' ? '月付' : '年付'}
                      </span>
                      <span className={`auto-renew-badge ${detail.current_subscription.auto_renew ? 'enabled' : 'disabled'}`}>
                        {detail.current_subscription.auto_renew ? '自动续费' : '不自动续费'}
                      </span>
                    </div>
                    <div className="subscription-info">
                      <div className="info-row">
                        <span>订阅状态：</span>
                        <span className="highlight">{detail.current_subscription.status}</span>
                      </div>
                      <div className="info-row">
                        <span>开始时间：</span>
                        <span>{formatDate(detail.current_subscription.start_date)}</span>
                      </div>
                      <div className="info-row">
                        <span>到期时间：</span>
                        <span>{formatDate(detail.current_subscription.end_date)}</span>
                      </div>
                      <div className="info-row">
                        <span>剩余天数：</span>
                        <span className="highlight">{detail.current_subscription.remaining_days} 天</span>
                      </div>
                      <div className="info-row">
                        <span>配额使用：</span>
                        <span>
                          {detail.current_subscription.used_quota} / {detail.current_subscription.total_quota}
                          <span className="usage-percent">
                            ({((detail.current_subscription.used_quota / detail.current_subscription.total_quota) * 100).toFixed(1)}%)
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Order Statistics */}
              <div className="detail-section">
                <h3 className="section-title">订单统计</h3>
                <div className="stats-grid-small">
                  <div className="stat-card-small">
                    <div className="stat-icon-small stat-orders">
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M3 1a1 1 0 000 2h1.22l.305 1.222a.997.997 0 00.01.042l1.358 5.43-.893.892C3.74 11.846 4.632 14 6.414 14H15a1 1 0 000-2H6.414l1-1H14a1 1 0 00.894-.553l3-6A1 1 0 0017 3H6.28l-.31-1.243A1 1 0 005 1H3zM16 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM6.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"/>
                      </svg>
                    </div>
                    <div className="stat-content-small">
                      <div className="stat-label-small">总订单数</div>
                      <div className="stat-value-small">{detail.order_stats.total_orders}</div>
                    </div>
                  </div>
                  <div className="stat-card-small">
                    <div className="stat-icon-small stat-amount">
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z"/>
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd"/>
                      </svg>
                    </div>
                    <div className="stat-content-small">
                      <div className="stat-label-small">总消费金额</div>
                      <div className="stat-value-small">{formatCurrency(detail.order_stats.total_amount)}</div>
                    </div>
                  </div>
                  <div className="stat-card-small">
                    <div className="stat-icon-small stat-saved">
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05L11.949 18H6.051L.333 13.98a1 1 0 01-.285-1.049l1.738-5.42-1.233-.617a1 1 0 11.894-1.788l1.599.799L7 4.323V3a1 1 0 011-1h2zm0 2.274L7 5.607v3.893a1 1 0 01-1 1H4.268l-1.2 3.748L7.586 17h4.828l4.519-2.752-1.2-3.748H14a1 1 0 01-1-1V5.607L10 4.274z"/>
                      </svg>
                    </div>
                    <div className="stat-content-small">
                      <div className="stat-label-small">累计节省</div>
                      <div className="stat-value-small">{formatCurrency(detail.order_stats.total_saved)}</div>
                    </div>
                  </div>
                  {detail.order_stats.last_order_at && (
                    <div className="stat-card-small full-width">
                      <div className="stat-label-small">最后订单时间</div>
                      <div className="stat-value-small text-muted">{formatDate(detail.order_stats.last_order_at)}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Invitation Statistics */}
              {detail.invitation_stats && detail.invitation_stats.invitation_code && (
                <div className="detail-section">
                  <h3 className="section-title">邀请统计</h3>
                  <div className="invitation-card">
                    <div className="invitation-code">
                      <label>邀请码：</label>
                      <span className="code">{detail.invitation_stats.invitation_code}</span>
                    </div>
                    <div className="invitation-stats">
                      <div className="stat-item">
                        <div className="stat-number">{detail.invitation_stats.total_invited}</div>
                        <div className="stat-label">总邀请数</div>
                      </div>
                      <div className="stat-item">
                        <div className="stat-number success">{detail.invitation_stats.success_invited}</div>
                        <div className="stat-label">成功邀请</div>
                      </div>
                      <div className="stat-item">
                        <div className="stat-number reward">{detail.invitation_stats.rewards_earned}</div>
                        <div className="stat-label">获得奖励</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Coupon Statistics */}
              <div className="detail-section">
                <h3 className="section-title">折扣券统计</h3>
                <div className="coupon-stats">
                  <div className="coupon-stat-item">
                    <span className="coupon-label">总领取：</span>
                    <span className="coupon-value">{detail.coupon_stats.total_coupons}</span>
                  </div>
                  <div className="coupon-stat-item">
                    <span className="coupon-label">已使用：</span>
                    <span className="coupon-value used">{detail.coupon_stats.used_coupons}</span>
                  </div>
                  <div className="coupon-stat-item">
                    <span className="coupon-label">可用：</span>
                    <span className="coupon-value available">{detail.coupon_stats.available_coupons}</span>
                  </div>
                  <div className="coupon-stat-item">
                    <span className="coupon-label">已过期：</span>
                    <span className="coupon-value expired">{detail.coupon_stats.expired_coupons}</span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="drawer-error">
              <p>加载失败，请重试</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserDetailDrawer;
