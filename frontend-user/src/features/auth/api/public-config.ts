// usePublicConfig + useEnabledProviders 已迁移到 shared/api/public-config(跨 feature 资源)。
// 这里只做向后兼容 re-export,auth 内部代码继续用本路径不破坏。
export {
  usePublicConfig,
  useEnabledProviders,
  type PublicSystemConfig,
  type EnabledProvider,
} from '@/shared/api/public-config';
