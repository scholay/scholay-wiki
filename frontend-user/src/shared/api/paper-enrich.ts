import { http } from '@/shared/lib/http';
import type { Paper } from '@/shared/api/types';

/**
 * PubMed 摘要补全 —— PMD 上游 `/v1/pmd/papers/search` 只返元数据(标题/作者/年份等),
 * **不带 abstract**。这里把缺 abstract 的 paperId 拢起来,一次请
 * `/public/papers/batch`(后端会按 `pmd:` 前缀路由到 `/v1/stc/papers/get` fan-out,
 * 拿到 efetch 提取的 abstract),merge 回原列表后返回。
 *
 * 失败时静默 fallback —— 返回原数组,缺 abstract 的就缺,不阻塞主流程。
 *
 * 跨 feature 复用:文献搜索页 / 文献集快捷搜索都调它,因此放在 shared/api/。
 */
export async function enrichPmdAbstracts(papers: Paper[]): Promise<Paper[]> {
  if (!papers || papers.length === 0) return papers;
  const idsNeedingAbstract = papers
    .filter((p) => !(p.abstract && p.abstract.trim().length > 0))
    .map((p) => p.paperId)
    .filter(Boolean);
  if (idsNeedingAbstract.length === 0) return papers;

  try {
    const { data } = await http.post<{ data: Paper[] | null }>(
      '/public/papers/batch',
      { paperIds: idsNeedingAbstract, fields: ['abstract'] }
    );
    const batched = data.data ?? [];
    if (batched.length === 0) return papers;

    const byId = new Map<string, string>();
    for (const p of batched) {
      if (p.paperId && p.abstract) byId.set(p.paperId, p.abstract);
    }
    if (byId.size === 0) return papers;

    return papers.map((p) =>
      byId.has(p.paperId) ? { ...p, abstract: byId.get(p.paperId) } : p
    );
  } catch {
    // 失败不冒泡:abstract 显示"无摘要"是退化体验,但比整个搜索挂掉好
    return papers;
  }
}
