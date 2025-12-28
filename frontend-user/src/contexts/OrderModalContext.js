/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * OrderModalContext - 订单弹窗全局状态管理
 * 
 * 用于在任何组件中打开订单弹窗，支持会员订阅和充值两种模式
 */

import React, { createContext, useContext, useState, useCallback } from 'react';

const OrderModalContext = createContext(null);

/**
 * 订单弹窗配置类型
 * @typedef {Object} OrderModalConfig
 * @property {'subscription' | 'recharge'} mode - 模式：订阅或充值
 * @property {string} [planCode] - 套餐代码（subscription模式，可选）
 * @property {'monthly' | 'yearly'} [billingCycle] - 计费周期（subscription模式，可选）
 * @property {boolean} [skipPlanSelection] - 是否跳过套餐选择（已选套餐时为true）
 * @property {number} [rechargeAmount] - 充值金额（recharge模式）
 * @property {number} [rechargebonus] - 充值赠送金额（recharge模式）
 */

export const OrderModalProvider = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState({
    mode: 'subscription',
    planCode: null,
    billingCycle: 'monthly',
    skipPlanSelection: false,
    rechargeAmount: null,
    rechargebonus: 0
  });
  const [onSuccessCallback, setOnSuccessCallback] = useState(null);

  /**
   * 打开订单弹窗
   * @param {OrderModalConfig} modalConfig - 弹窗配置
   * @param {function} [onSuccess] - 支付成功回调
   */
  const openOrderModal = useCallback((modalConfig = {}, onSuccess = null) => {
    setConfig({
      mode: modalConfig.mode || 'subscription',
      planCode: modalConfig.planCode || null,
      billingCycle: modalConfig.billingCycle || 'monthly',
      skipPlanSelection: modalConfig.skipPlanSelection || false,
      rechargeAmount: modalConfig.rechargeAmount || null,
      rechargebonus: modalConfig.rechargebonus || 0
    });
    if (onSuccess) {
      setOnSuccessCallback(() => onSuccess);
    } else {
      setOnSuccessCallback(null);
    }
    setIsOpen(true);
  }, []);

  /**
   * 关闭订单弹窗
   */
  const closeOrderModal = useCallback(() => {
    setIsOpen(false);
    // 延迟清理配置，等待关闭动画完成
    setTimeout(() => {
      setConfig({
        mode: 'subscription',
        planCode: null,
        billingCycle: 'monthly',
        skipPlanSelection: false,
        rechargeAmount: null,
        rechargebonus: 0
      });
      setOnSuccessCallback(null);
    }, 300);
  }, []);

  /**
   * 支付成功处理
   * @param {Object} result - 支付结果
   */
  const handlePaymentSuccess = useCallback((result) => {
    if (onSuccessCallback) {
      onSuccessCallback(result);
    }
    closeOrderModal();
  }, [onSuccessCallback, closeOrderModal]);

  const value = {
    isOpen,
    config,
    openOrderModal,
    closeOrderModal,
    handlePaymentSuccess
  };

  return (
    <OrderModalContext.Provider value={value}>
      {children}
    </OrderModalContext.Provider>
  );
};

/**
 * 使用订单弹窗的 Hook
 * @returns {{
 *   isOpen: boolean,
 *   config: OrderModalConfig,
 *   openOrderModal: function,
 *   closeOrderModal: function,
 *   handlePaymentSuccess: function
 * }}
 */
export const useOrderModal = () => {
  const context = useContext(OrderModalContext);
  if (!context) {
    throw new Error('useOrderModal must be used within an OrderModalProvider');
  }
  return context;
};

export default OrderModalContext;

