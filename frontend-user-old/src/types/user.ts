export interface User {
  id: number;
  email: string;
  username: string;
  avatar_url: string;
  role: 'user' | 'admin';
  phone?: string;
  bio?: string;
  location?: string;
  created_at: string;
  updated_at: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  loading: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  code: string;
}

export interface TokenInfo {
  remaining_seconds: number;
  should_refresh: boolean;
  can_refresh: boolean;
}

export interface AuthContextValue {
  isAuthenticated: boolean;
  user: User | null;
  loading: boolean;
  login: (token: string, userData: User) => void;
  logout: () => Promise<void>;
  updateUser: (userData: User) => void;
  refreshUser: () => Promise<User | null>;
}
