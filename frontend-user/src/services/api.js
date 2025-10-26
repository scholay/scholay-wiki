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
      // Unauthorized - clear token and redirect to login
      localStorage.removeItem('user_token');
      localStorage.removeItem('user_data');
      window.location.href = '/login';
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

export default api;
