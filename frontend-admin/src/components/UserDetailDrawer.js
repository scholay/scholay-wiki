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
    <div className="ud-drawer-overlay" onClick={onClose}>
      <div className="ud-drawer-container" onClick={(e) => e.stopPropagation()}>
        <div className="ud-drawer-header">
          <h2>用户详情</h2>
          <button className="ud-drawer-close" onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="ud-drawer-content">
          {loading ? (
            <div className="ud-drawer-loading">
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
                    <label>会员状态</label>
                    <span>
                      {detail.current_subscription ? (
                        <span className={getPlanBadgeClass(detail.current_subscription.plan_code)}>
                          {detail.current_subscription.plan_name}
                        </span>
                      ) : (
                        <span className="plan-badge plan-free">免费用户</span>
                      )}
                    </span>
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
                  {detail.current_subscription && (
                    <>
                      <div className="info-item">
                        <label>订阅到期</label>
                        <span>
                          {formatDate(detail.current_subscription.end_date)}
                          {detail.current_subscription.remaining_days >= 0 && (
                            <span className={`days-badge ${detail.current_subscription.remaining_days <= 7 ? 'warning' : ''}`}>
                              剩余 {detail.current_subscription.remaining_days} 天
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="info-item">
                        <label>自动续费</label>
                        <span>
                          <span className={`auto-renew-badge ${detail.current_subscription.auto_renew ? 'enabled' : 'disabled'}`}>
                            {detail.current_subscription.auto_renew ? '已开启' : '未开启'}
                          </span>
                        </span>
                      </div>
                    </>
                  )}
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

              {/* Invitation Relationships */}
              <div className="detail-section">
                <h3 className="section-title">邀请关系</h3>
                
                {/* Invited By */}
                {detail.invited_by ? (
                  <div className="relationship-card">
                    <div className="relationship-header">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="8.5" cy="7" r="4"></circle>
                        <polyline points="17 11 19 13 23 9"></polyline>
                      </svg>
                      <span>邀请人</span>
                    </div>
                    <div className="inviter-info">
                      <div className="inviter-details">
                        <div className="inviter-name">
                          {detail.invited_by.username || detail.invited_by.email || `用户 ${detail.invited_by.user_id}`}
                        </div>
                        <div className="inviter-meta">
                          <span>ID: {detail.invited_by.user_id}</span>
                          {detail.invited_by.email && <span>{detail.invited_by.email}</span>}
                          <span>邀请时间: {formatDate(detail.invited_by.invited_at)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="relationship-empty">
                    <span>该用户无邀请人（直接注册）</span>
                  </div>
                )}

                {/* Invited Users */}
                {detail.invited_users && detail.invited_users.length > 0 && (
                  <div className="relationship-card">
                    <div className="relationship-header">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                      </svg>
                      <span>已邀请用户 ({detail.invited_users.length})</span>
                    </div>
                    <div className="invited-users-list">
                      {detail.invited_users.map((user) => (
                        <div key={user.user_id} className="invited-user-item">
                          <div className="invited-user-main">
                            <div className="invited-user-name">
                              {user.username || user.email || `用户 ${user.user_id}`}
                            </div>
                            <div className="invited-user-badges">
                              {user.is_registered && (
                                <span className="user-badge registered">已注册</span>
                              )}
                              {user.has_ordered && (
                                <span className="user-badge ordered">已下单</span>
                              )}
                            </div>
                          </div>
                          <div className="invited-user-meta">
                            <span>ID: {user.user_id}</span>
                            {user.email && <span>{user.email}</span>}
                            <span>{formatDate(user.invited_at)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* AI Conversation Statistics */}
              <div className="detail-section">
                <h3 className="section-title">AI对话统计</h3>
                <div className="conversation-stats-card">
                  <div className="conv-stats-overview">
                    <div className="conv-stat-main">
                      <div className="conv-stat-number">{detail.ai_conversation_stats.total_conversations}</div>
                      <div className="conv-stat-label">总对话数</div>
                    </div>
                    <div className="conv-stat-main">
                      <div className="conv-stat-number">{detail.ai_conversation_stats.total_rounds}</div>
                      <div className="conv-stat-label">总轮次</div>
                    </div>
                    <div className="conv-stat-main">
                      <div className="conv-stat-number">{detail.ai_conversation_stats.avg_rounds_per_conv.toFixed(1)}</div>
                      <div className="conv-stat-label">平均轮次/对话</div>
                    </div>
                  </div>
                  <div className="conv-stats-timeline">
                    <div className="timeline-item">
                      <span className="timeline-label">今日</span>
                      <span className="timeline-value">{detail.ai_conversation_stats.today_rounds} 轮</span>
                    </div>
                    <div className="timeline-item">
                      <span className="timeline-label">本周</span>
                      <span className="timeline-value">{detail.ai_conversation_stats.week_rounds} 轮</span>
                    </div>
                    <div className="timeline-item">
                      <span className="timeline-label">本月</span>
                      <span className="timeline-value">{detail.ai_conversation_stats.month_rounds} 轮</span>
                    </div>
                  </div>
                  {detail.ai_conversation_stats.last_conv_at && (
                    <div className="conv-last-activity">
                      最后对话: {formatDate(detail.ai_conversation_stats.last_conv_at)}
                    </div>
                  )}
                </div>
              </div>

              {/* Analysis Conversation Statistics */}
              <div className="detail-section">
                <h3 className="section-title">智能分析统计</h3>
                <div className="conversation-stats-card analysis">
                  <div className="conv-stats-overview">
                    <div className="conv-stat-main">
                      <div className="conv-stat-number">{detail.analysis_conversation_stats.total_conversations}</div>
                      <div className="conv-stat-label">总分析数</div>
                    </div>
                    <div className="conv-stat-main">
                      <div className="conv-stat-number">{detail.analysis_conversation_stats.total_rounds}</div>
                      <div className="conv-stat-label">总轮次</div>
                    </div>
                    <div className="conv-stat-main">
                      <div className="conv-stat-number">{detail.analysis_conversation_stats.avg_rounds_per_conv.toFixed(1)}</div>
                      <div className="conv-stat-label">平均轮次/分析</div>
                    </div>
                  </div>
                  <div className="conv-stats-timeline">
                    <div className="timeline-item">
                      <span className="timeline-label">今日</span>
                      <span className="timeline-value">{detail.analysis_conversation_stats.today_rounds} 轮</span>
                    </div>
                    <div className="timeline-item">
                      <span className="timeline-label">本周</span>
                      <span className="timeline-value">{detail.analysis_conversation_stats.week_rounds} 轮</span>
                    </div>
                    <div className="timeline-item">
                      <span className="timeline-label">本月</span>
                      <span className="timeline-value">{detail.analysis_conversation_stats.month_rounds} 轮</span>
                    </div>
                  </div>
                  {detail.analysis_conversation_stats.last_conv_at && (
                    <div className="conv-last-activity">
                      最后分析: {formatDate(detail.analysis_conversation_stats.last_conv_at)}
                    </div>
                  )}
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
