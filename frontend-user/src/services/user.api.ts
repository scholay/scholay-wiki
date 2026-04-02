import api from './client';
import type { ApiResult } from '../types/api';
import type { User, TokenInfo } from '../types/user';

export const userAPI = {
  sendVerificationCode: (email: string, purpose: string, turnstileToken?: string) =>
    api.post('/user/send-code', { email, purpose, turnstile_token: turnstileToken }),

  register: (email: string, password: string, code: string, invitationCode?: string, turnstileToken?: string) =>
    api.post('/user/register', { email, password, code, invitation_code: invitationCode, turnstile_token: turnstileToken }),

  login: (email: string, password: string, turnstileToken?: string): Promise<ApiResult<{ token: string; user: User }>> =>
    api.post('/user/login', { email, password, turnstile_token: turnstileToken }),

  // Aliases used by useAuthForm hook
  sendEmailCode: (email: string, purpose: string, turnstileToken?: string) =>
    api.post('/user/send-code', { email, purpose, turnstile_token: turnstileToken }),

  loginWithEmail: (email: string, password: string, turnstileToken?: string): Promise<ApiResult<{ token: string; user: User }>> =>
    api.post('/user/login', { email, password, turnstile_token: turnstileToken }),

  registerWithEmail: (email: string, password: string, code: string, invitationCode?: string, turnstileToken?: string) =>
    api.post('/user/register', { email, password, code, invitation_code: invitationCode, turnstile_token: turnstileToken }),

  // Phone-based auth
  sendPhoneCode: (phone: string, purpose: string, turnstileToken?: string) =>
    api.post('/user/send-phone-code', { phone, purpose, turnstile_token: turnstileToken }),

  registerWithPhone: (phone: string, password: string, code: string, invitationCode?: string, turnstileToken?: string) =>
    api.post('/user/register-phone', { phone, password, code, invitation_code: invitationCode }),

  loginWithPhone: (phone: string, password: string, turnstileToken?: string): Promise<ApiResult<{ token: string; user: User }>> =>
    api.post('/user/login-phone', { phone, password }),

  loginWithPhoneCode: (phone: string, code: string, turnstileToken?: string): Promise<ApiResult<{ token: string; user: User }>> =>
    api.post('/user/login-phone-with-code', { phone, code, turnstile_token: turnstileToken }),

  checkEmail: (email: string) =>
    api.post('/user/check-email', { email }),

  checkPhone: (phone: string) =>
    api.post('/user/check-phone', { phone }),

  loginWithCode: (email: string, code: string, turnstileToken?: string) =>
    api.post('/user/login-with-code', { email, code, turnstile_token: turnstileToken }),

  resetPassword: (email: string, code: string, newPassword: string) =>
    api.post('/user/reset-password', { email, code, new_password: newPassword }),

  resetPasswordPhone: (phone: string, code: string, newPassword: string) =>
    api.post('/user/reset-password-phone', { phone, code, new_password: newPassword }),

  logout: () => api.post('/user/logout'),

  refreshToken: (): Promise<ApiResult<{ token: string }>> =>
    api.post('/user/refresh-token'),

  getTokenInfo: (): Promise<ApiResult<TokenInfo>> =>
    api.get('/user/token-info'),

  getProfile: (): Promise<ApiResult<User>> =>
    api.get('/user/profile'),

  updateProfile: (username: string, avatarURL: string) =>
    api.put('/user/profile', { username, avatar_url: avatarURL }),

  getWeChatLoginURL: () => api.get('/user/wechat/login-url'),
  getWeChatQRCodeConfig: () => api.get('/user/wechat/qrcode-config'),
  wechatCallback: (code: string, state: string) =>
    api.post('/user/wechat/callback', { code, state }),
  bindWeChatAccount: (code: string, state: string) =>
    api.post('/user/bind-wechat', { code, state }),

  getGithubLoginURL: () => api.get('/user/github/login-url'),
  githubCallback: (code: string, state: string) =>
    api.get(`/user/github/callback?code=${code}&state=${state}`),
  bindGitHubAccount: (code: string, state: string) =>
    api.post('/user/bind-github', { code, state }),

  getDiscourseLoginURL: () => api.get('/user/discourse/login-url'),
  discourseCallback: (sso: string, sig: string) =>
    api.get(`/user/discourse/callback?sso=${encodeURIComponent(sso)}&sig=${encodeURIComponent(sig)}`),
  bindDiscourseAccount: (sso: string, sig: string) =>
    api.post('/user/bind-discourse', { sso, sig }),

  bindEmailWithPassword: (email: string, password: string, code: string) =>
    api.post('/user/bind-email-with-password', { email, password, code }),
  bindPhoneWithPassword: (phone: string, password: string, code: string) =>
    api.post('/user/bind-phone-with-password', { phone, password, code }),

  getTaskHistory: (days = 3, limitPerDay = 20) =>
    api.get('/user/task-history', { params: { days, limit_per_day: limitPerDay } }),

  // LaTeX Writer
  getLatexAgentModels: () => api.get('/user/latex-writer/models'),
  getLatexDocuments: (tree = false) =>
    api.get('/user/latex-writer/files', { params: { tree: tree ? 'true' : 'false' } }),
  getLatexDocument: (id: number | string) => api.get(`/user/latex-writer/files/${id}`),
  createLatexDocument: (data: any) => api.post('/user/latex-writer/files', data),
  updateLatexDocument: (id: number | string, data: any) =>
    api.put(`/user/latex-writer/files/${id}`, data),
  deleteLatexDocument: (id: number | string) => api.delete(`/user/latex-writer/files/${id}`),

  // LaTeX Conversation
  getDocumentConversation: (documentId: number | string) =>
    api.get(`/user/latex-writer/documents/${documentId}/conversation`),
  getConversationHistory: (documentId: number | string, page = 1, pageSize = 20) =>
    api.get(`/user/latex-writer/documents/${documentId}/conversation/messages`, {
      params: { page, page_size: pageSize },
    }),
  clearConversation: (documentId: number | string) =>
    api.delete(`/user/latex-writer/documents/${documentId}/conversation`),
  getStreamChatWithContextUrl: (documentId: number | string) =>
    `/api/v1/user/latex-writer/documents/${documentId}/chat/stream`,

  // MCP Tools
  getMCPTools: () => api.get('/mcp/tools'),
  getMCPToolsForLLM: () => api.get('/mcp/tools/llm'),
  getMCPToolsByCategory: (category: string) => api.get(`/mcp/tools/category/${category}`),
  getMCPTool: (name: string) => api.get(`/mcp/tools/${name}`),
  callMCPTool: (name: string, args: Record<string, any> = {}) =>
    api.post('/mcp/call', { name, arguments: args }),
  batchCallMCPTools: (calls: any[]) => api.post('/mcp/batch', calls),
};
