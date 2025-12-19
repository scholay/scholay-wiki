/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * SubscriptionTab - 资产管理 Tab 组件
 * 从 Settings.js 提取，处理订阅、钱包、交易流水
 */

import React, { memo } from 'react';
import PropTypes from 'prop-types';
import EntcoinIcon from '../EntcoinIcon';
import GoldIcon from '../GoldIcon';

/**
 * 获取交易类型标签
 */
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

/**
 * SubscriptionTab 组件
 */
const SubscriptionTab = memo(({
  currentSubscription,
  wallet,
  walletLoading,
  transactions,
  transactionLoading,
  transactionTotal,
  transactionPage,
  billingHistory,
  billingLoading,
  billingTotal,
  bizDisplayInfos,
  onNavigate,
  onShowRechargeModal,
  onShowExchangeModal,
  onFetchTransactions,
}) => {
  // 获取业务类型标签
  const getBizTypeLabel = (bizType) => {
    if (bizDisplayInfos?.[bizType]?.display_name) {
      return bizDisplayInfos[bizType].display_name;
    }
    const labels = {
      register_gift: '注册赠送',
      daily_checkin: '每日签到',
      invite_reward: '邀请奖励',
      diamond_exchange: '恩特币兑换经费',
      diamond_recharge: '恩特币充值',
      peer_review: 'AI审稿',
      ai_chat_low: 'AI对话',
      smart_analysis_low: '智能分析',
    };
    return labels[bizType] || bizType || '其他';
  };

  const getBizTypeRemark = (bizType) => {
    if (bizDisplayInfos?.[bizType]?.display_remark) {
      return bizDisplayInfos[bizType].display_remark;
    }
    return null;
  };

  return (
    <div className="settings-section subscription-section">
      <h2>资产管理</h2>

      {/* 主卡片 */}
      <div className={`am-card ${currentSubscription?.plan_code || 'free'}`}>
        <div className="am-row am-member-row" onClick={() => onNavigate('/pricing')}>
          <span className={`am-badge ${currentSubscription?.plan_code || 'free'}`}>
            {currentSubscription?.plan_name || 'FREE'}
          </span>
          <span className="am-text">
            {currentSubscription?.plan_code === 'free' 
              ? '开通会员享基金福利' 
              : currentSubscription?.end_date 
                ? new Date(currentSubscription.end_date).toLocaleDateString('zh-CN') + ' 到期'
                : '会员生效中'}
          </span>
          <span className="am-action">{currentSubscription?.plan_code === 'free' ? '开通' : '管理'}</span>
        </div>

        <div className="am-row am-balance-row">
          <div className="am-bal">
            <span className="am-bal-icon"><EntcoinIcon size="lg" /></span>
            <span className="am-bal-num">{walletLoading ? '-' : (wallet?.diamond || 0)}</span>
            <button className="am-btn primary" onClick={onShowRechargeModal}>充值</button>
          </div>
          <div className="am-bal-sep"></div>
          <div className="am-bal">
            <span className="am-bal-icon"><GoldIcon size="lg" /></span>
            <span className="am-bal-num">{walletLoading ? '-' : (wallet?.gold || 0)}</span>
            <button className="am-btn" onClick={onShowExchangeModal} disabled={!wallet?.diamond}>兑换</button>
          </div>
        </div>

        <div className="am-row am-fund-row" onClick={() => onNavigate('/fund-center')}>
          <span className="am-fund-icon">🏛️</span>
          <span className="am-text">会员基金</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </div>
      </div>

      {/* 交易记录简化显示 */}
      <div className="am-records-split">
        <div className="am-records-column">
          <div className="am-column-header">
            <span>交易流水</span>
            {transactions.length > 0 && <span className="am-column-count">{transactionTotal}笔</span>}
          </div>
          <div className="am-column-content">
            {transactionLoading ? (
              <div className="am-column-loading"><div className="spinner"></div></div>
            ) : transactions.length > 0 ? (
              <div className="am-transaction-list">
                {transactions.slice(0, 5).map((tx) => (
                  <div key={tx.id} className={`am-tx-row ${tx.amount >= 0 ? 'income' : 'expense'}`}>
                    <div className="am-tx-left">
                      <div className="am-tx-icon">
                        {tx.currency_type === 'gold' ? <GoldIcon size="md" /> : <EntcoinIcon size="md" />}
                      </div>
                      <div className="am-tx-detail">
                        <span className="am-tx-name">{getBizTypeLabel(tx.biz_type)}</span>
                        <span className="am-tx-remark">{getBizTypeRemark(tx.biz_type) || getTransactionTypeLabel(tx.transaction_type)}</span>
                      </div>
                    </div>
                    <span className={`am-tx-value ${tx.amount >= 0 ? 'plus' : 'minus'}`}>
                      {tx.amount >= 0 ? '+' : ''}{tx.amount.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="am-column-empty"><p>暂无交易记录</p></div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

SubscriptionTab.displayName = 'SubscriptionTab';

SubscriptionTab.propTypes = {
  currentSubscription: PropTypes.object,
  wallet: PropTypes.object,
  walletLoading: PropTypes.bool,
  transactions: PropTypes.array,
  transactionLoading: PropTypes.bool,
  transactionTotal: PropTypes.number,
  transactionPage: PropTypes.number,
  billingHistory: PropTypes.array,
  billingLoading: PropTypes.bool,
  billingTotal: PropTypes.number,
  bizDisplayInfos: PropTypes.object,
  onNavigate: PropTypes.func.isRequired,
  onShowRechargeModal: PropTypes.func.isRequired,
  onShowExchangeModal: PropTypes.func.isRequired,
  onFetchTransactions: PropTypes.func,
};

export default SubscriptionTab;
