import api, { API_URL } from './client';

export const paymentAPI = {
  createAlipayPayment: (
    orderNo: string,
    subject: string,
    amount: number,
    returnURL: string,
    description?: string,
  ) =>
    api.post('/user/payment/alipay/create', {
      order_no: orderNo,
      subject,
      amount,
      return_url: returnURL,
      description,
    }),

  createWeChatPayment: (orderNo: string, amount: number) =>
    api.post('/user/payment/wechat/create', { order_no: orderNo, amount }),
};

// 获取匿名令牌（用于未登录用户的审稿）
const getAnonToken = () => localStorage.getItem('peer_review_anon_token') || '';
const setAnonToken = (token: string) => {
  if (token) localStorage.setItem('peer_review_anon_token', token);
};
const clearAnonToken = () => localStorage.removeItem('peer_review_anon_token');

export const peerReviewAPI = {
  getDraft: () => api.get('/user/peer-review/draft'),
  saveDraft: (data: any) => api.put('/user/peer-review/draft', data),
  submitDraft: (targetVenue = '', modelLevel = 'mid', isPrivate = false) => {
    const anonToken = getAnonToken();
    return api.post('/user/peer-review/draft/submit', {
      target_venue: targetVenue,
      model_level: modelLevel,
      anon_token: anonToken || undefined,
      is_private: isPrivate,
    });
  },

  createTask: (data: any) => api.post('/user/peer-review/tasks', data),
  getTaskList: (page = 1, pageSize = 10, status = '', search = '') =>
    api.get('/user/peer-review/tasks', {
      params: { page, page_size: pageSize, status, search },
    }),
  getTaskDetail: (taskId: number | string) => {
    const anonToken = getAnonToken();
    return api.get(`/user/peer-review/tasks/${taskId}`, {
      params: anonToken ? { anon_token: anonToken } : {},
    });
  },
  getTaskProgress: (taskId: number | string) => {
    const anonToken = getAnonToken();
    return api.get(`/user/peer-review/tasks/${taskId}/progress`, {
      params: anonToken ? { anon_token: anonToken } : {},
    });
  },
  getTaskSteps: (taskId: number | string) => {
    const anonToken = getAnonToken();
    return api.get(`/user/peer-review/tasks/${taskId}/steps`, {
      params: anonToken ? { anon_token: anonToken } : {},
    });
  },

  watchTaskProgress: (taskId: number | string) => {
    const token = localStorage.getItem('user_token');
    const anonToken = getAnonToken();
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    if (anonToken) params.set('anon_token', anonToken);
    return new EventSource(
      `${API_URL}/api/v1/user/peer-review/tasks/${taskId}/watch?${params.toString()}`,
    );
  },

  deleteTask: (taskId: number | string) =>
    api.delete(`/user/peer-review/tasks/${taskId}`),
  startTask: (taskId: number | string, targetVenue = '', modelLevel = 'mid') => {
    const anonToken = getAnonToken();
    return api.post(`/user/peer-review/tasks/${taskId}/start`, {
      target_venue: targetVenue,
      model_level: modelLevel,
      anon_token: anonToken || undefined,
    });
  },

  uploadFile: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const anonToken = getAnonToken();
    const params = anonToken ? `?anon_token=${anonToken}` : '';
    return api.post(`/user/peer-review/upload${params}`, formData, {
      headers: { 'Content-Type': null as any },
    });
  },

  uploadAttachment: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/user/peer-review/attachments', formData, {
      headers: { 'Content-Type': null as any },
    });
  },

  deleteAttachment: (attachmentId: number | string) =>
    api.delete(`/user/peer-review/attachments/${attachmentId}`),
  deleteManuscript: () => api.delete('/user/peer-review/manuscript'),
  clearDraft: () => api.delete('/user/peer-review/draft'),

  // 认领匿名任务（登录后调用）
  claimTask: (taskId: number | string, anonToken: string) =>
    api.post('/user/peer-review/claim-task', { task_id: Number(taskId), anon_token: anonToken }),

  // 工具方法
  getAnonToken,
  setAnonToken,
  clearAnonToken,
};

export const analysisDimensionAPI = {
  analyzePaper: (paperId: string, title: string, abstract: string) =>
    api.post('/analysis/paper', { paperId, title, abstract }),

  batchAnalyzePapers: (papers: Array<{ paperId: string; title: string; abstract: string }>) =>
    api.post('/analysis/papers/batch', { papers }),

  getDimensions: () => api.get('/analysis/dimensions'),
  createDimension: (dimensionKey: string, name: string, description: string, sortOrder = 0) =>
    api.post('/analysis/dimensions', { dimensionKey, name, description, sortOrder }),
  updateDimension: (id: number | string, name: string, description: string, sortOrder = 0) =>
    api.put(`/analysis/dimensions/${id}`, { name, description, sortOrder }),
  deleteDimension: (id: number | string) => api.delete(`/analysis/dimensions/${id}`),
  resetDimension: (dimensionKey: string) =>
    api.delete(`/analysis/dimensions/reset/${dimensionKey}`),
  resetAllDimensions: () => api.delete('/analysis/dimensions/reset-all'),
  copyFromSystem: () => api.post('/analysis/dimensions/copy-from-system'),
};

export const configAPI = {
  getPrivacyPolicy: () => api.get('/config/privacy-policy'),
  getTermsOfService: () => api.get('/config/terms-of-service'),
  getSystemConfig: () => api.get('/config/system'),
  getCodeSnippets: () => api.get('/config/code-snippets'),
};

export const messageAPI = {
  getMessages: (params: { page?: number; pageSize?: number; category?: string; isRead?: boolean } = {}) => {
    const queryParams: Record<string, any> = {
      page: params.page || 1,
      page_size: params.pageSize || 20,
    };
    if (params.category) queryParams.category = params.category;
    if (params.isRead !== undefined) queryParams.is_read = params.isRead;
    return api.get('/user/messages', { params: queryParams });
  },

  getUnreadCount: () => api.get('/user/messages/unread-count'),
  getMessage: (id: number | string) => api.get(`/user/messages/${id}`),
  markAsRead: (id: number | string) => api.put(`/user/messages/${id}/read`),
  markAllAsRead: () => api.put('/user/messages/read-all'),
  deleteMessage: (id: number | string) => api.delete(`/user/messages/${id}`),
};
