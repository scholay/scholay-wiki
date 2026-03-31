/**
 * Unified Zod schemas for form validation.
 * Single source of truth for all validation rules across the app.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Primitive field schemas (reusable building blocks)
// ---------------------------------------------------------------------------

export const emailSchema = z
  .string()
  .min(1, '请输入邮箱')
  .email('请输入有效的邮箱地址');

export const phoneSchema = z
  .string()
  .min(1, '请输入手机号')
  .regex(/^1[3-9]\d{9}$/, '请输入有效的手机号');

export const passwordSchema = z
  .string()
  .min(1, '请输入密码')
  .min(6, '密码长度至少6位');

export const verificationCodeSchema = z
  .string()
  .min(1, '请输入验证码')
  .length(6, '验证码为6位');

export const usernameSchema = z
  .string()
  .min(1, '请输入用户名')
  .min(2, '用户名至少2个字符')
  .max(20, '用户名最多20个字符');

// ---------------------------------------------------------------------------
// Form schemas
// ---------------------------------------------------------------------------

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const phoneLoginSchema = z.object({
  phone: phoneSchema,
  code: verificationCodeSchema,
});

export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema.refine(
      (val) => val.length >= 8,
      { message: '注册密码至少8位' },
    ),
    confirmPassword: z.string().min(1, '请确认密码'),
    code: verificationCodeSchema,
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: '两次密码不一致',
    path: ['confirmPassword'],
  });

export const changePasswordSchema = z
  .object({
    oldPassword: z.string().min(1, '请输入原密码'),
    newPassword: passwordSchema.refine(
      (val) => val.length >= 8,
      { message: '新密码至少8位' },
    ),
    confirmPassword: z.string().min(1, '请确认新密码'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: '两次密码不一致',
    path: ['confirmPassword'],
  });

export const feedbackSchema = z.object({
  content: z.string().min(1, '请输入反馈内容').max(2000, '反馈内容不超过2000字'),
  email: emailSchema.optional().or(z.literal('')),
});

export const profileSchema = z.object({
  username: usernameSchema,
  avatarURL: z.string().url('请输入有效的URL').optional().or(z.literal('')),
});

// ---------------------------------------------------------------------------
// Type exports (infer from schemas)
// ---------------------------------------------------------------------------

export type LoginFormData = z.infer<typeof loginSchema>;
export type PhoneLoginFormData = z.infer<typeof phoneLoginSchema>;
export type RegisterFormData = z.infer<typeof registerSchema>;
export type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;
export type FeedbackFormData = z.infer<typeof feedbackSchema>;
export type ProfileFormData = z.infer<typeof profileSchema>;

// ---------------------------------------------------------------------------
// Password strength utility (kept for UI display)
// ---------------------------------------------------------------------------

export function getPasswordStrength(password: string) {
  if (!password) return { strength: 0, message: '' };
  if (password.length < 6) return { strength: 1, message: '密码强度：非常弱' };
  if (password.length < 8) return { strength: 2, message: '密码强度：弱' };

  let strength = 2;
  if (/\d/.test(password)) strength++;
  if (/[a-z]/.test(password)) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) strength++;

  const messages: Record<number, string> = {
    2: '密码强度：弱',
    3: '密码强度：中',
    4: '密码强度：中',
    5: '密码强度：强',
    6: '密码强度：非常强',
  };

  const s = Math.min(strength, 6);
  return { strength: s, message: messages[s] };
}
