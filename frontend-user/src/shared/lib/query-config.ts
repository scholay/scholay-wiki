/**
 * TanStack Query 全局默认配置常量 —— 集中收口,所有 feature 的 useXxxQuery
 * 都共享同一组默认 staleTime / gcTime / retry。
 *
 * 个别 query 想要更激进的缓存(例:一天不刷的 enrichment / 静态字典),在自己
 * 的 useQuery 选项里覆写 staleTime 即可,无需改全局。
 */

/** 30 秒内重复 query 直接复用缓存,不打后端 —— 用户态资源默认档 */
export const DEFAULT_STALE_TIME = 30_000;

/** 5 分钟后才把无人订阅的缓存回收 */
export const DEFAULT_GC_TIME = 5 * 60_000;

/** 失败重试 1 次(默认 3 太多;auth/perm 错误 retry 反而越错越烦) */
export const DEFAULT_RETRY = 1;

/** 切回 Tab 不自动 refetch —— 桌面用户来回切窗很频繁,refetch 视觉抖动 */
export const DEFAULT_REFETCH_ON_WINDOW_FOCUS = false;

// ─────────────────────────────────────────────────────────────────────────────
// staleTime 分级 preset —— 写新 query 时直接用名字,不要硬编码毫秒。
//
// 选用原则:
//   FRESH:  当前用户主动编辑的资源(library 列表、folder 树、连接绑定列表),
//           mutation invalidate 是主刷新路径,staleTime 是兜底
//   WARM:   搜索结果 / 列表(论文搜索、quick-search),用户不改但内容会动
//   COOL:   半静态的用户档案 / 公开配置(profile、public-config)
//   COLD:   上游学术数据(paper detail、author、journal)—— 内容月级别才会变
//   STATIC: 极少变(静态字典、enrichment 表)—— 当前还没用到这一档
// ─────────────────────────────────────────────────────────────────────────────

/** 用户态资源(library / folders / connections),mutation 兜底,staleTime 5 分钟 */
export const STALE_FRESH = 5 * 60_000;
/** 搜索结果 / 中等动态列表 */
export const STALE_WARM = 60_000;
/** 半静态档案 / 公开配置 */
export const STALE_COOL = 5 * 60_000;
/** 上游学术数据(paper / author / journal),低频变化 */
export const STALE_COLD = 10 * 60_000;
/** 几乎不变的静态数据 */
export const STALE_STATIC = 60 * 60_000;
