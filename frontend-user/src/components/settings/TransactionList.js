/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * TransactionList - 交易流水列表组件
 */

import React, { memo } from 'react';
import PropTypes from 'prop-types';
import EntcoinIcon from '../EntcoinIcon';
import GoldIcon from '../GoldIcon';

// 交易类型映射
const TRANSACTION_TYPE_MAP = {
  daily_checkin: { label: '每日签到', color: 'green' },
  register_gift: { label: '注册奖励', color: 'green' },
  invite_reward: { label: '邀请奖励', color: 'green' },
  exchange: { label: '兑换', color: 'blue' },
  recharge: { label: '充值', color: 'green' },
  consume: { label: '消费', color: 'red' },
  refund: { label: '退款', color: 'green' },
  subscription: { label: '订阅', color: 'red' },
  ai_chat: { label: 'AI 对话', color: 'red' },
  ai_analysis: { label: 'AI 分析', color: 'red' },
  peer_review: { label: '同行评审', color: 'red' },
};

const TransactionItem = memo(({ transaction, bizDisplayInfo }) => {
  const typeInfo = TRANSACTION_TYPE_MAP[transaction.bizType] || { 
    label: transaction.bizType, 
    color: 'gray' 
  };
  
  const isIncome = transaction.amount > 0;
  const displayInfo = bizDisplayInfo || {};

  return (
    <div className={`transaction-item ${isIncome ? 'income' : 'expense'}`}>
      <div className="transaction-info">
        <div className="transaction-type">
          <span className={`type-badge ${typeInfo.color}`}>
            {displayInfo.label || typeInfo.label}
          </span>
        </div>
        <div className="transaction-details">
          <span className="transaction-desc">
            {displayInfo.description || transaction.description || '-'}
          </span>
          <span className="transaction-time">
            {new Date(transaction.createdAt).toLocaleString('zh-CN')}
          </span>
        </div>
      </div>
      <div className="transaction-amount">
        <span className={`amount ${isIncome ? 'positive' : 'negative'}`}>
          {isIncome ? '+' : ''}{transaction.amount}
        </span>
        {transaction.currencyType === 'entcoin' ? (
          <EntcoinIcon size="sm" />
        ) : (
          <GoldIcon size="sm" />
        )}
      </div>
    </div>
  );
});

TransactionItem.displayName = 'TransactionItem';

const TransactionList = memo(({
  transactions = [],
  loading,
  currentPage,
  totalPages,
  onPageChange,
  filter,
  bizFilter,
  onFilterChange,
  onBizFilterChange,
  bizDisplayInfos = {},
}) => {
  const filterOptions = [
    { value: 'all', label: '全部' },
    { value: 'entcoin', label: '恩特币' },
    { value: 'gold', label: '经费' },
  ];

  const bizFilterOptions = [
    { value: 'all', label: '全部类型' },
    { value: 'daily_checkin', label: '签到' },
    { value: 'register_gift', label: '注册奖励' },
    { value: 'invite_reward', label: '邀请奖励' },
    { value: 'exchange', label: '兑换' },
    { value: 'recharge', label: '充值' },
    { value: 'consume', label: '消费' },
  ];

  return (
    <div className="transaction-list-container">
      {/* 筛选器 */}
      <div className="transaction-filters">
        <div className="filter-group">
          <label>货币类型</label>
          <select 
            value={filter} 
            onChange={(e) => onFilterChange(e.target.value)}
          >
            {filterOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>交易类型</label>
          <select 
            value={bizFilter} 
            onChange={(e) => onBizFilterChange(e.target.value)}
          >
            {bizFilterOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 交易列表 */}
      <div className="transaction-list">
        {loading ? (
          <div className="transaction-loading">
            <div className="loading-spinner"></div>
            <span>加载中...</span>
          </div>
        ) : transactions.length === 0 ? (
          <div className="transaction-empty">
            <p>暂无交易记录</p>
          </div>
        ) : (
          <>
            {transactions.map((tx) => (
              <TransactionItem 
                key={tx.id} 
                transaction={tx}
                bizDisplayInfo={bizDisplayInfos[tx.bizType]}
              />
            ))}
          </>
        )}
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="transaction-pagination">
          <button
            className="pagination-btn"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1 || loading}
          >
            上一页
          </button>
          <span className="pagination-info">
            {currentPage} / {totalPages}
          </span>
          <button
            className="pagination-btn"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages || loading}
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
});

TransactionList.displayName = 'TransactionList';

TransactionList.propTypes = {
  transactions: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    bizType: PropTypes.string,
    amount: PropTypes.number,
    currencyType: PropTypes.string,
    description: PropTypes.string,
    createdAt: PropTypes.string,
  })),
  loading: PropTypes.bool,
  currentPage: PropTypes.number,
  totalPages: PropTypes.number,
  onPageChange: PropTypes.func,
  filter: PropTypes.string,
  bizFilter: PropTypes.string,
  onFilterChange: PropTypes.func,
  onBizFilterChange: PropTypes.func,
  bizDisplayInfos: PropTypes.object,
};

export default TransactionList;

