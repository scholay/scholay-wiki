// useProfile + User 类型 已迁移到 shared/api/profile (跨 feature 资源)。
// 这里只做向后兼容 re-export,auth 内部代码沿用 '@/features/auth/api/profile' 不破坏。
export { useProfile, type User } from '@/shared/api/profile';
