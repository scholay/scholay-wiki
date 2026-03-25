/**
 * AppProviders — 统一 Provider 组合
 *
 * 状态管理由 Zustand 驱动。
 * 桥接 Provider 确保旧页面中的 useAuth() / useTheme() / useSidebar() 仍然可用。
 */

import React, { useEffect } from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query';
import { ConfigProvider, App as AntdApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { ToastProvider } from '../../components/ToastContainer';
import { darkTheme, lightTheme } from '../../theme/antdTheme';
import ErrorBoundary from '../../components/ErrorBoundary';
import { handleApiError } from '../../shared/api';
import { useThemeStore } from '../../shared/stores/themeStore';
import { useAuthStore } from '../../shared/stores/authStore';
import { AuthBridgeProvider } from '../bridges/AuthBridge';
import { ThemeBridgeProvider } from '../bridges/ThemeBridge';
import { SidebarBridgeProvider } from '../bridges/SidebarBridge';

/* ----------------------------------------------------------------
 * QueryClient 全局配置
 * ---------------------------------------------------------------- */

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error: any) => handleApiError(error),
  }),
  mutationCache: new MutationCache({
    onError: (error: any) => handleApiError(error),
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/* ----------------------------------------------------------------
 * Antd 主题跟随 Zustand themeStore
 * ---------------------------------------------------------------- */

function ThemedConfigProvider({ children }: { children: React.ReactNode }) {
  const isDark = useThemeStore((s) => s.isDark);
  return (
    <ConfigProvider locale={zhCN} theme={isDark ? darkTheme : lightTheme}>
      <AntdApp>{children}</AntdApp>
    </ConfigProvider>
  );
}

/* ----------------------------------------------------------------
 * Auth 初始化
 * ---------------------------------------------------------------- */

function AuthInitializer({ children }: { children: React.ReactNode }) {
  const initialize = useAuthStore((s) => s.actions.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return <>{children}</>;
}

/* ----------------------------------------------------------------
 * AppProviders
 * ---------------------------------------------------------------- */

interface AppProvidersProps {
  children: React.ReactNode;
}

export const AppProviders: React.FC<AppProvidersProps> = ({ children }) => {
  return (
    <ErrorBoundary showDetails={import.meta.env.DEV}>
      <HelmetProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeBridgeProvider>
            <ThemedConfigProvider>
              <ToastProvider>
                <AuthInitializer>
                  <AuthBridgeProvider>
                    <SidebarBridgeProvider>
                      <Router>{children}</Router>
                    </SidebarBridgeProvider>
                  </AuthBridgeProvider>
                </AuthInitializer>
              </ToastProvider>
            </ThemedConfigProvider>
          </ThemeBridgeProvider>
        </QueryClientProvider>
      </HelmetProvider>
    </ErrorBoundary>
  );
};

export default AppProviders;
