/**
 * AuthBridge — 桥接层
 *
 * 让使用旧 useAuth() 的页面自动读取 Zustand authStore。
 * 提供与原 AuthContext 完全相同的 API。
 * 当所有页面迁移到 useAuthStore 后可删除此文件。
 */

import React, { createContext, useContext, useMemo } from 'react';
import { useAuthStore } from '../../shared/stores/authStore';
import type { User } from '../../shared/types/user';

interface AuthContextValue {
  isAuthenticated: boolean;
  user: User | null;
  loading: boolean;
  login: (token: string, userData: User) => void;
  logout: () => Promise<void>;
  updateUser: (userData: User) => void;
  refreshUser: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthBridgeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const actions = useAuthStore((s) => s.actions);

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated,
      user,
      loading,
      login: actions.login,
      logout: actions.logout,
      updateUser: actions.updateUser,
      refreshUser: actions.refreshUser,
    }),
    [isAuthenticated, user, loading, actions]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthBridgeProvider');
  }
  return context;
};
