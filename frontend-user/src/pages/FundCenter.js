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
import { useAuth } from '../utils/AuthContext';
import { fundAPI } from '../services/api';
import './styles/FundCenter.css';

const FundCenter = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [funds, setFunds] = useState([]);
  const [stats, setStats] = useState({ total_distributed_gold: 0, total_distributed_diamond: 0, total_beneficiaries: 0 });
  const [myDistributions, setMyDistributions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedFund, setSelectedFund] = useState(null);
  const [activeTab, setActiveTab] = useState('funds'); // 'funds' or 'my-records'

  useEffect(() => {
    fetchData();
  }, [isAuthenticated]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 获取基金列表
      const fundsRes = await fundAPI.getFunds();
      if (fundsRes.data?.code === 0) {
        setFunds(fundsRes.data.data?.funds || []);
        setStats(fundsRes.data.data?.stats || {});
      }

      // 如果已登录，获取我的领取记录
      if (isAuthenticated) {
        const distRes = await fundAPI.getMyDistributions();
        if (distRes.data?.code === 0) {
          setMyDistributions(distRes.data.data || []);
        }
      }
    } catch (error) {
      console.error('Failed to fetch fund data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getFundStatusLabel = (status) => {
    const labels = {
      pending: '待生效',
      active: '生效中',
      completed: '已结束'
    };
    return labels[status] || status;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const currentFund = funds.find(f => f.status === 'active');
  const pastFunds = funds.filter(f => f.status === 'completed');

  return (
    <div className="fund-center-page">
      {/* Header */}
      <div className="fund-center-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <h1>会员基金中心</h1>
      </div>

      {/* Stats Overview */}
      <div className="fund-stats-banner">
        <div className="stats-bg-decoration"></div>
        <div className="stats-content">
          <h2>Scholay 会员基金计划</h2>
          <p className="stats-slogan">每月为会员送上专属科研支持</p>
          <div className="stats-numbers">
            <div className="stat-item">
              <span className="stat-value">{stats.total_distributed_gold?.toLocaleString() || 0}</span>
              <span className="stat-label">累计发放经费</span>
            </div>
            <div className="stat-divider"></div>
            <div className="stat-item">
              <span className="stat-value">{stats.total_distributed_diamond?.toLocaleString() || 0}</span>
              <span className="stat-label">累计发放恩特币</span>
            </div>
            <div className="stat-divider"></div>
            <div className="stat-item">
              <span className="stat-value">{stats.total_beneficiaries?.toLocaleString() || 0}</span>
              <span className="stat-label">受益会员数</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="fund-tabs">
        <button 
          className={`tab-btn ${activeTab === 'funds' ? 'active' : ''}`}
          onClick={() => setActiveTab('funds')}
        >
          基金列表
        </button>
        {isAuthenticated && (
          <button 
            className={`tab-btn ${activeTab === 'my-records' ? 'active' : ''}`}
            onClick={() => setActiveTab('my-records')}
          >
            我的领取记录
          </button>
        )}
      </div>

      {loading ? (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>加载中...</p>
        </div>
      ) : activeTab === 'funds' ? (
        <div className="funds-content">
          {/* Current Fund */}
          {currentFund && (
            <div className="current-fund-section">
              <h3 className="section-title">
                <span className="title-icon">🔥</span>
                当前生效基金
              </h3>
              <div 
                className="current-fund-card"
                style={{ '--theme-color': currentFund.theme_color }}
                onClick={() => setSelectedFund(currentFund)}
              >
                <div className="fund-card-header">
                  <span className="fund-month">{currentFund.fund_month}</span>
                  <span className="fund-status active">{getFundStatusLabel(currentFund.status)}</span>
                </div>
                <h2 className="fund-name">{currentFund.fund_name}</h2>
                {currentFund.fund_slogan && (
                  <p className="fund-slogan">"{currentFund.fund_slogan}"</p>
                )}
                <div className="fund-benefits">
                  <div className="benefit-item">
                    <span className="benefit-icon">👑</span>
                    <span className="benefit-label">Pro会员</span>
                    <span className="benefit-value">{currentFund.pro_gold_amount} 经费</span>
                  </div>
                  <div className="benefit-item highlight">
                    <span className="benefit-icon">💎</span>
                    <span className="benefit-label">Max会员</span>
                    <span className="benefit-value">
                      {currentFund.max_gold_amount} 经费 + {currentFund.max_diamond_amount} 恩特币
                    </span>
                  </div>
                </div>
                <div className="fund-progress">
                  <span>已发放: {currentFund.total_distributed_gold} 经费</span>
                  <span>受益: {currentFund.beneficiary_count} 人</span>
                </div>
              </div>
            </div>
          )}

          {/* Past Funds */}
          {pastFunds.length > 0 && (
            <div className="past-funds-section">
              <h3 className="section-title">
                <span className="title-icon">📜</span>
                历史基金
              </h3>
              <div className="past-funds-grid">
                {pastFunds.map((fund) => (
                  <div 
                    key={fund.id}
                    className="past-fund-card"
                    style={{ '--theme-color': fund.theme_color }}
                    onClick={() => setSelectedFund(fund)}
                  >
                    <div className="past-fund-header">
                      <span className="fund-month">{fund.fund_month}</span>
                      <span className="fund-status completed">{getFundStatusLabel(fund.status)}</span>
                    </div>
                    <h4 className="fund-name">{fund.fund_name}</h4>
                    <div className="past-fund-stats">
                      <span>发放 {fund.total_distributed_gold} 经费</span>
                      <span>惠及 {fund.beneficiary_count} 人</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {funds.length === 0 && (
            <div className="empty-state">
              <span className="empty-icon">🏛️</span>
              <p>暂无基金数据</p>
            </div>
          )}
        </div>
      ) : (
        // My Records Tab
        <div className="my-records-content">
          {myDistributions.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">📋</span>
              <p>暂无领取记录</p>
              <span className="empty-hint">成为Pro或Max会员，每月自动获得基金福利</span>
            </div>
          ) : (
            <div className="records-list">
              {myDistributions.map((dist) => (
                <div key={dist.id} className="record-item">
                  <div className="record-left">
                    <div className="record-fund-name">{dist.fund?.fund_name || '会员基金'}</div>
                    <div className="record-date">{formatDate(dist.distributed_at)}</div>
                  </div>
                  <div className="record-right">
                    <div className="record-amounts">
                      {dist.gold_amount > 0 && (
                        <span className="amount gold">+{dist.gold_amount} 经费</span>
                      )}
                      {dist.diamond_amount > 0 && (
                        <span className="amount diamond">+{dist.diamond_amount} 恩特币</span>
                      )}
                    </div>
                    <div className="record-membership">{dist.membership_type?.toUpperCase()} 会员</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Fund Detail Modal */}
      {selectedFund && (
        <div className="fund-modal-overlay" onClick={() => setSelectedFund(null)}>
          <div className="fund-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedFund(null)}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
            <div 
              className="fund-modal-header"
              style={{ '--theme-color': selectedFund.theme_color }}
            >
              <span className="fund-month">{selectedFund.fund_month}</span>
              <h2 className="fund-name">{selectedFund.fund_name}</h2>
              {selectedFund.fund_slogan && (
                <p className="fund-slogan">"{selectedFund.fund_slogan}"</p>
              )}
            </div>
            <div className="fund-modal-body">
              {selectedFund.fund_description && (
                <div className="fund-description">
                  <h4>基金介绍</h4>
                  <p>{selectedFund.fund_description}</p>
                </div>
              )}
              <div className="fund-benefits-detail">
                <h4>会员福利</h4>
                <div className="benefit-row">
                  <span className="benefit-type">Pro会员</span>
                  <span className="benefit-amount">{selectedFund.pro_gold_amount} 经费</span>
                </div>
                <div className="benefit-row highlight">
                  <span className="benefit-type">Max会员</span>
                  <span className="benefit-amount">
                    {selectedFund.max_gold_amount} 经费 + {selectedFund.max_diamond_amount} 恩特币
                  </span>
                </div>
              </div>
              <div className="fund-stats-detail">
                <h4>发放统计</h4>
                <div className="stats-row">
                  <div className="stat-box">
                    <span className="stat-value">{selectedFund.total_distributed_gold}</span>
                    <span className="stat-label">已发放经费</span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-value">{selectedFund.total_distributed_diamond}</span>
                    <span className="stat-label">已发放恩特币</span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-value">{selectedFund.beneficiary_count}</span>
                    <span className="stat-label">受益用户数</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FundCenter;

