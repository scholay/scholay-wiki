// User 类型已迁移到 shared/api/profile —— 跨 feature 资源,放在 shared 才合规。
// 这里 re-export 保持 auth 内部代码 `import type { User } from '../types'` 不破坏。
import type { User } from '@/shared/api/profile';
export type { User };

export interface AuthResponse {
  token: string;
  user: User;
  /** 所有鉴权端点的统一新用户信号；验证码“登录”也可能自动建号。 */
  is_new_user?: boolean;
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
