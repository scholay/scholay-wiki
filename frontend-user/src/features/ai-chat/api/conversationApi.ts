import { httpClient } from 'shared/api/client';
import type { ApiResponse } from 'shared/types/api';

export const conversationApi = {
  getConversations: (page: number = 1, pageSize: number = 20, conversationType: string | null = null) => {
    const params: any = { page, page_size: pageSize };
    if (conversationType) {
      params.conversation_type = conversationType;
    }
    return httpClient.get<ApiResponse>('/user/conversations', { params });
  },

  createConversation: (title: string, conversationType: string = 'search') =>
    httpClient.post<ApiResponse>('/user/conversations', { title, conversation_type: conversationType }),

  getConversation: (id: string | number, page?: number | null, pageSize?: number | null) => {
    const params: any = {};
    if (page !== null) params.page = page;
    if (pageSize !== null) params.page_size = pageSize;
    return httpClient.get<ApiResponse>(`/user/conversations/${id}`, { params });
  },

  deleteConversation: (id: string | number) =>
    httpClient.delete<ApiResponse>(`/user/conversations/${id}`),

  addMessage: (conversationId: string | number, content: string, searchQuery: string = '', searchPapers: boolean = false) =>
    httpClient.post<ApiResponse>(`/user/conversations/${conversationId}/messages`, {
      content,
      search_query: searchQuery,
      search_papers: searchPapers,
    }),

  continueConversation: (conversationId: string | number, content: string, mode: string = 'continue') =>
    httpClient.post<ApiResponse>(`/user/conversations/${conversationId}/continue`, {
      content,
      mode,
    }),

  updateTitle: (conversationId: string | number, title: string) =>
    httpClient.put<ApiResponse>(`/user/conversations/${conversationId}/title`, { title }),

  getSiblingMessages: (messageId: string | number) =>
    httpClient.get<ApiResponse>(`/user/conversations/messages/${messageId}/siblings`),

  getBranchChain: (messageId: string | number) =>
    httpClient.get<ApiResponse>(`/user/conversations/messages/${messageId}/branch`),

  getFollowUpQuestions: (conversationId: string | number, messageId: string | number) =>
    httpClient.get<ApiResponse>(`/user/conversations/${conversationId}/messages/${messageId}/follow-up-questions`),
};
