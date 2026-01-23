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
import { showToast } from './Toast';
import GoldIcon from './GoldIcon';
import EntcoinIcon from './EntcoinIcon';
import './UserDetailDrawer.css';

const UserDetailDrawer = ({ userId, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);

  const loadUserDetail = async (id) => {
    setLoading(true);
    try {
      const response = await adminAPI.getUserDetail(id);
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

  useEffect(() => {
    if (userId) {
      loadUserDetail(userId);
    }
  }, [userId]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatShortDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('zh-CN');
  };

  const formatCurrency = (amount) => {
    return `¥${(amount || 0).toFixed(2)}`;
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 1:
        return <span className="ud-badge ud-badge-success">正常</span>;
      case 0:
        return <span className="ud-badge ud-badge-warning">未激活</span>;
      case 2:
        return <span className="ud-badge ud-badge-danger">已封禁</span>;
      default:
        return <span className="ud-badge">未知</span>;
    }
  };

  const getPlanBadge = (subscription) => {
    if (!subscription) {
      return <span className="ud-plan ud-plan-free">免费</span>;
    }
    const code = subscription.plan_code?.toLowerCase();
    return (
      <span className={`ud-plan ud-plan-${code}`}>
        {subscription.plan_name || subscription.plan_code}
      </span>
    );
  };

  if (!userId) return null;

  return (
    <div className="ud-overlay" onClick={onClose}>
      <div className="ud-drawer" onClick={(e) => e.stopPropagation()}>
        {/* 头部 */}
        <div className="ud-header">
          <h2>用户详情</h2>
          <button className="ud-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* 内容 */}
        <div className="ud-content">
          {loading ? (
            <div className="ud-loading">
              <div className="ud-spinner"></div>
              <span>加载中...</span>
            </div>
          ) : detail ? (
            <>
              {/* 用户概览卡片 */}
              <div className="ud-profile-card">
                <div className="ud-profile-main">
                  <div className="ud-profile-avatar">
                    {detail.username?.[0]?.toUpperCase() || detail.email?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <div className="ud-profile-info">
                    <div className="ud-profile-name">{detail.username || '未设置用户名'}</div>
                    <div className="ud-profile-id">ID: {detail.id}</div>
                  </div>
                  {getStatusBadge(detail.status)}
                </div>
                <div className="ud-profile-meta">
                  {detail.email && (
                    <div className="ud-meta-item">
                      <span className="ud-meta-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                          <polyline points="22,6 12,13 2,6"></polyline>
                        </svg>
                      </span>
                      <span>{detail.email}</span>
                      {detail.email_verified && <span className="ud-verified-dot"></span>}
                    </div>
                  )}
                  {detail.phone && (
                    <div className="ud-meta-item">
                      <span className="ud-meta-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                        </svg>
                      </span>
                      <span>{detail.phone}</span>
                      {detail.phone_verified && <span className="ud-verified-dot"></span>}
                    </div>
                  )}
                </div>
                {/* 登录方式标签 */}
                {detail.auth_providers && detail.auth_providers.length > 0 && (
                  <div className="ud-auth-providers">
                    {detail.auth_providers.map(p => (
                      <span key={p} className="ud-provider-tag">{p}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* 会员与钱包 */}
              <div className="ud-section">
                <div className="ud-section-header">
                  <span className="ud-section-title">会员与钱包</span>
                </div>
                <div className="ud-membership-grid">
                  <div className="ud-membership-card">
                    <div className="ud-mc-header">
                      {getPlanBadge(detail.current_subscription)}
                      {detail.current_subscription && (
                        <span className={`ud-billing ${detail.current_subscription.billing_cycle}`}>
                          {detail.current_subscription.billing_cycle === 'monthly' ? '月付' : '年付'}
                        </span>
                      )}
                    </div>
                    {detail.current_subscription ? (
                      <div className="ud-mc-details">
                        <div className="ud-mc-row">
                          <span>到期时间</span>
                          <span>{formatShortDate(detail.current_subscription.end_date)}</span>
                        </div>
                        <div className="ud-mc-row">
                          <span>剩余天数</span>
                          <span className={detail.current_subscription.remaining_days <= 7 ? 'ud-warn' : ''}>
                            {detail.current_subscription.remaining_days}天
                          </span>
                        </div>
                        <div className="ud-mc-row">
                          <span>自动续费</span>
                          <span className={detail.current_subscription.auto_renew ? 'ud-on' : 'ud-off'}>
                            {detail.current_subscription.auto_renew ? '已开启' : '未开启'}
                          </span>
                        </div>
                        {detail.current_subscription.total_quota > 0 && (
                          <div className="ud-mc-quota">
                            <div className="ud-quota-bar">
                              <div
                                className="ud-quota-fill"
                                style={{ width: `${Math.min((detail.current_subscription.used_quota / detail.current_subscription.total_quota) * 100, 100)}%` }}
                              ></div>
                            </div>
                            <span className="ud-quota-text">
                              {detail.current_subscription.used_quota}/{detail.current_subscription.total_quota}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="ud-mc-empty">暂无订阅</div>
                    )}
                  </div>
                  <div className="ud-wallet-card">
                    <div className="ud-wallet-item">
                      <GoldIcon size="md" />
                      <div className="ud-wallet-info">
                        <span className="ud-wallet-label">经费</span>
                        <span className="ud-wallet-value ud-gold">{detail.wallet?.gold || 0}</span>
                      </div>
                    </div>
                    <div className="ud-wallet-item">
                      <EntcoinIcon size="md" />
                      <div className="ud-wallet-info">
                        <span className="ud-wallet-label">恩特币</span>
                        <span className="ud-wallet-value ud-diamond">{detail.wallet?.diamond || 0}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 数据统计 - 紧凑网格 */}
              <div className="ud-section">
                <div className="ud-section-header">
                  <span className="ud-section-title">数据统计</span>
                </div>
                <div className="ud-stats-compact">
                  <div className="ud-stat-item">
                    <span className="ud-stat-num">{detail.order_stats?.total_orders || 0}</span>
                    <span className="ud-stat-label">订单数</span>
                  </div>
                  <div className="ud-stat-item">
                    <span className="ud-stat-num">{formatCurrency(detail.order_stats?.total_amount)}</span>
                    <span className="ud-stat-label">消费金额</span>
                  </div>
                  <div className="ud-stat-item">
                    <span className="ud-stat-num">{detail.ai_conversation_stats?.total_conversations || 0}</span>
                    <span className="ud-stat-label">AI对话</span>
                  </div>
                  <div className="ud-stat-item">
                    <span className="ud-stat-num">{detail.analysis_conversation_stats?.total_conversations || 0}</span>
                    <span className="ud-stat-label">智能分析</span>
                  </div>
                </div>
              </div>

              {/* 折扣券统计 */}
              <div className="ud-section">
                <div className="ud-section-header">
                  <span className="ud-section-title">折扣券</span>
                </div>
                <div className="ud-coupon-row">
                  <div className="ud-coupon-item">
                    <span className="ud-coupon-num">{detail.coupon_stats?.total_coupons || 0}</span>
                    <span className="ud-coupon-label">总领取</span>
                  </div>
                  <div className="ud-coupon-item ud-coupon-available">
                    <span className="ud-coupon-num">{detail.coupon_stats?.available_coupons || 0}</span>
                    <span className="ud-coupon-label">可用</span>
                  </div>
                  <div className="ud-coupon-item ud-coupon-used">
                    <span className="ud-coupon-num">{detail.coupon_stats?.used_coupons || 0}</span>
                    <span className="ud-coupon-label">已使用</span>
                  </div>
                  <div className="ud-coupon-item ud-coupon-expired">
                    <span className="ud-coupon-num">{detail.coupon_stats?.expired_coupons || 0}</span>
                    <span className="ud-coupon-label">已过期</span>
                  </div>
                </div>
              </div>

              {/* 邀请信息 */}
              {(detail.invitation_stats?.invitation_code || detail.invited_by) && (
                <div className="ud-section">
                  <div className="ud-section-header">
                    <span className="ud-section-title">邀请关系</span>
                  </div>
                  <div className="ud-invite-content">
                    {/* 邀请码和统计 */}
                    {detail.invitation_stats?.invitation_code && (
                      <div className="ud-invite-code-box">
                        <div className="ud-invite-code">
                          <span className="ud-code-label">邀请码</span>
                          <span className="ud-code-value">{detail.invitation_stats.invitation_code}</span>
                        </div>
                        <div className="ud-invite-stats">
                          <span>{detail.invitation_stats.total_invited || 0} 邀请</span>
                          <span>{detail.invitation_stats.success_invited || 0} 成功</span>
                          <span>{detail.invitation_stats.rewards_earned || 0} 奖励</span>
                        </div>
                      </div>
                    )}
                    {/* 邀请人 */}
                    {detail.invited_by && (
                      <div className="ud-inviter-box">
                        <span className="ud-inviter-label">邀请人:</span>
                        <span className="ud-inviter-name">
                          {detail.invited_by.username || detail.invited_by.email || `用户${detail.invited_by.user_id}`}
                        </span>
                        <span className="ud-inviter-id">#{detail.invited_by.user_id}</span>
                      </div>
                    )}
                    {/* 已邀请用户列表 */}
                    {detail.invited_users && detail.invited_users.length > 0 && (
                      <div className="ud-invited-list">
                        <div className="ud-invited-header">已邀请 {detail.invited_users.length} 人</div>
                        <div className="ud-invited-items">
                          {detail.invited_users.slice(0, 5).map(user => (
                            <div key={user.user_id} className="ud-invited-item">
                              <span className="ud-invited-name">
                                {user.username || user.email || `用户${user.user_id}`}
                              </span>
                              <div className="ud-invited-badges">
                                {user.is_registered && <span className="ud-mini-badge ud-mini-reg">注册</span>}
                                {user.has_ordered && <span className="ud-mini-badge ud-mini-order">下单</span>}
                              </div>
                            </div>
                          ))}
                          {detail.invited_users.length > 5 && (
                            <div className="ud-invited-more">还有 {detail.invited_users.length - 5} 人...</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 时间与登录信息 */}
              <div className="ud-section ud-section-muted">
                <div className="ud-time-grid">
                  <div className="ud-time-item">
                    <span className="ud-time-label">注册时间</span>
                    <span className="ud-time-value">{formatDate(detail.created_at)}</span>
                  </div>
                  <div className="ud-time-item">
                    <span className="ud-time-label">最后登录</span>
                    <span className="ud-time-value">{formatDate(detail.last_login_at)}</span>
                  </div>
                  {detail.last_login_ip && (
                    <div className="ud-time-item">
                      <span className="ud-time-label">登录IP</span>
                      <span className="ud-time-value">
                        {detail.last_login_ip}
                        {detail.last_login_ip_info && (
                          <span className="ud-ip-location"> ({detail.last_login_ip_info})</span>
                        )}
                      </span>
                    </div>
                  )}
                  {detail.order_stats?.last_order_at && (
                    <div className="ud-time-item">
                      <span className="ud-time-label">最后订单</span>
                      <span className="ud-time-value">{formatDate(detail.order_stats.last_order_at)}</span>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="ud-error">
              <p>加载失败，请重试</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserDetailDrawer;
