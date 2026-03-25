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
];

// 检查当前页面是否在白名单中
export const isInAuthWhitelist = () => {
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

  checkEmail: (email) =>
    api.post('/user/check-email', { email }),

  checkPhone: (phone) =>
    api.post('/user/check-phone', { phone }),

  sendPhoneCode: (phone, purpose) =>
    api.post('/user/send-phone-code', { phone, purpose }),

  resetPassword: (email, code, new_password) =>
    api.post('/user/reset-password', { email, code, new_password }),

  resetPasswordPhone: (phone, code, new_password) =>
    api.post('/user/reset-password-phone', { phone, code, new_password }),

  register: (email, password, code) =>
    api.post('/user/register', { email, password, code }),

  login: (email, password, turnstile_token) =>
    api.post('/user/login', { email, password, turnstile_token }),

  loginWithUsername: (username, password) =>
    api.post('/user/login', { username, password }),

  loginPhone: (phone, password) =>
    api.post('/user/login-phone', { phone, password }),

  loginPhoneWithCode: (phone, code, turnstile_token) =>
    api.post('/user/login-phone-with-code', { phone, code, turnstile_token }),

  registerPhone: (phone, password, code) =>
    api.post('/user/register-phone', { phone, password, code }),

  logout: () =>
    api.post('/user/logout'),

  // NOTE: heartbeat 接口已移除，由 WebSocket 连接替代

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

  // 获取微信内嵌二维码所需配置
  getWeChatQRCodeConfig: () =>
    api.get('/user/wechat/qrcode-config'),

  wechatCallback: (code, state) =>
    api.post('/user/wechat/callback', {
      code,
      state,
    }),

  bindWeChatAccount: (code, state) =>
    api.post('/user/bind-wechat', { code, state }),

  // GitHub OAuth
  getGithubLoginURL: () =>
    api.get('/user/github/login-url'),

  githubCallback: (code, state) => {
    let url = `/user/github/callback?code=${code}&state=${state}`;
    return api.get(url);
  },

  bindGitHubAccount: (code, state) =>
    api.post('/user/bind-github', { code, state }),

  bindEmailWithPassword: (email, password, code) =>
    api.post('/user/bind-email-with-password', { email, password, code }),

  bindPhoneWithPassword: (phone, password, code) =>
    api.post('/user/bind-phone-with-password', { phone, password, code }),

  // 获取任务历史（智能分析 + 智能审稿），按天分组
  getTaskHistory: (days = 3, limitPerDay = 20) =>
    api.get('/user/task-history', { params: { days, limit_per_day: limitPerDay } }),

  // ========== LaTeX Writer API ==========
  
  // 获取可用的 AI 模型列表
  getLatexAgentModels: () =>
    api.get('/user/latex-writer/models'),
  
  // 获取 LaTeX 文档列表
  getLatexDocuments: (tree = false) =>
    api.get('/user/latex-writer/files', { params: { tree: tree ? 'true' : 'false' } }),
  
  // 获取单个文档详情
  getLatexDocument: (id) =>
    api.get(`/user/latex-writer/files/${id}`),
  
  // 创建文档/文件夹
  createLatexDocument: (data) =>
    api.post('/user/latex-writer/files', data),
  
  // 更新文档
  updateLatexDocument: (id, data) =>
    api.put(`/user/latex-writer/files/${id}`, data),
  
  // 删除文档
  deleteLatexDocument: (id) =>
    api.delete(`/user/latex-writer/files/${id}`),

  // ========== LaTeX 对话历史 API ==========
  
  // 获取文档对话信息
  getDocumentConversation: (documentId) =>
    api.get(`/user/latex-writer/documents/${documentId}/conversation`),
  
  // 获取对话历史（分页）
  getConversationHistory: (documentId, page = 1, pageSize = 20) =>
    api.get(`/user/latex-writer/documents/${documentId}/conversation/messages`, {
      params: { page, page_size: pageSize }
    }),
  
  // 清空对话
  clearConversation: (documentId) =>
    api.delete(`/user/latex-writer/documents/${documentId}/conversation`),
  
  // 获取带上下文的流式对话 URL
  getStreamChatWithContextUrl: (documentId) =>
    `/api/v1/user/latex-writer/documents/${documentId}/chat/stream`,


  // ============================================================================
  // MCP 工具系统 API
  // ============================================================================

  // 获取所有 MCP 工具列表
  getMCPTools: () =>
    api.get('/mcp/tools'),

  // 获取 LLM 格式的工具定义
  getMCPToolsForLLM: () =>
    api.get('/mcp/tools/llm'),

  // 按分类获取工具
  getMCPToolsByCategory: (category) =>
    api.get(`/mcp/tools/category/${category}`),

  // 获取工具详情
  getMCPTool: (name) =>
    api.get(`/mcp/tools/${name}`),

  // 调用单个 MCP 工具
  callMCPTool: (name, args = {}) =>
    api.post('/mcp/call', { name, arguments: args }),

  // 批量调用 MCP 工具
  batchCallMCPTools: (calls) =>
    api.post('/mcp/batch', calls),
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

  // Get a conversation with messages (supports pagination)
  // If page/pageSize not provided, returns all messages (backward compatible)
  getConversation: (id, page = null, pageSize = null) => {
    const params = {};
    if (page !== null) params.page = page;
    if (pageSize !== null) params.page_size = pageSize;
    return api.get(`/user/conversations/${id}`, { params });
  },

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

  // Public search suggestions (搜索建议 - 论文标题自动补全 + 作者搜索)
  // 并行请求 paper autocomplete 和 author search API
  getSearchSuggestions: (query, paperLimit = 5, authorLimit = 5) =>
    publicApi.get('/search/suggestions', { 
      params: { query, paperLimit, authorLimit } 
    }),

  // Public analysis dimensions (获取系统默认分析维度 - 仅用于展示，实际分析需要登录)
  getSystemDimensions: () =>
    publicApi.get('/analysis/dimensions'),

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
  // 路径已重命名为 author-detail，避免旧版本前端循环请求
  getAuthor: (authorId, fields) =>
    publicApi.get(`/author-detail/${authorId}`, {
      params: {
        fields: fields || 'authorId,name,affiliations,paperCount,citationCount,hIndex,homepage,externalIds'
      }
    }),

  // Public get author papers (获取作者论文列表 - 不需要登录)
  // 路径已重命名为 author-detail，避免旧版本前端循环请求
  getAuthorPapers: (authorId, offset = 0, limit = 100, fields) =>
    publicApi.get(`/author-detail/${authorId}/papers`, {
      params: {
        offset,
        limit,
        fields: fields || 'paperId,title,abstract,authors,year,citationCount,referenceCount,venue,publicationDate,publicationTypes,fieldsOfStudy,s2FieldsOfStudy,externalIds,url,openAccessPdf,influentialCitationCount,isOpenAccess,journal'
      }
    }),

  // Public streaming translation (流式翻译 - 不需要登录)
  // 将非中文文本翻译为中文，使用SSE流式输出
  translateStream: (text) => {
    const token = localStorage.getItem('user_token');
    return fetch(`${API_URL}/api/v1/public/translate/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      },
      body: JSON.stringify({ text })
    });
  },

  // Public paper streaming translation (论文整体翻译 - 不需要登录)
  // 一次性翻译标题、摘要、TLDR三个字段，使用SSE流式输出
  translatePaperStream: (title, abstract, tldr) => {
    const token = localStorage.getItem('user_token');
    return fetch(`${API_URL}/api/v1/public/translate/paper/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      },
      body: JSON.stringify({ title, abstract, tldr })
    });
  },
};

// 分析维度API - 需要认证
export const analysisDimensionAPI = {
  // 分析论文摘要（使用用户自定义维度）
  // paperId用于数据库缓存，优先从缓存获取
  analyzePaper: (paperId, title, abstract) =>
    api.post('/analysis/paper', { paperId, title, abstract }),

  // 批量分析论文摘要（最多10篇）
  // papers: [{ paperId, title, abstract }, ...]
  batchAnalyzePapers: (papers) =>
    api.post('/analysis/papers/batch', { papers }),

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
  getPrivacyPolicy: () =>
    api.get('/config/privacy-policy'),

  getTermsOfService: () =>
    api.get('/config/terms-of-service'),

  getSystemConfig: () =>
    api.get('/config/system'),

  // Get code snippets for frontend injection (SEO/广告/统计等)
  getCodeSnippets: () =>
    api.get('/config/code-snippets'),
};

// 智能审稿人 API
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

  // 获取任务步骤详情（三位审稿人的详细步骤）
  getTaskSteps: (taskId) =>
    api.get(`/user/peer-review/tasks/${taskId}/steps`),

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

// Message API - 站内信相关
export const messageAPI = {
  // 获取消息列表
  getMessages: (params = {}) => {
    const queryParams = {
      page: params.page || 1,
      page_size: params.pageSize || 20,
    };
    if (params.category) queryParams.category = params.category;
    if (params.isRead !== undefined) queryParams.is_read = params.isRead;
    return api.get('/user/messages', { params: queryParams });
  },

  // 获取未读消息数量
  getUnreadCount: () => api.get('/user/messages/unread-count'),

  // 获取消息详情
  getMessage: (id) => api.get(`/user/messages/${id}`),

  // 标记消息已读
  markAsRead: (id) => api.put(`/user/messages/${id}/read`),

  // 标记所有消息已读
  markAllAsRead: () => api.put('/user/messages/read-all'),

  // 删除消息
  deleteMessage: (id) => api.delete(`/user/messages/${id}`),
};

export default api;
