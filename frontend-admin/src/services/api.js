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

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('admin_token');
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
    if (error.response?.status === 401) {
      // Unauthorized - clear token and redirect to login
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const adminAPI = {
  login: (username, password) =>
    api.post('/admin/login', { username, password }),

  getProfile: () =>
    api.get('/admin/profile'),

  updatePassword: (oldPassword, newPassword) =>
    api.put('/admin/password', { old_password: oldPassword, new_password: newPassword }),

  updatePrivacyPolicy: (content, version) =>
    api.put('/admin/privacy-policy', { content, version }),

  updateTermsOfService: (content, version) =>
    api.put('/admin/terms-of-service', { content, version }),

  getEmailConfig: () =>
    api.get('/admin/email-config'),

  updateEmailConfig: (config) =>
    api.put('/admin/email-config', config),

  testEmailConfig: (config) =>
    api.post('/admin/email-config/test', config),

  getSMSConfig: () =>
    api.get('/admin/sms-config'),

  updateSMSConfig: (config) =>
    api.put('/admin/sms-config', config),

  testSMSConfig: (config) =>
    api.post('/admin/sms-config/test', config),

  updateSystemConfig: (config) =>
    api.put('/admin/system-config', config),

  getUserStatistics: () =>
    api.get('/admin/users/stats'),

  getUserList: (page = 1, pageSize = 20) =>
    api.get('/admin/users', { params: { page, page_size: pageSize } }),

  getOnlineUsers: () =>
    api.get('/admin/users/online'),

  getUserStatisticsChart: (days = 30) =>
    api.get('/admin/statistics/users', { params: { days } }),

  getOnlineUserChart: (hours = 24) =>
    api.get('/admin/statistics/online', { params: { hours } }),

  deleteUser: (userId) =>
    api.delete(`/admin/users/${userId}`),

  // Third-party account management
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

  // Subscription plan management
  getSubscriptionPlans: () =>
    api.get('/user/subscription/plans'),

  updateSubscriptionPlan: (id, data) =>
    api.put(`/admin/subscription-plans/${id}`, data),

  // Alipay payment configuration management
  getAlipayConfigs: () =>
    api.get('/admin/payment/alipay/configs'),

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

  // WeChat OAuth configuration management
  getWeChatConfigs: () =>
    api.get('/admin/wechat/configs'),

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
};

export default api;
