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

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Unauthorized - clear token and state
      localStorage.removeItem('user_token');
      localStorage.removeItem('user_data');

      // Show notification to user
      const message = error.response?.data?.message || '登录已失效,请重新登录';

      // Dispatch custom event with message
      window.dispatchEvent(new CustomEvent('auth:expired', {
        detail: { message }
      }));

      // Redirect to home page after a short delay
      setTimeout(() => {
        if (window.location.pathname !== '/') {
          window.location.href = '/';
        }
      }, 500);
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

  getProfile: () =>
    api.get('/user/profile'),

  updateProfile: (username, avatarURL) =>
    api.put('/user/profile', { username, avatar_url: avatarURL }),
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
};

export const scholarAPI = {
  // Search papers
  searchPapers: (params) =>
    api.get('/scholar/papers/search', { params }),

  // Get paper details
  getPaper: (paperId) =>
    api.get(`/scholar/papers/${paperId}`),

  // Get paper citations
  getCitations: (paperId, params) =>
    api.get(`/scholar/papers/${paperId}/citations`, { params }),

  // Get paper references
  getReferences: (paperId, params) =>
    api.get(`/scholar/papers/${paperId}/references`, { params }),
};

export const configAPI = {
  // Get privacy policy
  getPrivacyPolicy: () =>
    api.get('/config/privacy-policy'),

  // Get system config
  getSystemConfig: () =>
    api.get('/config/system'),
};

export default api;
