import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || '';

const adminAxios = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
});

adminAxios.interceptors.request.use(
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

adminAxios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('user_token');
      localStorage.removeItem('user_data');
      window.dispatchEvent(new CustomEvent('auth:expired'));
    }
    return Promise.reject(error);
  }
);

export const adminAPI = {
  login: (username, password) =>
    adminAxios.post('/admin/login', { username, password }),

  getProfile: () =>
    adminAxios.get('/admin/profile'),

  getDashboardStatistics: () =>
    adminAxios.get('/admin/dashboard/statistics'),

  updatePassword: (oldPassword, newPassword) =>
    adminAxios.put('/admin/password', { old_password: oldPassword, new_password: newPassword }),

  verifyPassword: (password) =>
    adminAxios.post('/admin/verify-password', { password }),

  updatePrivacyPolicy: (content, version) =>
    adminAxios.put('/admin/privacy-policy', { content, version }),

  updateTermsOfService: (content, version) =>
    adminAxios.put('/admin/terms-of-service', { content, version }),

  getEmailConfig: (showPassword = false) =>
    adminAxios.get('/admin/email-config', {
      params: showPassword ? { show_password: 'true' } : {}
    }),

  updateEmailConfig: (config) =>
    adminAxios.put('/admin/email-config', config),

  testEmailConfig: (config) =>
    adminAxios.post('/admin/email-config/test', config),

  getSMSConfig: (showSecret = false) =>
    adminAxios.get('/admin/sms-config', {
      params: showSecret ? { show_secret: 'true' } : {}
    }),

  updateSMSConfig: (config) =>
    adminAxios.put('/admin/sms-config', config),

  testSMSConfig: (config) =>
    adminAxios.post('/admin/sms-config/test', config),

  updateSystemConfig: (config) =>
    adminAxios.put('/admin/system-config', config),

  getGithubConfig: () =>
    adminAxios.get('/admin/github-config'),

  updateGithubConfig: (config) =>
    adminAxios.put('/admin/github-config', config),

  getUserStatistics: () =>
    adminAxios.get('/admin/users/stats'),

  getUserList: (page = 1, pageSize = 20, sortBy = 'last_login_at', sortOrder = 'desc') =>
    adminAxios.get('/admin/users', { params: { page, page_size: pageSize, sort_by: sortBy, sort_order: sortOrder } }),

  getOnlineUsers: () =>
    adminAxios.get('/admin/users/online'),

  getUserDetail: (userId) =>
    adminAxios.get(`/admin/users/${userId}`),

  getUserStatisticsChart: (params = {}) =>
    adminAxios.get('/admin/statistics/users', { params }),

  getOnlineUserChart: (params = {}) =>
    adminAxios.get('/admin/statistics/online', { params }),

  deleteUser: (userId) =>
    adminAxios.delete(`/admin/users/${userId}`),

  getThirdPartyAccounts: (type = '', activeOnly = false) =>
    adminAxios.get('/admin/third-party-accounts', { params: { type, active: activeOnly } }),

  getThirdPartyAccount: (id) =>
    adminAxios.get(`/admin/third-party-accounts/${id}`),

  createThirdPartyAccount: (data) =>
    adminAxios.post('/admin/third-party-accounts', data),

  updateThirdPartyAccount: (id, data) =>
    adminAxios.put(`/admin/third-party-accounts/${id}`, data),

  deleteThirdPartyAccount: (id) =>
    adminAxios.delete(`/admin/third-party-accounts/${id}`),

  getThirdPartyAccountStats: () =>
    adminAxios.get('/admin/third-party-accounts/stats'),

  testThirdPartyAccount: (id) =>
    adminAxios.post(`/admin/third-party-accounts/${id}/test`),

  refreshThirdPartyAccountCache: () =>
    adminAxios.post('/admin/third-party-accounts/refresh-cache'),

  getPromptTemplates: () =>
    adminAxios.get('/admin/prompt-templates'),

  getPromptTemplate: (id) =>
    adminAxios.get(`/admin/prompt-templates/${id}`),

  createPromptTemplate: (data) =>
    adminAxios.post('/admin/prompt-templates', data),

  updatePromptTemplate: (id, data) =>
    adminAxios.put(`/admin/prompt-templates/${id}`, data),

  deletePromptTemplate: (id) =>
    adminAxios.delete(`/admin/prompt-templates/${id}`),

  getWeChatConfigs: (showSecret = false) =>
    adminAxios.get('/admin/wechat/configs', {
      params: showSecret ? { show_secret: 'true' } : {}
    }),

  getWeChatConfig: () =>
    adminAxios.get('/admin/wechat/config'),

  createWeChatConfig: (data) =>
    adminAxios.post('/admin/wechat/config', data),

  updateWeChatConfig: (id, data) =>
    adminAxios.put(`/admin/wechat/config/${id}`, data),

  deleteWeChatConfig: (id) =>
    adminAxios.delete(`/admin/wechat/config/${id}`),

  activateWeChatConfig: (id) =>
    adminAxios.post(`/admin/wechat/config/${id}/activate`),

  getWeChatOfficialConfig: (showSensitive = false) =>
    adminAxios.get('/admin/wechat-official/config', {
      params: showSensitive ? { show_sensitive: 'true' } : {}
    }),

  updateWeChatOfficialConfig: (data) =>
    adminAxios.put('/admin/wechat-official/config', data),

  getAnalysisDimensions: () =>
    adminAxios.get('/admin/analysis/dimensions'),

  updateAnalysisDimension: (id, data) =>
    adminAxios.put(`/admin/analysis/dimensions/${id}`, data),

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
    return adminAxios.get('/admin/feedbacks', { params: queryParams });
  },

  getFeedback: (id) =>
    adminAxios.get(`/admin/feedbacks/${id}`),

  getFeedbackStats: () =>
    adminAxios.get('/admin/feedbacks/stats'),

  updateFeedbackStatus: (id, status) =>
    adminAxios.put(`/admin/feedbacks/${id}/status`, { status }),

  replyFeedback: (id, replyContent) =>
    adminAxios.post(`/admin/feedbacks/${id}/reply`, { replyContent }),

  deleteFeedback: (id) =>
    adminAxios.delete(`/admin/feedbacks/${id}`),

  getMessages: (params = {}) => {
    const queryParams = {
      page: params.page || 1,
      page_size: params.pageSize || 20,
    };
    if (params.category) queryParams.category = params.category;
    if (params.status) queryParams.status = params.status;
    if (params.keyword) queryParams.keyword = params.keyword;
    return adminAxios.get('/admin/messages', { params: queryParams });
  },

  getMessage: (id) =>
    adminAxios.get(`/admin/messages/${id}`),

  createMessage: (data) =>
    adminAxios.post('/admin/messages', data),

  sendMessage: (id) =>
    adminAxios.post(`/admin/messages/${id}/send`),

  getMessageStats: () =>
    adminAxios.get('/admin/messages/stats'),

  getMessageTemplates: (params = {}) => {
    const queryParams = {
      page: params.page || 1,
      page_size: params.pageSize || 20,
    };
    if (params.category) queryParams.category = params.category;
    if (params.isActive !== undefined) queryParams.is_active = params.isActive;
    if (params.keyword) queryParams.keyword = params.keyword;
    return adminAxios.get('/admin/message-templates', { params: queryParams });
  },

  getMessageTemplate: (id) =>
    adminAxios.get(`/admin/message-templates/${id}`),

  createMessageTemplate: (data) =>
    adminAxios.post('/admin/message-templates', data),

  updateMessageTemplate: (id, data) =>
    adminAxios.put(`/admin/message-templates/${id}`, data),

  deleteMessageTemplate: (id) =>
    adminAxios.delete(`/admin/message-templates/${id}`),

  getCodeSnippets: (category = '') =>
    adminAxios.get('/admin/code-snippets', { params: category ? { category } : {} }),

  getCodeSnippet: (id) =>
    adminAxios.get(`/admin/code-snippets/${id}`),

  createCodeSnippet: (data) =>
    adminAxios.post('/admin/code-snippets', data),

  updateCodeSnippet: (id, data) =>
    adminAxios.put(`/admin/code-snippets/${id}`, data),

  deleteCodeSnippet: (id) =>
    adminAxios.delete(`/admin/code-snippets/${id}`),

  getLatexAgentConfig: () =>
    adminAxios.get('/admin/latex-agent/config'),

  updateLatexAgentConfig: (data) =>
    adminAxios.put('/admin/latex-agent/config', data),

  getLatexAgentModelPresets: () =>
    adminAxios.get('/admin/latex-agent/model-presets'),

  getLatexAgentConfigOptions: () =>
    adminAxios.get('/admin/latex-agent/config-options'),

  applyLatexAgentModelPreset: (provider, name) =>
    adminAxios.post('/admin/latex-agent/apply-preset', { provider, name }),

  testLatexAgentConnection: () =>
    adminAxios.post('/admin/latex-agent/test-connection'),

  getLatexAgentApiFormats: () =>
    adminAxios.get('/admin/latex-agent/api-formats'),

  getLatexAgentModels: () =>
    adminAxios.get('/admin/latex-agent/models'),

  createLatexAgentModel: (data) =>
    adminAxios.post('/admin/latex-agent/models', data),

  updateLatexAgentModel: (id, data) =>
    adminAxios.put(`/admin/latex-agent/models/${id}`, data),

  deleteLatexAgentModel: (id) =>
    adminAxios.delete(`/admin/latex-agent/models/${id}`),

  setDefaultLatexAgentModel: (id) =>
    adminAxios.post(`/admin/latex-agent/models/${id}/set-default`),
};

export default adminAxios;
