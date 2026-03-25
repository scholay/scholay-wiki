import { httpClient } from 'shared/api/client';
import type { ApiResponse } from 'shared/types/api';

export const configApi = {
  getPrivacyPolicy: () => httpClient.get<ApiResponse>('/config/privacy-policy'),
  getTermsOfService: () => httpClient.get<ApiResponse>('/config/terms-of-service'),
  getSystemConfig: () => httpClient.get<ApiResponse>('/config/system'),
  getCodeSnippets: () => httpClient.get<ApiResponse>('/config/code-snippets'),
};

export const messageApi = {
  getMessages: (params: any = {}) => {
    const queryParams: any = { page: params.page || 1, page_size: params.pageSize || 20 };
    if (params.category) queryParams.category = params.category;
    if (params.isRead !== undefined) queryParams.is_read = params.isRead;
    return httpClient.get<ApiResponse>('/user/messages', { params: queryParams });
  },
  getUnreadCount: () => httpClient.get<ApiResponse>('/user/messages/unread-count'),
  getMessage: (id: number) => httpClient.get<ApiResponse>(`/user/messages/${id}`),
  markAsRead: (id: number) => httpClient.put<ApiResponse>(`/user/messages/${id}/read`),
  markAllAsRead: () => httpClient.put<ApiResponse>('/user/messages/read-all'),
  deleteMessage: (id: number) => httpClient.delete<ApiResponse>(`/user/messages/${id}`),
};

export const analysisDimensionApi = {
  analyzePaper: (paperId: string, title: string, abstract: string) => httpClient.post<ApiResponse>('/analysis/paper', { paperId, title, abstract }),
  batchAnalyzePapers: (papers: Array<{ paperId: string; title: string; abstract: string }>) => httpClient.post<ApiResponse>('/analysis/papers/batch', { papers }),
  getDimensions: () => httpClient.get<ApiResponse>('/analysis/dimensions'),
  createDimension: (dimensionKey: string, name: string, description: string, sortOrder: number = 0) => httpClient.post<ApiResponse>('/analysis/dimensions', { dimensionKey, name, description, sortOrder }),
  updateDimension: (id: number, name: string, description: string, sortOrder: number = 0) => httpClient.put<ApiResponse>(`/analysis/dimensions/${id}`, { name, description, sortOrder }),
  deleteDimension: (id: number) => httpClient.delete<ApiResponse>(`/analysis/dimensions/${id}`),
  resetDimension: (dimensionKey: string) => httpClient.delete<ApiResponse>(`/analysis/dimensions/reset/${dimensionKey}`),
  resetAllDimensions: () => httpClient.delete<ApiResponse>('/analysis/dimensions/reset-all'),
  copyFromSystem: () => httpClient.post<ApiResponse>('/analysis/dimensions/copy-from-system'),
};
