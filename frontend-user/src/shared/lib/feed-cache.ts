import type { InfiniteData, QueryClient } from '@tanstack/react-query';

/**
 * Feed 本地持久化(targeted,无新依赖)——「抖音式」二次进入无缝衔接:
 * 上次刷过的内容存 localStorage,下次进入直接灌进 react-query 缓存先展示旧内容,
 * 不自动重拉(feed 查询 staleTime=Infinity + refetchOnMount=false),要新内容靠下拉刷新换 seed。
 *
 * 只存前几页(够首屏无缝即可),按 feed 名 + seed 匹配,24h 过期。
 */

// v2: 旧版用 `c.pages.length === 0`(页数)判空,而一页可能是空数组 [[]](页数=1 但 0 篇),
// 导致空内容被持久化 + 二次进入被灌进缓存、配合 refetchOnMount=false 永远空白(刷不出来)。
// 换前缀直接弃用所有旧的(可能已中毒的)缓存条目,新条目一律按「真实有内容」把关。
// v3: 期刊 feed 排序从「jcr/sjr/h 轮换」改为「固定按 IF 数值降序」(旧 sjr 排序把 NULL 排最前 →
// 缓存里固化了一批低质垃圾刊)。bump 前缀弃用旧缓存,避免存量用户二次进入仍被灌回垃圾刊。
const PREFIX = 'scholay.feed.cache.v3.';
const MAX_AGE = 24 * 3600_000; // 24h
const MAX_PAGES = 3; // 够无缝首屏即可,控制写入体积

interface Cached {
  seed: number;
  t: number;
  pages: unknown[];
  pageParams: unknown[];
}

/**
 * 同步读取可用的本地 feed。供 useInfiniteQuery.initialData 在子组件
 * 第一次 render 时使用，避免等父布局 useEffect 才灌缓存造成的
 * 首帧 skeleton + 多余网络请求。
 */
export function readFeedPages<TPage, TPageParam = unknown>(
  name: string,
  seed: number,
): InfiniteData<TPage, TPageParam> | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + name);
    if (!raw) return undefined;
    const cached = JSON.parse(raw) as Cached;
    if (
      cached.seed !== seed ||
      Date.now() - cached.t > MAX_AGE ||
      !Array.isArray(cached.pages) ||
      !Array.isArray(cached.pageParams) ||
      !pagesHaveContent(cached.pages)
    ) {
      return undefined;
    }
    return {
      pages: cached.pages as TPage[],
      pageParams: cached.pageParams as TPageParam[],
    };
  } catch {
    return undefined;
  }
}

/**
 * 判断「分页结果里到底有没有真实内容」—— 兼容两种 feed 的页形态:
 *   - 刷论文: 每页是 Paper[](数组)→ 看有没有非空页
 *   - 刷期刊: 每页是 { rows: [...] }(对象)→ 看 rows 有没有内容
 * 任一页有内容即视为有内容。空数组 [[]] / [{rows:[]}] 都判为「无内容」,不缓存、不灌入。
 */
function pagesHaveContent(pages: unknown[]): boolean {
  return pages.some((pg) => {
    if (Array.isArray(pg)) return pg.length > 0;
    if (pg && typeof pg === 'object' && Array.isArray((pg as { rows?: unknown[] }).rows)) {
      return (pg as { rows: unknown[] }).rows.length > 0;
    }
    return false;
  });
}

/** 写入某 feed 的当前页缓存(只留前 MAX_PAGES 页,控制体积)。空内容不写,避免缓存中毒。 */
export function persistFeedPages(
  name: string,
  seed: number,
  pages: unknown[],
  pageParams: unknown[]
): void {
  // 没有任何真实内容(上游临时空/某源故障捞干)→ 不写,否则会把空白固化进缓存。
  if (!pagesHaveContent(pages)) return;
  try {
    const payload: Cached = {
      seed,
      t: Date.now(),
      pages: pages.slice(0, MAX_PAGES),
      pageParams: pageParams.slice(0, MAX_PAGES),
    };
    localStorage.setItem(PREFIX + name, JSON.stringify(payload));
  } catch {
    /* 隐私模式 / 配额满,忽略 */
  }
}

/**
 * 启动时把本地缓存灌进 query cache —— 仅当 seed 匹配且未过期才灌。
 * 之后该 feed 查询(同 seed key)挂载即有数据,即时显示。
 */
export function hydrateFeed(
  qc: QueryClient,
  name: string,
  seed: number,
  queryKey: readonly unknown[]
): void {
  try {
    const cached = readFeedPages(name, seed);
    if (!cached) return;
    // 已有数据就不覆盖(避免把正在用的更完整缓存覆盖回旧的)
    if (qc.getQueryData(queryKey)) return;
    qc.setQueryData(queryKey, cached);
  } catch {
    /* ignore */
  }
}
