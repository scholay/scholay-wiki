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
    const token = localStorage.getItem('admin_token');
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
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const adminAPI = {
  login: (username, password) =>
    api.post('/admin/login', { username, password }),

  getProfile: () =>
    api.get('/admin/profile'),

  updatePassword: (oldPassword, newPassword) =>
    api.put('/admin/password', { old_password: oldPassword, new_password: newPassword }),
};

export default api;
