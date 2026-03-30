/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import axios from 'axios';

// Use relative path so requests go through Nginx reverse proxy
// In production, this will be '' (empty), making requests to /api/v1/*
// In development, you can set REACT_APP_API_URL=http://localhost:8080 for direct backend access
const API_URL = process.env.REACT_APP_API_URL || '';

const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
});

const handleAuthFailure = (message = '登录已失效，请重新登录') => {
  localStorage.removeItem('user_token');
  localStorage.removeItem('user_data');
  window.dispatchEvent(new CustomEvent('auth:expired', {
    detail: { message }
  }));
  window.location.href = '/';
};

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('user_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      handleAuthFailure(error.response?.data?.message);
    }
    return Promise.reject(error);
  }
);

export const adminAPI = {
  login: (username, password) =>
    api.post('/admin/login', { username, password }),

  getProfile: () =>
    api.get('/admin/profile'),

  getDashboardStatistics: () =>
    api.get('/admin/dashboard/statistics'),

  updatePassword: (oldPassword, newPassword) =>
    api.put('/admin/password', { old_password: oldPassword, new_password: newPassword }),

  verifyPassword: (password) =>
    api.post('/admin/verify-password', { password }),

  updatePrivacyPolicy: (content, version) =>
    api.put('/admin/privacy-policy', { content, version }),

  updateTermsOfService: (content, version) =>
    api.put('/admin/terms-of-service', { content, version }),

  getEmailConfig: (showPassword = false) =>
    api.get('/admin/email-config', {
      params: showPassword ? { show_password: 'true' } : {}
    }),

  updateEmailConfig: (config) =>
    api.put('/admin/email-config', config),

  testEmailConfig: (config) =>
    api.post('/admin/email-config/test', config),

  getSMSConfig: (showSecret = false) =>
    api.get('/admin/sms-config', {
      params: showSecret ? { show_secret: 'true' } : {}
    }),

  updateSMSConfig: (config) =>
    api.put('/admin/sms-config', config),

  testSMSConfig: (config) =>
    api.post('/admin/sms-config/test', config),

  updateSystemConfig: (config) =>
    api.put('/admin/system-config', config),

  // GitHub OAuth configuration
  getGithubConfig: () =>
    api.get('/admin/github-config'),

  updateGithubConfig: (config) =>
    api.put('/admin/github-config', config),

  getUserStatistics: () =>
    api.get('/admin/users/stats'),

  getUserList: (page = 1, pageSize = 20, sortBy = 'last_login_at', sortOrder = 'desc') =>
    api.get('/admin/users', { params: { page, page_size: pageSize, sort_by: sortBy, sort_order: sortOrder } }),

  getOnlineUsers: () =>
    api.get('/admin/users/online'),

  getUserDetail: (userId) =>
    api.get(`/admin/users/${userId}`),

  getUserStatisticsChart: (params = {}) =>
    api.get('/admin/statistics/users', { params }),

  getOnlineUserChart: (params = {}) =>
    api.get('/admin/statistics/online', { params }),

  deleteUser: (userId) =>
    api.delete(`/admin/users/${userId}`),

  // 第三方账号管理
  getThirdPartyAccounts: (type = '', activeOnly = false) =>
    api.get('/admin/third-party-accounts', { params: { type, active: activeOnly } }),

  getThirdPartyAccount: (id) =>
    api.get(`/admin/third-party-accounts/${id}`),

  createThirdPartyAccount: (data) =>
    api.post('/admin/third-party-accounts', data),

  updateThirdPartyAccount: (id, data) =>
    api.put(`/admin/third-party-accounts/${id}`, data),

  deleteThirdPartyAccount: (id) =>
    api.delete(`/admin/third-party-accounts/${id}`),

  getThirdPartyAccountStats: () =>
    api.get('/admin/third-party-accounts/stats'),

  testThirdPartyAccount: (id) =>
    api.post(`/admin/third-party-accounts/${id}/test`),

  refreshThirdPartyAccountCache: () =>
    api.post('/admin/third-party-accounts/refresh-cache'),

  // Prompt template management
  getPromptTemplates: () =>
    api.get('/admin/prompt-templates'),

  getPromptTemplate: (id) =>
    api.get(`/admin/prompt-templates/${id}`),

  createPromptTemplate: (data) =>
    api.post('/admin/prompt-templates', data),

  updatePromptTemplate: (id, data) =>
    api.put(`/admin/prompt-templates/${id}`, data),

  deletePromptTemplate: (id) =>
    api.delete(`/admin/prompt-templates/${id}`),

  // 支付宝支付配置管理
  getAlipayConfigs: (showKeys = false) =>
    api.get('/admin/payment/alipay/configs', {
      params: showKeys ? { show_keys: 'true' } : {}
    }),

  getAlipayConfig: () =>
    api.get('/admin/payment/alipay/config'),

  createAlipayConfig: (data) =>
    api.post('/admin/payment/alipay/config', data),

  updateAlipayConfig: (id, data) =>
    api.put(`/admin/payment/alipay/config/${id}`, data),

  deleteAlipayConfig: (id) =>
    api.delete(`/admin/payment/alipay/config/${id}`),

  activateAlipayConfig: (id) =>
    api.post(`/admin/payment/alipay/config/${id}/activate`),

  // WeChat Pay configuration management
  getWeChatPayConfigs: (showKeys = false) =>
    api.get('/admin/payment/wechat/configs', {
      params: showKeys ? { show_keys: 'true' } : {}
    }),

  getWeChatPayConfig: () =>
    api.get('/admin/payment/wechat/config'),

  createWeChatPayConfig: (data) =>
    api.post('/admin/payment/wechat/config', data),

  updateWeChatPayConfig: (id, data) =>
    api.put(`/admin/payment/wechat/config/${id}`, data),

  deleteWeChatPayConfig: (id) =>
    api.delete(`/admin/payment/wechat/config/${id}`),

  activateWeChatPayConfig: (id) =>
    api.post(`/admin/payment/wechat/config/${id}/activate`),

  // WeChat OAuth configuration management
  getWeChatConfigs: (showSecret = false) =>
    api.get('/admin/wechat/configs', {
      params: showSecret ? { show_secret: 'true' } : {}
    }),

  getWeChatConfig: () =>
    api.get('/admin/wechat/config'),

  createWeChatConfig: (data) =>
    api.post('/admin/wechat/config', data),

  updateWeChatConfig: (id, data) =>
    api.put(`/admin/wechat/config/${id}`, data),

  deleteWeChatConfig: (id) =>
    api.delete(`/admin/wechat/config/${id}`),

  activateWeChatConfig: (id) =>
    api.post(`/admin/wechat/config/${id}/activate`),

  // WeChat Official Account configuration management
  getWeChatOfficialConfig: (showSensitive = false) =>
    api.get('/admin/wechat-official/config', {
      params: showSensitive ? { show_sensitive: 'true' } : {}
    }),

  updateWeChatOfficialConfig: (data) =>
    api.put('/admin/wechat-official/config', data),

  // Analysis dimensions management (默认业务数据)
  getAnalysisDimensions: () =>
    api.get('/admin/analysis/dimensions'),

  updateAnalysisDimension: (id, data) =>
    api.put(`/admin/analysis/dimensions/${id}`, data),

  // Feedback management
  getFeedbacks: (params = {}) => {
    const queryParams = {
      page: params.page || 1,
      pageSize: params.pageSize || 20,
    };
    if (params.status) queryParams.status = params.status;
    if (params.email) queryParams.email = params.email;
    if (params.keyword) queryParams.keyword = params.keyword;
    if (params.startDate) queryParams.startDate = params.startDate;
    if (params.endDate) queryParams.endDate = params.endDate;
    return api.get('/admin/feedbacks', { params: queryParams });
  },

  getFeedback: (id) =>
    api.get(`/admin/feedbacks/${id}`),

  getFeedbackStats: () =>
    api.get('/admin/feedbacks/stats'),

  updateFeedbackStatus: (id, status) =>
    api.put(`/admin/feedbacks/${id}/status`, { status }),

  replyFeedback: (id, replyContent) =>
    api.post(`/admin/feedbacks/${id}/reply`, { replyContent }),

  deleteFeedback: (id) =>
    api.delete(`/admin/feedbacks/${id}`),

  // Message management (站内信管理)
  getMessages: (params = {}) => {
    const queryParams = {
      page: params.page || 1,
      page_size: params.pageSize || 20,
    };
    if (params.category) queryParams.category = params.category;
    if (params.status) queryParams.status = params.status;
    if (params.keyword) queryParams.keyword = params.keyword;
    return api.get('/admin/messages', { params: queryParams });
  },

  getMessage: (id) =>
    api.get(`/admin/messages/${id}`),

  createMessage: (data) =>
    api.post('/admin/messages', data),

  sendMessage: (id) =>
    api.post(`/admin/messages/${id}/send`),

  getMessageStats: () =>
    api.get('/admin/messages/stats'),

  // Message template management (消息模板管理)
  getMessageTemplates: (params = {}) => {
    const queryParams = {
      page: params.page || 1,
      page_size: params.pageSize || 20,
    };
    if (params.category) queryParams.category = params.category;
    if (params.isActive !== undefined) queryParams.is_active = params.isActive;
    if (params.keyword) queryParams.keyword = params.keyword;
    return api.get('/admin/message-templates', { params: queryParams });
  },

  getMessageTemplate: (id) =>
    api.get(`/admin/message-templates/${id}`),

  createMessageTemplate: (data) =>
    api.post('/admin/message-templates', data),

  updateMessageTemplate: (id, data) =>
    api.put(`/admin/message-templates/${id}`, data),

  deleteMessageTemplate: (id) =>
    api.delete(`/admin/message-templates/${id}`),

  // Code Snippets management (SEO/广告代码片段管理)
  getCodeSnippets: (category = '') =>
    api.get('/admin/code-snippets', { params: category ? { category } : {} }),

  getCodeSnippet: (id) =>
    api.get(`/admin/code-snippets/${id}`),

  createCodeSnippet: (data) =>
    api.post('/admin/code-snippets', data),

  updateCodeSnippet: (id, data) =>
    api.put(`/admin/code-snippets/${id}`, data),

  deleteCodeSnippet: (id) =>
    api.delete(`/admin/code-snippets/${id}`),

  // ============================================================================
  // LaTeX Agent 配置管理
  // ============================================================================

  // 获取 LaTeX Agent 配置
  getLatexAgentConfig: () =>
    api.get('/admin/latex-agent/config'),

  // 更新 LaTeX Agent 配置
  updateLatexAgentConfig: (data) =>
    api.put('/admin/latex-agent/config', data),

  // 获取模型预设列表
  getLatexAgentModelPresets: () =>
    api.get('/admin/latex-agent/model-presets'),

  // 获取配置选项（截断策略、工具分类等）
  getLatexAgentConfigOptions: () =>
    api.get('/admin/latex-agent/config-options'),

  // 应用模型预设
  applyLatexAgentModelPreset: (provider, name) =>
    api.post('/admin/latex-agent/apply-preset', { provider, name }),

  // 测试模型连接
  testLatexAgentConnection: () =>
    api.post('/admin/latex-agent/test-connection'),

  // 获取支持的 API 格式
  getLatexAgentApiFormats: () =>
    api.get('/admin/latex-agent/api-formats'),

  // LaTeX Agent 模型管理
  getLatexAgentModels: () =>
    api.get('/admin/latex-agent/models'),

  createLatexAgentModel: (data) =>
    api.post('/admin/latex-agent/models', data),

  updateLatexAgentModel: (id, data) =>
    api.put(`/admin/latex-agent/models/${id}`, data),

  deleteLatexAgentModel: (id) =>
    api.delete(`/admin/latex-agent/models/${id}`),

  setDefaultLatexAgentModel: (id) =>
    api.post(`/admin/latex-agent/models/${id}/set-default`),
};

export default api;
