import { httpClient } from 'shared/api/client';
import type { ApiResponse } from 'shared/types/api';

export const latexApi = {
  getAgentModels: () =>
    httpClient.get<ApiResponse>('/user/latex-writer/models'),

  getDocuments: (tree: boolean = false) =>
    httpClient.get<ApiResponse>('/user/latex-writer/files', { params: { tree: tree ? 'true' : 'false' } }),

  getDocument: (id: number) =>
    httpClient.get<ApiResponse>(`/user/latex-writer/files/${id}`),

  createDocument: (data: any) =>
    httpClient.post<ApiResponse>('/user/latex-writer/files', data),

  updateDocument: (id: number, data: any) =>
    httpClient.put<ApiResponse>(`/user/latex-writer/files/${id}`, data),

  deleteDocument: (id: number) =>
    httpClient.delete<ApiResponse>(`/user/latex-writer/files/${id}`),

  // Conversation history
  getDocumentConversation: (documentId: number) =>
    httpClient.get<ApiResponse>(`/user/latex-writer/documents/${documentId}/conversation`),

  getConversationHistory: (documentId: number, page: number = 1, pageSize: number = 20) =>
    httpClient.get<ApiResponse>(`/user/latex-writer/documents/${documentId}/conversation/messages`, {
      params: { page, page_size: pageSize },
    }),

  clearConversation: (documentId: number) =>
    httpClient.delete<ApiResponse>(`/user/latex-writer/documents/${documentId}/conversation`),

  getStreamChatWithContextUrl: (documentId: number) =>
    `/api/v1/user/latex-writer/documents/${documentId}/chat/stream`,

  // MCP tools
  getMCPTools: () =>
    httpClient.get<ApiResponse>('/mcp/tools'),

  getMCPToolsForLLM: () =>
    httpClient.get<ApiResponse>('/mcp/tools/llm'),

  getMCPToolsByCategory: (category: string) =>
    httpClient.get<ApiResponse>(`/mcp/tools/category/${category}`),

  getMCPTool: (name: string) =>
    httpClient.get<ApiResponse>(`/mcp/tools/${name}`),

  callMCPTool: (name: string, args: any = {}) =>
    httpClient.post<ApiResponse>('/mcp/call', { name, arguments: args }),

  batchCallMCPTools: (calls: any) =>
    httpClient.post<ApiResponse>('/mcp/batch', calls),
};
