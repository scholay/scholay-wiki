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

// Token 刷新状态
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// 允许未登录访问的页面路径白名单（401/403 错误时不自动重定向）
const AUTH_WHITELIST_PATHS = [
  '/',
  '/search-results',
  '/advanced-search',
  '/chat',
  '/peer-review',
  '/assistant',
  '/pricing',
];

// 检查当前页面是否在白名单中
const isInAuthWhitelist = () => {
  const currentPath = window.location.pathname;
  return AUTH_WHITELIST_PATHS.some(path => currentPath === path || currentPath.startsWith(path + '/'));
};

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => {
    // 检查响应体中的业务错误码
    // 2019 = 被其他设备登录踢出
    if (response.data?.code === 2019) {
      localStorage.removeItem('user_token');
      localStorage.removeItem('user_data');
      window.dispatchEvent(new CustomEvent('auth:expired', {
        detail: { 
          message: response.data?.message || '您的账号已在其他设备登录',
          reason: 'kicked'
        }
      }));
      // 白名单页面不自动重定向
      if (!isInAuthWhitelist()) {
        window.location.href = '/';
      }
      return Promise.reject(new Error(response.data?.message || '您的账号已在其他设备登录'));
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // 处理 401 (未授权) 错误 - 尝试刷新 Token
    if (error.response?.status === 401 && !originalRequest._retry) {
      // 如果当前页面在白名单中，且没有 token，直接返回错误，不尝试刷新
      const token = localStorage.getItem('user_token');
      if (!token && isInAuthWhitelist()) {
        return Promise.reject(error);
      }

      // 如果是刷新 Token 的请求失败，直接登出
      if (originalRequest.url === '/user/refresh-token') {
        localStorage.removeItem('user_token');
        localStorage.removeItem('user_data');
        window.dispatchEvent(new CustomEvent('auth:expired', {
          detail: { message: '登录已失效，请重新登录' }
        }));
        // 白名单页面不自动重定向
        if (!isInAuthWhitelist()) {
          window.location.href = '/';
        }
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // 如果正在刷新，将请求加入队列
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          originalRequest.headers['Authorization'] = 'Bearer ' + token;
          return api(originalRequest);
        }).catch(err => {
          return Promise.reject(err);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const response = await api.post('/user/refresh-token');
        if (response.data.code === 0 && response.data.data?.token) {
          const newToken = response.data.data.token;
          localStorage.setItem('user_token', newToken);
          api.defaults.headers.common['Authorization'] = 'Bearer ' + newToken;
          processQueue(null, newToken);
          originalRequest.headers['Authorization'] = 'Bearer ' + newToken;
          return api(originalRequest);
        } else {
          // 刷新 Token 业务失败（code !== 0），也需要登出
          throw new Error(response.data.message || '刷新登录状态失败');
        }
      } catch (refreshError) {
        processQueue(refreshError, null);
        // 刷新失败，清除 Token 并登出
        localStorage.removeItem('user_token');
        localStorage.removeItem('user_data');
        
        // 根据错误码区分不同的情况
        const errorCode = refreshError.response?.data?.code;
        const errorMessage = refreshError.response?.data?.message || refreshError.message;
        let message = '登录已失效，请重新登录';
        let reason = 'expired'; // 默认原因：过期
        
        if (errorCode === 2019) {
          // 被其他设备登录踢出
          message = errorMessage || '您的账号已在其他设备登录';
          reason = 'kicked';
        } else if (errorCode === 2016) {
          // 会话超过30天
          message = '登录已过期，请重新登录';
          reason = 'session_expired';
        }
        
        window.dispatchEvent(new CustomEvent('auth:expired', {
          detail: { message, reason }
        }));
        // 白名单页面不自动重定向
        if (!isInAuthWhitelist()) {
          window.location.href = '/';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // 处理 403 (禁止访问) 错误
    if (error.response?.status === 403) {
      localStorage.removeItem('user_token');
      localStorage.removeItem('user_data');

      const message = error.response?.data?.message || '访问被拒绝，请重新登录';

      window.dispatchEvent(new CustomEvent('auth:expired', {
        detail: { message }
      }));

      // 白名单页面不自动重定向
      if (!isInAuthWhitelist()) {
        window.location.href = '/';
      }
    }
    return Promise.reject(error);
  }
);

export const userAPI = {
  sendVerificationCode: (email, purpose) =>
    api.post('/user/send-code', { email, purpose }),

  register: (email, password, code) =>
    api.post('/user/register', { email, password, code }),

  login: (email, password) =>
    api.post('/user/login', { email, password }),

  logout: () =>
    api.post('/user/logout'),

  heartbeat: () =>
    api.post('/user/heartbeat'),

  // Token 刷新接口
  refreshToken: () =>
    api.post('/user/refresh-token'),

  // 获取 Token 信息（过期时间等）
  getTokenInfo: () =>
    api.get('/user/token-info'),

  getProfile: () =>
    api.get('/user/profile'),

  updateProfile: (username, avatarURL) =>
    api.put('/user/profile', { username, avatar_url: avatarURL }),

  // WeChat OAuth
  getWeChatLoginURL: () =>
    api.get('/user/wechat/login-url'),

  wechatCallback: (code, state, invitationCode = null) =>
    api.post('/user/wechat/callback', { 
      code, 
      state,
      ...(invitationCode && { invitation_code: invitationCode })
    }),

  bindWeChatAccount: (code, state) =>
    api.post('/user/bind-wechat', { code, state }),

  // GitHub OAuth
  getGithubLoginURL: () =>
    api.get('/user/github/login-url'),

  githubCallback: (code, state, invitationCode = null) => {
    let url = `/user/github/callback?code=${code}&state=${state}`;
    if (invitationCode) {
      url += `&invitation_code=${encodeURIComponent(invitationCode)}`;
    }
    return api.get(url);
  },

  bindGitHubAccount: (code, state) =>
    api.post('/user/bind-github', { code, state }),

  bindEmailWithPassword: (email, password, code) =>
    api.post('/user/bind-email-with-password', { email, password, code }),

  bindPhoneWithPassword: (phone, password, code) =>
    api.post('/user/bind-phone-with-password', { phone, password, code }),
};

export const conversationAPI = {
  // Get all conversations for current user, optionally filtered by type
  getConversations: (page = 1, pageSize = 20, conversationType = null) => {
    const params = { page, page_size: pageSize };
    if (conversationType) {
      params.conversation_type = conversationType;
    }
    return api.get('/user/conversations', { params });
  },

  // Create a new conversation
  createConversation: (title, conversationType = 'search') =>
    api.post('/user/conversations', { title, conversation_type: conversationType }),

  // Get a conversation with all messages
  getConversation: (id) =>
    api.get(`/user/conversations/${id}`),

  // Delete a conversation
  deleteConversation: (id) =>
    api.delete(`/user/conversations/${id}`),

  // Add a message to a conversation (with optional paper search)
  addMessage: (conversationId, content, searchQuery = '', searchPapers = false) =>
    api.post(`/user/conversations/${conversationId}/messages`, {
      content,
      search_query: searchQuery,
      search_papers: searchPapers,
    }),

  // Continue conversation (streaming)
  continueConversation: (conversationId, content, mode = 'continue') =>
    api.post(`/user/conversations/${conversationId}/continue`, {
      content,
      mode,
    }),

  // Update conversation title
  updateTitle: (conversationId, title) =>
    api.put(`/user/conversations/${conversationId}/title`, { title }),

  // Get sibling messages for branch navigation
  getSiblingMessages: (messageId) =>
    api.get(`/user/conversations/messages/${messageId}/siblings`),

  // Get complete branch chain (from root to leaf) for a message
  getBranchChain: (messageId) =>
    api.get(`/user/conversations/messages/${messageId}/branch`),

  // Get follow-up questions for a message (generated by AI)
  getFollowUpQuestions: (conversationId, messageId) =>
    api.get(`/user/conversations/${conversationId}/messages/${messageId}/follow-up-questions`),
};

export const scholarAPI = {
  // Search papers (学术检索 - 改为POST请求)
  searchPapers: (params) =>
    api.post('/scholar/papers/search', params),

  // Get paper details
  getPaper: (paperId) =>
    api.get(`/scholar/papers/${paperId}`),

  // Get paper citations
  getCitations: (paperId, params) =>
    api.get(`/scholar/papers/${paperId}/citations`, { params }),

  // Get paper references
  getReferences: (paperId, params) =>
    api.get(`/scholar/papers/${paperId}/references`, { params }),

  // Batch get paper details
  getPaperBatch: (paperIds, fields) =>
    api.post('/scholar/papers/batch', { paperIds, fields }),

  // Get paper recommendations (相似论文) - 只返回论文ID列表
  getRecommendations: (paperId, limit = 100) => {
    const params = { limit };
    return api.get(`/scholar/recommendations/papers/${paperId}`, { params });
  },
};

// 公共API - 不需要认证
export const publicApi = axios.create({
  baseURL: `${API_URL}/api/v1/public`,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const publicScholarAPI = {
  // Public search papers (公共学术检索 - 不需要登录)
  searchPapers: (params) =>
    publicApi.post('/papers/search', params),
  
  // Public get paper details (获取论文详情 - 不需要登录)
  getPaper: (paperId, fields) =>
    publicApi.get(`/papers/${paperId}`, { 
      params: { 
        fields: fields || 'paperId,title,abstract,authors,year,citationCount,referenceCount,venue,publicationDate,publicationTypes,fieldsOfStudy,s2FieldsOfStudy,externalIds,url,openAccessPdf,influentialCitationCount,isOpenAccess,tldr,journal,citations.paperId,citations.externalIds,citations.url,citations.title,citations.abstract,citations.venue,citations.publicationVenue,citations.year,citations.referenceCount,citations.citationCount,citations.influentialCitationCount,citations.openAccessPdf,citations.s2FieldsOfStudy,citations.publicationTypes,citations.publicationDate,citations.journal,citations.citationStyles,citations.authors,references.paperId,references.externalIds,references.url,references.title,references.abstract,references.venue,references.publicationVenue,references.year,references.referenceCount,references.citationCount,references.influentialCitationCount,references.openAccessPdf,references.s2FieldsOfStudy,references.publicationTypes,references.publicationDate,references.journal,references.citationStyles,references.authors'
      } 
    }),

  // Public paper analysis (AI分析论文摘要 - 不需要登录)
  // paperId用于数据库缓存，优先从缓存获取
  analyzePaper: (paperId, title, abstract) =>
    publicApi.post('/papers/analyze', { paperId, title, abstract }),

  // Public analysis dimensions (获取系统默认分析维度 - 不需要登录)
  getSystemDimensions: () =>
    publicApi.get('/analysis/dimensions'),

  // Public search suggestions (搜索建议 - 论文标题自动补全 + 作者搜索)
  // 并行请求 paper autocomplete 和 author search API
  getSearchSuggestions: (query, paperLimit = 5, authorLimit = 5) =>
    publicApi.get('/search/suggestions', { 
      params: { query, paperLimit, authorLimit } 
    }),

  // Public paper autocomplete (论文标题自动补全 - 不需要登录)
  getPaperAutocomplete: (query) =>
    publicApi.get('/papers/autocomplete', { params: { query } }),

  // Public batch get paper details (批量获取论文详情 - 不需要登录)
  getPaperBatch: (paperIds, fields) =>
    publicApi.post('/papers/batch', { paperIds, fields }),

  // Public get paper recommendations (获取相似论文 - 不需要登录)
  getRecommendations: (paperId, limit = 100) => {
    const params = { limit };
    return publicApi.get(`/recommendations/papers/${paperId}`, { params });
  },

  // Public get author details (获取作者详情 - 不需要登录)
  getAuthor: (authorId, fields) =>
    publicApi.get(`/authors/${authorId}`, {
      params: {
        fields: fields || 'authorId,name,affiliations,paperCount,citationCount,hIndex,homepage,externalIds'
      }
    }),

  // Public get author papers (获取作者论文列表 - 不需要登录)
  getAuthorPapers: (authorId, offset = 0, limit = 100, fields) =>
    publicApi.get(`/authors/${authorId}/papers`, {
      params: {
        offset,
        limit,
        fields: fields || 'paperId,title,abstract,authors,year,citationCount,referenceCount,venue,publicationDate,publicationTypes,fieldsOfStudy,s2FieldsOfStudy,externalIds,url,openAccessPdf,influentialCitationCount,isOpenAccess,journal'
      }
    }),
};

// 分析维度API - 需要认证
export const analysisDimensionAPI = {
  // 分析论文摘要（使用用户自定义维度）
  // paperId用于数据库缓存，优先从缓存获取
  analyzePaper: (paperId, title, abstract) =>
    api.post('/analysis/paper', { paperId, title, abstract }),

  // 获取用户的分析维度（合并：系统默认 + 用户自定义覆盖）
  getDimensions: () =>
    api.get('/analysis/dimensions'),

  // 创建或更新用户自定义维度（覆盖系统默认）
  // dimensionKey 用于标识要覆盖的系统维度
  createDimension: (dimensionKey, name, description, sortOrder = 0) =>
    api.post('/analysis/dimensions', { dimensionKey, name, description, sortOrder }),

  // 更新用户自定义维度
  updateDimension: (id, name, description, sortOrder = 0) =>
    api.put(`/analysis/dimensions/${id}`, { name, description, sortOrder }),

  // 删除用户自定义维度
  deleteDimension: (id) =>
    api.delete(`/analysis/dimensions/${id}`),

  // 重置单个维度为系统默认（删除用户的自定义覆盖）
  resetDimension: (dimensionKey) =>
    api.delete(`/analysis/dimensions/reset/${dimensionKey}`),

  // 重置所有维度为系统默认
  resetAllDimensions: () =>
    api.delete('/analysis/dimensions/reset-all'),

  // 将系统默认维度复制给用户（已废弃，保留兼容性）
  copyFromSystem: () =>
    api.post('/analysis/dimensions/copy-from-system'),
};

export const configAPI = {
  // Get privacy policy
  getPrivacyPolicy: () =>
    api.get('/config/privacy-policy'),

  // Get system config
  getSystemConfig: () =>
    api.get('/config/system'),
};

export const subscriptionAPI = {
  // Get user's quota information
  getQuota: () =>
    api.get('/user/subscription/quota'),

  // Get user's usage information
  getUsage: () =>
    api.get('/user/subscription/usage'),

  // Get user's active subscription
  getMySubscription: () =>
    api.get('/user/subscription/my'),

  // Check if user has quota for a feature
  // Deprecated: 配额检查已废弃，现在使用货币系统进行扣费控制。此方法始终返回 has_quota: true
  checkQuota: (featureType) =>
    api.get('/user/subscription/check-quota', { params: { feature_type: featureType } }),
};

export const orderAPI = {
  // Create a new order with optional coupon
  createOrder: (planCode, billingCycle, couponId = null) =>
    api.post('/user/orders/create', {
      plan_code: planCode,
      billing_cycle: billingCycle,
      coupon_id: couponId // Optional coupon_id parameter
    }),

  // Create a recharge order for diamond
  createRechargeOrder: (diamondAmount, bonusAmount = 0) =>
    api.post('/user/orders/recharge', {
      diamond_amount: diamondAmount,
      bonus_amount: bonusAmount
    }),

  // Get user's orders with pagination
  getMyOrders: (page = 1, pageSize = 20) =>
    api.get('/user/orders/my', { params: { page, page_size: pageSize } }),

  // Get user's billing history (paid orders only)
  getBillingHistory: (page = 1, pageSize = 20) =>
    api.get('/user/orders/billing-history', { params: { page, page_size: pageSize } }),

  // Get order detail by order number
  getOrderDetail: (orderNo) =>
    api.get(`/user/orders/${orderNo}`),

  // Cancel an order
  cancelOrder: (orderNo) =>
    api.post('/user/orders/cancel', { order_no: orderNo }),

  // Process payment (for mock/testing)
  processPayment: (orderNo, paymentMethod) =>
    api.post('/user/orders/pay', { order_no: orderNo, payment_method: paymentMethod }),
};

export const paymentAPI = {
  // Create Alipay payment
  createAlipayPayment: (orderNo, subject, amount, returnURL, description) =>
    api.post('/user/payment/alipay/create', {
      order_no: orderNo,
      subject,
      amount,
      return_url: returnURL,
      description,
    }),

  // Create WeChat Pay payment
  createWeChatPayment: (orderNo, amount) =>
    api.post('/user/payment/wechat/create', {
      order_no: orderNo,
      amount,
    }),
};

// AI审稿人 API
// 签到 API
export const checkinAPI = {
  // 执行签到
  checkin: () =>
    api.post('/user/checkin'),

  // 获取签到状态
  getStatus: () =>
    api.get('/user/checkin/status'),

  // 获取签到历史（按月）
  getHistory: (year, month) =>
    api.get('/user/checkin/history', { params: { year, month } }),
};

// AI审稿人 API
export const peerReviewAPI = {
  // ========== 草稿管理 API ==========
  
  // 获取草稿（每个用户只有一个草稿）
  getDraft: () =>
    api.get('/user/peer-review/draft'),

  // 保存草稿
  saveDraft: (data) =>
    api.put('/user/peer-review/draft', data),

  // 提交草稿开始审稿
  submitDraft: (targetVenue = '', modelLevel = 'mid') =>
    api.post('/user/peer-review/draft/submit', { target_venue: targetVenue, model_level: modelLevel }),

  // ========== 任务管理 API ==========
  
  // 创建审稿任务（保留兼容）
  createTask: (data) =>
    api.post('/user/peer-review/tasks', data),

  // 获取任务列表（不包含草稿）
  getTaskList: (page = 1, pageSize = 10, status = '', search = '') =>
    api.get('/user/peer-review/tasks', { params: { page, page_size: pageSize, status, search } }),

  // 获取任务详情
  getTaskDetail: (taskId) =>
    api.get(`/user/peer-review/tasks/${taskId}`),

  // 获取任务进度
  getTaskProgress: (taskId) =>
    api.get(`/user/peer-review/tasks/${taskId}/progress`),

  // 监听任务进度（SSE）
  watchTaskProgress: (taskId) => {
    const token = localStorage.getItem('user_token');
    return new EventSource(`${API_URL}/api/v1/user/peer-review/tasks/${taskId}/watch?token=${token}`);
  },

  // 删除任务
  deleteTask: (taskId) =>
    api.delete(`/user/peer-review/tasks/${taskId}`),

  // 启动草稿任务（保留兼容）
  startTask: (taskId, targetVenue = '', modelLevel = 'mid') =>
    api.post(`/user/peer-review/tasks/${taskId}/start`, { target_venue: targetVenue, model_level: modelLevel }),

  // 上传文件（解析文件并保存到草稿）
  uploadFile: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/user/peer-review/upload', formData, {
      headers: { 'Content-Type': null },
    });
  },

  // ========== 附件管理 API（最多5个附件）==========

  // 上传附件到草稿
  uploadAttachment: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/user/peer-review/attachments', formData, {
      headers: { 'Content-Type': null },
    });
  },

  // 从草稿删除附件
  deleteAttachment: (attachmentId) =>
    api.delete(`/user/peer-review/attachments/${attachmentId}`),

  // 删除主稿件文件
  deleteManuscript: () =>
    api.delete('/user/peer-review/manuscript'),

  // 清空草稿（删除主稿件和所有附件）
  clearDraft: () =>
    api.delete('/user/peer-review/draft'),
};

// Wallet API - 钱包相关
export const walletAPI = {
  // 获取钱包余额
  getWallet: () => api.get('/user/wallet'),

  // 获取交易流水
  getTransactions: (params = {}) => {
    const queryParams = {
      page: params.page || 1,
      page_size: params.pageSize || 20,
    };
    if (params.currencyType) queryParams.currency_type = params.currencyType;
    if (params.transactionType) queryParams.transaction_type = params.transactionType;
    if (params.bizType) queryParams.biz_type = params.bizType;
    if (params.startTime) queryParams.start_time = params.startTime;
    if (params.endTime) queryParams.end_time = params.endTime;
    return api.get('/user/wallet/transactions', { params: queryParams });
  },

  // 获取交易详情
  getTransactionDetail: (transactionNo) =>
    api.get(`/user/wallet/transactions/${transactionNo}`),

  // 检查余额是否充足
  checkBalance: (currencyType, amount) =>
    api.post('/user/wallet/check-balance', { currency_type: currencyType, amount }),

  // 获取充值信息（恩特币单价等）
  getRechargeInfo: () => api.get('/user/wallet/recharge-info'),

  // 获取兑换信息（兑换比例等）
  getExchangeInfo: () => api.get('/user/wallet/exchange-info'),

  // 预览兑换结果
  previewExchange: (diamondAmount) =>
    api.get('/user/wallet/exchange/preview', { params: { diamond_amount: diamondAmount } }),

  // 执行恩特币兑换经费
  exchangeDiamondToGold: (diamondAmount) =>
    api.post('/user/wallet/exchange', { diamond_amount: diamondAmount }),

  // 获取所有业务类型的显示信息（用于交易流水动态展示）
  getBizDisplayInfos: () => api.get('/user/wallet/biz-display-infos'),
};

// Fund API - 会员基金相关
export const fundAPI = {
  // 获取基金列表（公开）
  getFunds: () => api.get('/public/funds'),

  // 获取当前月份基金（公开）
  getCurrentFund: () => api.get('/public/funds/current'),

  // 获取基金详情（公开）
  getFundDetail: (id) => api.get(`/public/funds/${id}`),

  // 获取我的基金领取记录（需登录）
  getMyDistributions: () => api.get('/user/funds/distributions'),
};

export default api;
