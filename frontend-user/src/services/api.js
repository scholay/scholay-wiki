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
      // Unauthorized - clear token and trigger auth event
      localStorage.removeItem('user_token');
      localStorage.removeItem('user_data');

      // Dispatch custom event to show login modal
      window.dispatchEvent(new CustomEvent('auth:required'));

      // Redirect to home page
      if (window.location.pathname !== '/') {
        window.location.href = '/';
      }
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

  getProfile: () =>
    api.get('/user/profile'),

  updateProfile: (username, avatarURL) =>
    api.put('/user/profile', { username, avatar_url: avatarURL }),
};

export const conversationAPI = {
  // Get all conversations for current user
  getConversations: (page = 1, pageSize = 20) =>
    api.get('/user/conversations', { params: { page, page_size: pageSize } }),

  // Create a new conversation
  createConversation: (title) =>
    api.post('/user/conversations', { title }),

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

  // Update conversation title
  updateTitle: (conversationId, title) =>
    api.put(`/user/conversations/${conversationId}/title`, { title }),
};

export default api;
