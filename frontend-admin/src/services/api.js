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

  updateEmailConfig: (config) =>
    api.put('/admin/email-config', config),

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
};

export default api;
