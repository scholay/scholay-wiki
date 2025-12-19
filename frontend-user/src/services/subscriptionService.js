/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import api from './api';

/**
 * 订阅服务 API
 */

// 获取当前用户的订阅信息
export const getMySubscription = () => {
  return api.get('/user/subscription/my');
};

// 获取订阅使用情况
// Deprecated: 配额统计已废弃，现在使用货币系统进行扣费控制
export const getUsage = () => {
  return api.get('/user/subscription/usage');
};

// 获取订阅配额信息
// Deprecated: 配额信息已废弃，现在使用货币系统进行扣费控制
export const getQuota = () => {
  return api.get('/user/subscription/quota');
};

// 获取所有订阅计划
export const getPlans = () => {
  return api.get('/user/subscription/plans');
};

// 检查配额
// Deprecated: 配额检查已废弃，现在使用货币系统进行扣费控制。此方法始终返回 has_quota: true
export const checkQuota = () => {
  return api.get('/user/subscription/check-quota');
};

// 续订订阅
export const renewSubscription = (planId) => {
  return api.post('/user/subscription/renew', { plan_id: planId });
};

const subscriptionService = {
  getMySubscription,
  getUsage,
  getQuota,
  getPlans,
  checkQuota,
  renewSubscription
};

export default subscriptionService;
