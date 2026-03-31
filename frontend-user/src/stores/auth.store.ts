import { create } from 'zustand';
import type { User } from '../types/user';

interface AuthStore {
  isAuthenticated: boolean;
  user: User | null;
  loading: boolean;

  setAuth: (user: User, token: string) => void;
  clearAuth: () => void;
  setUser: (user: User) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
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
}));
