/**
 * TanStack Query 全局默认配置常量 —— 集中收口,所有 feature 的 useXxxQuery
 * 都共享同一组默认 staleTime / gcTime / retry。
 *
 * 个别 query 想要更激进的缓存(例:一天不刷的 enrichment / 静态字典),在自己
 * 的 useQuery 选项里覆写 staleTime 即可,无需改全局。
 */

/** 30 秒内重复 query 直接复用缓存,不打后端 */
export const DEFAULT_STALE_TIME = 30_000;

/** 5 分钟后才把无人订阅的缓存回收 */
export const DEFAULT_GC_TIME = 5 * 60_000;

/** 失败重试 1 次(默认 3 太多;auth/perm 错误 retry 反而越错越烦) */
export const DEFAULT_RETRY = 1;

/** 切回 Tab 不自动 refetch —— 桌面用户来回切窗很频繁,refetch 视觉抖动 */
export const DEFAULT_REFETCH_ON_WINDOW_FOCUS = false;
