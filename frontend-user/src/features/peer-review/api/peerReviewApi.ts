import { httpClient, API_URL } from 'shared/api/client';
import type { ApiResponse } from 'shared/types/api';

export const peerReviewApi = {
  // Draft management
  getDraft: () =>
    httpClient.get<ApiResponse>('/user/peer-review/draft'),

  saveDraft: (data: any) =>
    httpClient.put<ApiResponse>('/user/peer-review/draft', data),

  submitDraft: (targetVenue: string = '', modelLevel: string = 'mid') =>
    httpClient.post<ApiResponse>('/user/peer-review/draft/submit', { target_venue: targetVenue, model_level: modelLevel }),

  // Task management
  createTask: (data: any) =>
    httpClient.post<ApiResponse>('/user/peer-review/tasks', data),

  getTaskList: (page: number = 1, pageSize: number = 10, status: string = '', search: string = '') =>
    httpClient.get<ApiResponse>('/user/peer-review/tasks', { params: { page, page_size: pageSize, status, search } }),

  getTaskDetail: (taskId: string) =>
    httpClient.get<ApiResponse>(`/user/peer-review/tasks/${taskId}`),

  getTaskProgress: (taskId: string) =>
    httpClient.get<ApiResponse>(`/user/peer-review/tasks/${taskId}/progress`),

  getTaskSteps: (taskId: string) =>
    httpClient.get<ApiResponse>(`/user/peer-review/tasks/${taskId}/steps`),

  watchTaskProgress: (taskId: string) => {
    const token = localStorage.getItem('user_token');
    return new EventSource(`${API_URL}/api/v1/user/peer-review/tasks/${taskId}/watch?token=${token}`);
  },

  deleteTask: (taskId: string) =>
    httpClient.delete<ApiResponse>(`/user/peer-review/tasks/${taskId}`),

  startTask: (taskId: string, targetVenue: string = '', modelLevel: string = 'mid') =>
    httpClient.post<ApiResponse>(`/user/peer-review/tasks/${taskId}/start`, { target_venue: targetVenue, model_level: modelLevel }),

  uploadFile: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return httpClient.post<ApiResponse>('/user/peer-review/upload', formData, {
      headers: { 'Content-Type': null as any },
    });
  },

  // Attachment management
  uploadAttachment: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return httpClient.post<ApiResponse>('/user/peer-review/attachments', formData, {
      headers: { 'Content-Type': null as any },
    });
  },

  deleteAttachment: (attachmentId: string) =>
    httpClient.delete<ApiResponse>(`/user/peer-review/attachments/${attachmentId}`),

  deleteManuscript: () =>
    httpClient.delete<ApiResponse>('/user/peer-review/manuscript'),

  clearDraft: () =>
    httpClient.delete<ApiResponse>('/user/peer-review/draft'),
};
