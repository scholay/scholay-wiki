/**
 * TanStack Query 全局默认配置常量 —— 集中收口,所有 feature 的 useXxxQuery
 * 都共享同一组默认 staleTime / gcTime / retry。
 *
 * 个别 query 想要更激进的缓存(例:一天不刷的 enrichment / 静态字典),在自己
 * 的 useQuery 选项里覆写 staleTime 即可,无需改全局。
 */
import { toApiError } from './http';

/** 30 秒内重复 query 直接复用缓存,不打后端 —— 用户态资源默认档 */
export const DEFAULT_STALE_TIME = 30_000;

/** 5 分钟后才把无人订阅的缓存回收 */
export const DEFAULT_GC_TIME = 5 * 60_000;

/** 重试次数上限(默认 3 太多;确定性错误由 DEFAULT_RETRY 的谓词直接拦掉) */
export const DEFAULT_RETRY_COUNT = 1;

/**
 * 全局默认 retry 谓词(providers.tsx 的 QueryClient defaults 用它):
 * 4xx 是确定性失败 —— 参数错(400)/未登录(401)/越权(403)/不存在(404)重试只是
 * 白打一次注定同样结果的请求;429 重试还会加剧限流。唯一例外 408(请求超时,
 * 网关侧的瞬态),与网络错误/5xx 一样值得再试一次。
 * (此前是纯次数 retry: 1,对 4xx 也盲重一次 —— 2026-08-12 审计改为谓词。)
 */
export function DEFAULT_RETRY(failureCount: number, error: unknown): boolean {
  const status = toApiError(error).status;
  if (status !== undefined && status >= 400 && status < 500 && status !== 408) return false;
  return failureCount < DEFAULT_RETRY_COUNT;
}

/**
 * 详情类 query 的 retry 策略 —— 用在「按 id 取单个资源」的 useQuery 上。
 *
 * 后端对「资源不存在」与「非本人(越权)」统一返回 404(防枚举,见 backend
 * repository 的 `WHERE id=? AND user_id=?`)。这类错误重试毫无意义,只会让
 * 详情页的「任务不存在」友好态推迟 ~1 个退避周期才出现(用户先盯一会 spinner)。
 * 语义现在与 DEFAULT_RETRY 一致(它已把全部 4xx 拦掉),保留此导出是为了
 * 既有调用点不动 + 「详情类要豁免重试」的意图在调用点可见。
 */
export function retryDetailQuery(failureCount: number, error: unknown): boolean {
  const status = toApiError(error).status;
  if (status === 404 || status === 403) return false;
  return failureCount < DEFAULT_RETRY_COUNT;
}

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
