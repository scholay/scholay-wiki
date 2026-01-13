/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * 资产管理 Tab 组件
 */

import React, { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrderModal } from '../../../contexts/OrderModalContext';
import { useRechargeModal } from '../../../contexts/RechargeModalContext';
import EntcoinIcon from '../../../components/EntcoinIcon';
import GoldIcon from '../../../components/GoldIcon';

const SubscriptionTab = memo(({
  // Subscription
  currentSubscription,
  // Billing
  billingHistory,
  billingTotal,
  billingLoading,
  // Wallet
  wallet,
  walletLoading,
  fetchWalletData,
  // Transactions
  transactions,
  transactionPage,
  transactionTotal,
  transactionLoading,
  fetchTransactions,
  // Exchange
  exchangeRate,
  exchangeAmount,
  exchangeLoading,
  showExchangeModal,
  setExchangeAmount,
  setShowExchangeModal,
  handleExchange,
  // Fund
  currentFund,
  fundLoading,
  // Biz display
  bizDisplayInfos,
}) => {
  const navigate = useNavigate();
  const { openOrderModal } = useOrderModal();
  const { openRechargeModal } = useRechargeModal();

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
    if (bizDisplayInfos[bizType]?.display_name) {
      return bizDisplayInfos[bizType].display_name;
    }
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

  // 获取业务类型备注
  const getBizTypeRemark = (bizType) => {
    if (bizDisplayInfos[bizType]?.display_remark) {
      return bizDisplayInfos[bizType].display_remark;
    }
    return null;
  };

  return (
    <div className="settings-section subscription-section">
      <h2>资产管理</h2>

      {/* 主卡片 */}
      <div className={`am-card ${currentSubscription?.plan_code || 'free'}`}>
        {/* 会员行 */}
        <div className="am-row am-member-row" onClick={() => {
          if (currentSubscription?.plan_code === 'free') {
            openOrderModal({ mode: 'subscription' });
          } else {
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
          {/* 左侧：钱包 */}
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
                  {transactions.map((tx) => (
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
});

export default SubscriptionTab;
