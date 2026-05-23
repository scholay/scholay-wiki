/**
 * 后端约定的 User 形态(对照 backend/internal/user/model.go)。
 * TODO: 切到 openapi-typescript 生成的类型 — `npm run gen:api` 之后从 @/shared/api/schema 导入。
 */
export interface User {
  id: number;
  username: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  bio: string | null;
  role: 'user' | 'admin';
  status: number;
  email_verified: boolean;
  phone_verified: boolean;
  last_login_at: string | null;
  last_login_ip: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

/** 后端发码 purpose 枚举,对照 handler_auth.go SendCodeRequest.binding */
export type CodePurpose =
  | 'register'
  | 'login'
  | 'bind'
  | 'unbind'
  | 'reset_password'
  | 'change_email' // 换绑邮箱场景:发到当前已绑邮箱,验证用户对旧邮箱的所有权
  | 'change_phone'; // 换绑手机场景:发到当前已绑手机,验证用户对旧号的所有权

/** 复用 stores 中定义的枚举(stores 不依赖 features,反向 re-export 这里) */
export type { AccountType, AuthMode } from '@/stores/auth-dialog.store';
export type LoginCredentialType = 'password' | 'code';
