/**
 * 用户相关类型定义
 */

export interface User {
  id: number;
  email?: string;
  phone?: string;
  username?: string;
  name?: string;
  avatar_url?: string;
  role?: 'user' | 'admin';
  status?: string;
  bio?: string;
  location?: string;
  github_id?: string;
  wechat_openid?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
}

export interface TokenInfo {
  remaining_seconds: number;
  should_refresh: boolean;
  can_refresh: boolean;
}
