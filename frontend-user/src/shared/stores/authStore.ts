/**
 * 认证状态 Store (Zustand)
 *
 * 完整替代 utils/AuthContext.js：
 *   - 状态管理（user / isAuthenticated / loading）
 *   - 会话管理（Token 刷新定时器 / WebSocket / 页面可见性）
 *   - 访客会话支持
 *   - auth:expired 事件处理
 */

import { create } from 'zustand';
import { httpClient, adminHttpClient } from '../api/client';
import type { User, TokenInfo } from '../types/user';
import type { ApiResponse } from '../types/api';

/* ----------------------------------------------------------------
 * 常量
 * ---------------------------------------------------------------- */

const TOKEN_REFRESH_INTERVAL = 300_000; // 5 分钟检查一次 Token

/* ----------------------------------------------------------------
 * WebSocket 客户端引用（延迟 import 避免循环依赖）
 * ---------------------------------------------------------------- */

let _wsClient: any = null;
function getWsClient() {
  if (!_wsClient) {
    try {
      _wsClient = require('../../../services/websocket').default;
    } catch {
      // WebSocket 模块不可用时静默降级
    }
  }
  return _wsClient;
}

/* ----------------------------------------------------------------
 * 内部会话管理器（非 React，纯 JS 定时器 + 事件）
 * ---------------------------------------------------------------- */

let tokenRefreshTimer: ReturnType<typeof setInterval> | null = null;
let isRefreshingToken = false;
let visibilityHandler: (() => void) | null = null;
let authExpiredHandler: ((e: Event) => void) | null = null;

async function checkAndRefreshToken() {
  const token = localStorage.getItem('user_token');
  if (!token || isRefreshingToken) return;

  try {
    const res = await httpClient.get<ApiResponse<TokenInfo>>('/user/token-info');
    if (res.data.code === 0 && res.data.data) {
      const { should_refresh, can_refresh } = res.data.data;
      if (should_refresh && can_refresh) {
        await doRefreshToken();
      }
    }
  } catch {
    // 忽略，其他机制会处理 401
  }
}

async function doRefreshToken(): Promise<boolean> {
  const token = localStorage.getItem('user_token');
  if (!token || isRefreshingToken) return false;

  isRefreshingToken = true;
  try {
    const res = await httpClient.post('/user/refresh-token');
    if (res.data.code === 0 && res.data.data?.token) {
      const newToken = res.data.data.token;
      localStorage.setItem('user_token', newToken);

      const ws = getWsClient();
      if (ws) {
        ws.disconnect();
        ws.connect(newToken);
      }
      return true;
    }
  } catch (err: any) {
    if (err.response?.data?.code === 2016) {
      window.dispatchEvent(
        new CustomEvent('auth:expired', {
          detail: { message: '登录已过期，请重新登录' },
        })
      );
    }
  } finally {
    isRefreshingToken = false;
  }
  return false;
}

function startTokenRefreshTimer() {
  stopTokenRefreshTimer();
  checkAndRefreshToken();
  tokenRefreshTimer = setInterval(checkAndRefreshToken, TOKEN_REFRESH_INTERVAL);
}

function stopTokenRefreshTimer() {
  if (tokenRefreshTimer) {
    clearInterval(tokenRefreshTimer);
    tokenRefreshTimer = null;
  }
}

function handleVisibilityChange() {
  const ws = getWsClient();
  if (!ws) return;

  if (document.visibilityState === 'visible') {
    if (!ws.getStatus().isConnected && !ws.getStatus().isConnecting) {
      const token = localStorage.getItem('user_token');
      ws.connect(token || null);
    }
  } else {
    ws.disconnect(false);
  }
}

/** 启动已认证用户的会话（Token 刷新 + WebSocket + 可见性） */
function startSession() {
  const userData = localStorage.getItem('user_data');
  if (userData) {
    try {
      const parsed = JSON.parse(userData);
      if (parsed?.role === 'admin') return; // Admin 不需要会话管理
    } catch { /* ignore */ }
  }

  startTokenRefreshTimer();

  const ws = getWsClient();
  const token = localStorage.getItem('user_token');
  if (ws) ws.connect(token || null);

  if (!visibilityHandler) {
    visibilityHandler = handleVisibilityChange;
    document.addEventListener('visibilitychange', visibilityHandler);
  }
}

/** 启动访客会话（仅 WebSocket + 可见性） */
function startGuestSession() {
  const ws = getWsClient();
  if (ws && !ws.getStatus().isConnected && !ws.getStatus().isConnecting) {
    ws.connect(null);
  }
  if (!visibilityHandler) {
    visibilityHandler = handleVisibilityChange;
    document.addEventListener('visibilitychange', visibilityHandler);
  }
}

/** 停止所有会话（登出时） */
function stopSession() {
  stopTokenRefreshTimer();

  const ws = getWsClient();
  if (ws) {
    ws.disconnect();
    setTimeout(() => ws.connect(null), 100);
  }

  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler);
    visibilityHandler = null;
  }
}

/* ----------------------------------------------------------------
 * Store 定义
 * ---------------------------------------------------------------- */

interface AuthActions {
  /** 登录并启动会话 */
  login: (token: string, userData: User) => void;
  /** 登出（调用后端 API + 清理状态） */
  logout: () => Promise<void>;
  /** 更新用户信息（仅本地） */
  updateUser: (userData: User) => void;
  /** 从后端拉取最新 profile */
  refreshUser: () => Promise<User | null>;
  /** 设置加载状态 */
  setLoading: (loading: boolean) => void;
  /** 初始化：从 localStorage 恢复状态并验证 */
  initialize: () => Promise<void>;
}

interface AuthStore {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  actions: AuthActions;
}

export const useAuthStore = create<AuthStore>()((set, get) => ({
  user: null,
  isAuthenticated: false,
  loading: true,

  actions: {
    login: (token: string, userData: User) => {
      localStorage.setItem('user_token', token);
      localStorage.setItem('user_data', JSON.stringify(userData));
      set({ user: userData, isAuthenticated: true });
      startSession();
    },

    logout: async () => {
      stopSession();

      const { user } = get();
      if (user?.role !== 'admin') {
        try {
          await httpClient.post('/user/logout');
        } catch { /* ignore */ }
      }

      localStorage.removeItem('user_token');
      localStorage.removeItem('user_data');
      set({ user: null, isAuthenticated: false });
    },

    updateUser: (userData: User) => {
      localStorage.setItem('user_data', JSON.stringify(userData));
      set({ user: userData });
    },

    refreshUser: async () => {
      try {
        const { user } = get();
        const isAdmin = user?.role === 'admin';
        const client = isAdmin ? adminHttpClient : httpClient;
        const endpoint = isAdmin ? '/admin/profile' : '/user/profile';

        const res = await client.get<ApiResponse<User>>(endpoint);
        if (res.data.code === 0 && res.data.data) {
          const freshData = res.data.data;
          if (isAdmin && !freshData.role) {
            freshData.role = 'admin';
          }
          get().actions.updateUser(freshData);
          return freshData;
        }
      } catch { /* ignore */ }
      return null;
    },

    setLoading: (loading: boolean) => set({ loading }),

    initialize: async () => {
      const token = localStorage.getItem('user_token');
      const raw = localStorage.getItem('user_data');

      if (token && raw && raw !== 'undefined') {
        try {
          const parsed: User = JSON.parse(raw);
          set({ user: parsed, isAuthenticated: true });

          const isAdmin = parsed?.role === 'admin';
          const client = isAdmin ? adminHttpClient : httpClient;
          const endpoint = isAdmin ? '/admin/profile' : '/user/profile';

          try {
            const res = await client.get<ApiResponse<User>>(endpoint);
            if (res.data.code === 0 && res.data.data) {
              const freshData = res.data.data;
              if (isAdmin && !freshData.role) {
                freshData.role = 'admin';
              }
              localStorage.setItem('user_data', JSON.stringify(freshData));
              set({ user: freshData });
              startSession();
            } else {
              localStorage.removeItem('user_token');
              localStorage.removeItem('user_data');
              set({ user: null, isAuthenticated: false });
              startGuestSession();
            }
          } catch (err: any) {
            if (err.response?.status === 401) {
              localStorage.removeItem('user_token');
              localStorage.removeItem('user_data');
              set({ user: null, isAuthenticated: false });
              startGuestSession();
            } else {
              startSession();
            }
          }
        } catch {
          localStorage.removeItem('user_token');
          localStorage.removeItem('user_data');
          set({ user: null, isAuthenticated: false });
          startGuestSession();
        }
      } else {
        startGuestSession();
      }

      set({ loading: false });

      // 监听 auth:expired 全局事件
      if (!authExpiredHandler) {
        authExpiredHandler = ((event: CustomEvent) => {
          stopSession();
          set({ user: null, isAuthenticated: false });

          const reason = event.detail?.reason || 'expired';
          const message = event.detail?.message || '登录已失效';
          if (reason === 'kicked') {
            sessionStorage.setItem('auth_kicked_message', message);
          }
        }) as EventListener;
        window.addEventListener('auth:expired', authExpiredHandler);
      }
    },
  },
}));

/* ----------------------------------------------------------------
 * 选择器（精确订阅，避免不必要重渲染）
 * ---------------------------------------------------------------- */

export const useUser = () => useAuthStore((s) => s.user);
export const useIsAuthenticated = () => useAuthStore((s) => s.isAuthenticated);
export const useAuthLoading = () => useAuthStore((s) => s.loading);
export const useAuthActions = () => useAuthStore((s) => s.actions);
