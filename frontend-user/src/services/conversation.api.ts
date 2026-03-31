import api from './client';

export const conversationAPI = {
  getConversations: (page = 1, pageSize = 20, conversationType: string | null = null) => {
    const params: Record<string, any> = { page, page_size: pageSize };
    if (conversationType) params.conversation_type = conversationType;
    return api.get('/user/conversations', { params });
  },

  createConversation: (title: string, conversationType = 'search') =>
    api.post('/user/conversations', { title, conversation_type: conversationType }),

  getConversation: (id: number | string, page: number | null = null, pageSize: number | null = null) => {
    const params: Record<string, any> = {};
    if (page !== null) params.page = page;
    if (pageSize !== null) params.page_size = pageSize;
    return api.get(`/user/conversations/${id}`, { params });
  },

  deleteConversation: (id: number | string) => api.delete(`/user/conversations/${id}`),

  addMessage: (conversationId: number | string, content: string, searchQuery = '', searchPapers = false) =>
    api.post(`/user/conversations/${conversationId}/messages`, {
      content,
      search_query: searchQuery,
      search_papers: searchPapers,
    }),

  continueConversation: (conversationId: number | string, content: string, mode = 'continue') =>
    api.post(`/user/conversations/${conversationId}/continue`, { content, mode }),

  updateTitle: (conversationId: number | string, title: string) =>
    api.put(`/user/conversations/${conversationId}/title`, { title }),

  getSiblingMessages: (messageId: number | string) =>
    api.get(`/user/conversations/messages/${messageId}/siblings`),

  getBranchChain: (messageId: number | string) =>
    api.get(`/user/conversations/messages/${messageId}/branch`),

  getFollowUpQuestions: (conversationId: number | string, messageId: number | string) =>
    api.get(`/user/conversations/${conversationId}/messages/${messageId}/follow-up-questions`),
};
