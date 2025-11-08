import api from './api';

/**
 * 订阅服务 API
 */

// 获取当前用户的订阅信息
export const getMySubscription = () => {
  return api.get('/user/subscription/my');
};

// 获取订阅使用情况
export const getUsage = () => {
  return api.get('/user/subscription/usage');
};

// 获取订阅配额信息
export const getQuota = () => {
  return api.get('/user/subscription/quota');
};

// 获取所有订阅计划
export const getPlans = () => {
  return api.get('/user/subscription/plans');
};

// 检查配额
export const checkQuota = () => {
  return api.get('/user/subscription/check-quota');
};

// 续订订阅
export const renewSubscription = (planId) => {
  return api.post('/user/subscription/renew', { plan_id: planId });
};

export default {
  getMySubscription,
  getUsage,
  getQuota,
  getPlans,
  checkQuota,
  renewSubscription
};
