/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * WalletSection - 钱包区域组件
 */

import React, { memo } from 'react';
import PropTypes from 'prop-types';
import EntcoinIcon from '../EntcoinIcon';
import GoldIcon from '../GoldIcon';

const WalletSection = memo(({
  wallet,
  loading,
  onRecharge,
  onExchange,
}) => {
  if (loading) {
    return (
      <div className="wallet-section wallet-loading">
        <div className="wallet-skeleton">
          <div className="skeleton-line"></div>
          <div className="skeleton-line short"></div>
        </div>
      </div>
    );
  }

  if (!wallet) {
    return (
      <div className="wallet-section wallet-empty">
        <p>钱包信息加载失败</p>
      </div>
    );
  }

  return (
    <div className="wallet-section">
      <div className="wallet-cards">
        {/* 恩特币卡片 */}
        <div className="wallet-card entcoin-card">
          <div className="wallet-card-header">
            <EntcoinIcon size="lg" />
            <span className="wallet-card-title">恩特币</span>
          </div>
          <div className="wallet-card-balance">
            <span className="balance-value">{wallet.entcoin || 0}</span>
          </div>
          <div className="wallet-card-actions">
            <button 
              className="btn-recharge"
              onClick={onRecharge}
            >
              充值
            </button>
          </div>
        </div>

        {/* 经费卡片 */}
        <div className="wallet-card gold-card">
          <div className="wallet-card-header">
            <GoldIcon size="lg" />
            <span className="wallet-card-title">经费</span>
          </div>
          <div className="wallet-card-balance">
            <span className="balance-value">{wallet.gold || 0}</span>
          </div>
          <div className="wallet-card-actions">
            <button 
              className="btn-exchange"
              onClick={onExchange}
            >
              兑换
            </button>
          </div>
        </div>
      </div>

      {/* 钱包说明 */}
      <div className="wallet-tips">
        <p className="tip-item">
          <EntcoinIcon size="sm" />
          <span>恩特币可通过充值获得，用于购买会员等付费服务</span>
        </p>
        <p className="tip-item">
          <GoldIcon size="sm" />
          <span>经费可通过签到、邀请等活动获得，可兑换为恩特币</span>
        </p>
      </div>
    </div>
  );
});

WalletSection.displayName = 'WalletSection';

WalletSection.propTypes = {
  wallet: PropTypes.shape({
    entcoin: PropTypes.number,
    gold: PropTypes.number,
  }),
  loading: PropTypes.bool,
  onRecharge: PropTypes.func,
  onExchange: PropTypes.func,
};

export default WalletSection;

