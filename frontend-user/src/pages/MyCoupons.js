/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import './MyCoupons.css';

const MyCoupons = () => {
  const [coupons, setCoupons] = useState([]);
  const [invitation, setInvitation] = useState(null);
  const [statistics, setStatistics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('available');
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [claimCode, setClaimCode] = useState('');
  const [invitationCopied, setInvitationCopied] = useState(false);
  const [isComposing, setIsComposing] = useState(false); // 跟踪输入法状态
  const navigate = useNavigate();

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 获取用户的折扣券
      const statusFilter = activeTab === 'available' ? 'unused' : activeTab === 'used' ? 'used' : 'expired';
      const couponsRes = await api.get(`/user/coupons?status=${statusFilter}`);
      setCoupons(couponsRes.data.data.coupons || []);

      // 获取邀请信息
      try {
        const inviteRes = await api.get('/user/invitation/my');
        setInvitation(inviteRes.data.data);
      } catch (error) {
        // 用户可能还没有生成邀请码
      }

      // 获取邀请统计
      try {
        const statsRes = await api.get('/user/invitation/statistics');
        setStatistics(statsRes.data.data);
      } catch (error) {
        // 可能没有统计数据
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateInvitation = async () => {
    try {
      const response = await api.post('/user/invitation/generate');
      setInvitation(response.data.data);
      alert('邀请码生成成功！');
    } catch (error) {
      console.error('Failed to generate invitation:', error);
      alert('生成邀请码失败：' + (error.response?.data?.message || error.message));
    }
  };

  const claimCoupon = async () => {
    if (!claimCode.trim()) {
      alert('请输入折扣券代码');
      return;
    }

    try {
      const response = await api.post('/user/coupons/claim', {
        code: claimCode
      });
      alert('领取成功！');
      setShowClaimModal(false);
      setClaimCode('');
      fetchData();
    } catch (error) {
      alert('领取失败：' + (error.response?.data?.message || error.message));
    }
  };

  const copyInvitationCode = () => {
    if (invitation) {
      navigator.clipboard.writeText(invitation.invitation_code);
      setInvitationCopied(true);
      setTimeout(() => setInvitationCopied(false), 2000);
    }
  };

  const copyInvitationUrl = () => {
    if (invitation) {
      const url = `${window.location.origin}/register?invite=${invitation.invitation_code}`;
      navigator.clipboard.writeText(url);
      alert('邀请链接已复制到剪贴板');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('zh-CN');
  };

  const getDiscountDisplay = (type, value) => {
    switch (type) {
      case 'percentage':
        return `${value}% OFF`;
      case 'fixed':
      case 'price_off':
        return `¥${value}`;
      default:
        return value;
    }
  };

  const getCouponStatusClass = (status) => {
    switch (status) {
      case 'unused':
        return 'status-available';
      case 'used':
        return 'status-used';
      case 'expired':
        return 'status-expired';
      default:
        return '';
    }
  };

  if (loading) {
    return (
      <div className="coupons-container">
        <div className="loading">加载中...</div>
      </div>
    );
  }

  return (
    <div className="coupons-container">
      <div className="page-header">
        <h1>我的折扣券</h1>
        <button className="btn btn-primary" onClick={() => setShowClaimModal(true)}>
          领取折扣券
        </button>
      </div>

      {/* 邀请卡片 */}
      <div className="invitation-card">
        <div className="invitation-header">
          <h2>邀请好友，赚取奖励</h2>
          {!invitation && (
            <button className="btn btn-success" onClick={generateInvitation}>
              生成邀请码
            </button>
          )}
        </div>

        {invitation && (
          <div className="invitation-content">
            <div className="invitation-code-section">
              <div className="code-display">
                <span className="label">我的邀请码：</span>
                <span className="code">{invitation.invitation_code}</span>
                <button
                  className="btn-copy"
                  onClick={copyInvitationCode}
                >
                  {invitationCopied ? '已复制' : '复制'}
                </button>
              </div>
              <button className="btn btn-outline" onClick={copyInvitationUrl}>
                复制邀请链接
              </button>
            </div>

            {statistics && (
              <div className="invitation-stats">
                <div className="stat-item">
                  <div className="stat-value">{statistics.invitation?.total_invites || 0}</div>
                  <div className="stat-label">总邀请数</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{statistics.invitation?.successful_invites || 0}</div>
                  <div className="stat-label">成功注册</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{statistics.invitation?.paid_invites || 0}</div>
                  <div className="stat-label">付费用户</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 折扣券标签页 */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'available' ? 'active' : ''}`}
          onClick={() => setActiveTab('available')}
        >
          可用 ({coupons.filter(c => c.status === 'unused').length})
        </button>
        <button
          className={`tab ${activeTab === 'used' ? 'active' : ''}`}
          onClick={() => setActiveTab('used')}
        >
          已使用
        </button>
        <button
          className={`tab ${activeTab === 'expired' ? 'active' : ''}`}
          onClick={() => setActiveTab('expired')}
        >
          已过期
        </button>
      </div>

      {/* 折扣券列表 */}
      <div className="coupons-grid">
        {coupons.length === 0 ? (
          <div className="empty-state">
            <p>暂无{activeTab === 'available' ? '可用' : activeTab === 'used' ? '已使用' : '已过期'}的折扣券</p>
          </div>
        ) : (
          coupons.map(coupon => (
            <div key={coupon.id} className={`coupon-card ${getCouponStatusClass(coupon.status)}`}>
              <div className="coupon-header">
                <div className="discount">
                  {getDiscountDisplay(coupon.discount_type, coupon.discount_value)}
                </div>
                <div className="coupon-code">{coupon.coupon_code}</div>
              </div>
              <div className="coupon-body">
                <div className="coupon-name">{coupon.template?.name || '优惠券'}</div>
                <div className="coupon-desc">{coupon.template?.description || ''}</div>
                <div className="coupon-conditions">
                  {coupon.min_purchase_amount > 0 && (
                    <span>满¥{coupon.min_purchase_amount}可用</span>
                  )}
                </div>
                <div className="coupon-validity">
                  有效期：{formatDate(coupon.valid_from)} - {formatDate(coupon.valid_until)}
                </div>
              </div>
              {coupon.status === 'unused' && (
                <div className="coupon-footer">
                  <button
                    className="btn btn-use"
                    onClick={() => navigate('/subscription-plans')}
                  >
                    立即使用
                  </button>
                </div>
              )}
              {coupon.status === 'used' && coupon.used_at && (
                <div className="coupon-footer">
                  <span className="used-info">已于 {formatDate(coupon.used_at)} 使用</span>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* 领取折扣券弹窗 */}
      {showClaimModal && (
        <div className="modal-overlay" onClick={() => setShowClaimModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>领取折扣券</h3>
              <button className="close-btn" onClick={() => setShowClaimModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>折扣券代码</label>
                <input
                  type="text"
                  value={claimCode}
                  onChange={e => setClaimCode(e.target.value)}
                  placeholder="请输入折扣券代码"
                  onCompositionStart={() => setIsComposing(true)}
                  onCompositionEnd={() => setIsComposing(false)}
                  onKeyDown={e => e.key === 'Enter' && !isComposing && claimCoupon()}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowClaimModal(false)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={claimCoupon}>
                领取
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyCoupons;