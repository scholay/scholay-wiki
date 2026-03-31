import { create } from 'zustand';
import type { User } from '../types/user';
import { userAPI } from '../services/user.api';
import logger from '../utils/logger';

// ---------------------------------------------------------------------------
// Session controller – registered by AuthBootstrap at mount time.
// Allows store actions (login/logout) to trigger side-effects (WebSocket,
// token-refresh interval) that live inside a React component.
// ---------------------------------------------------------------------------
interface SessionController {
  start: () => void;
  stop: () => void;
  startGuest: () => void;
}

let _sessionCtrl: SessionController | null = null;

export const registerSessionController = (ctrl: SessionController | null) => {
  _sessionCtrl = ctrl;
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------
interface AuthStore {
  isAuthenticated: boolean;
  user: User | null;
  loading: boolean;

  // Low-level setters (used by AuthBootstrap init)
  setAuth: (user: User, token: string) => void;
  clearAuth: () => void;
  setUser: (user: User) => void;
  setLoading: (loading: boolean) => void;

  // High-level actions (used by components via useAuth)
  login: (token: string, userData: User) => void;
  logout: () => Promise<void>;
  updateUser: (userData: User) => void;
  refreshUser: () => Promise<User | null>;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  isAuthenticated: false,
  user: null,
  loading: true,

  setAuth: (user, token) => {
    localStorage.setItem('user_token', token);
    localStorage.setItem('user_data', JSON.stringify(user));
    set({ isAuthenticated: true, user, loading: false });
  },

  clearAuth: () => {
    localStorage.removeItem('user_token');
    localStorage.removeItem('user_data');
    set({ isAuthenticated: false, user: null });
  },

  setUser: (user) => {
    localStorage.setItem('user_data', JSON.stringify(user));
    set({ user });
  },

  setLoading: (loading) => set({ loading }),

  login: (token, userData) => {
    get().setAuth(userData, token);
    _sessionCtrl?.start();
  },

  logout: async () => {
    _sessionCtrl?.stop();
    try {
      await userAPI.logout();
    } catch (error) {
      logger.error('Logout API call failed:', error);
    }
    get().clearAuth();
  },

  updateUser: (userData) => {
    get().setUser(userData);
  },

  refreshUser: async () => {
    try {
      const profileResponse = await userAPI.getProfile();
      if (profileResponse.data.code === 0 && profileResponse.data.data) {
        const userData = profileResponse.data.data;
        get().setUser(userData);
        return userData;
      }
    } catch (error) {
      logger.error('Failed to refresh user data:', error);
    }
    return null;
  },
}));
