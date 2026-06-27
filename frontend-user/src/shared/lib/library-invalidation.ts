import type { QueryClient } from '@tanstack/react-query';

/**
 * 失效用户文献集相关缓存 —— 收口所有 library 写操作(收藏/取消/建夹/转存/换源/上传 PDF…)的失效逻辑。
 *
 * 失效范围 = `['library']` 前缀下的全部查询,**但排除 `'quick-search'`**:
 * 在线学术检索(stc/olx/pmd 三源 fan-out,每次 3 个上游请求)与「往库里增删论文/文件夹」无关 ——
 * 搜索结果上的「已收藏」徽章由独立的 `['library','check']` / `['library','by-upstream']` 查询驱动,
 * 这两个仍会被失效刷新,所以徽章照样实时;只是不再白白重跑昂贵的三源在线检索,消除失效风暴。
 *
 * 历史上这里用的是裸 `invalidateQueries({queryKey:['library']})`,前缀会连 quick-search 一起命中:
 * 当用户开着在线搜索 tab 时,任意一次收藏/取消都会触发 5-8 个上游请求(列表闪烁 + 网络突发)。
 *
 * 注:TanStack v5 只 refetch 活动 observer,故仅在对应面板挂载时才会真的发请求;此改动把那段
 * 「确实会发生的」浪费收掉,且对缓存正确性零影响(被排除的查询结果本就不随库内容变化)。
 */
export function invalidateLibrary(qc: QueryClient): Promise<void> {
  return qc.invalidateQueries({
    predicate: (q) => q.queryKey[0] === 'library' && q.queryKey[1] !== 'quick-search',
  });
}
