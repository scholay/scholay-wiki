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

export const peerReviewAPI = {
  getDraft: () => api.get('/user/peer-review/draft'),
  saveDraft: (data: any) => api.put('/user/peer-review/draft', data),
  submitDraft: (targetVenue = '', modelLevel = 'mid') =>
    api.post('/user/peer-review/draft/submit', {
      target_venue: targetVenue,
      model_level: modelLevel,
    }),

  createTask: (data: any) => api.post('/user/peer-review/tasks', data),
  getTaskList: (page = 1, pageSize = 10, status = '', search = '') =>
    api.get('/user/peer-review/tasks', {
      params: { page, page_size: pageSize, status, search },
    }),
  getTaskDetail: (taskId: number | string) =>
    api.get(`/user/peer-review/tasks/${taskId}`),
  getTaskProgress: (taskId: number | string) =>
    api.get(`/user/peer-review/tasks/${taskId}/progress`),
  getTaskSteps: (taskId: number | string) =>
    api.get(`/user/peer-review/tasks/${taskId}/steps`),

  watchTaskProgress: (taskId: number | string) => {
    const token = localStorage.getItem('user_token');
    return new EventSource(
      `${API_URL}/api/v1/user/peer-review/tasks/${taskId}/watch?token=${token}`,
    );
  },

  deleteTask: (taskId: number | string) =>
    api.delete(`/user/peer-review/tasks/${taskId}`),
  startTask: (taskId: number | string, targetVenue = '', modelLevel = 'mid') =>
    api.post(`/user/peer-review/tasks/${taskId}/start`, {
      target_venue: targetVenue,
      model_level: modelLevel,
    }),

  uploadFile: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/user/peer-review/upload', formData, {
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
