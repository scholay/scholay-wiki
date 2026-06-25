// 内容中心(博客 / 学术资源)取数 —— 正文单一真源在后端 internal/content(go:embed),
// 这里走公开 API /api/v1/content/*。前端不再打包正文 TS。
import { useQuery } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

export type ContentKind = 'blog' | 'resources' | 'qa';

/** 一段正文。与后端 content.Section 同构。 */
export type ArticleSection =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'tip'; title: string; text: string }
  | { type: 'list'; ordered?: boolean; items: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'faq'; faq: { q: string; a: string }[] };

export interface ArticleAuthor {
  name: string;
  role: string;
  bio: string;
}

/** 列表卡片(不含正文 sections)。 */
export interface ArticleCard {
  slug: string;
  title: string;
  category: string;
  tags: string[];
  excerpt: string;
  readTime: string;
  date: string;
  updatedDate: string;
  author: ArticleAuthor | null;
}

/** 单篇全文。 */
export interface Article extends ArticleCard {
  kind: ContentKind;
  sections: ArticleSection[];
}

/** 博客分类 chip 行的固定 UI taxonomy(与内容无关,留前端常量)。 */
export const BLOG_CATEGORIES = [
  { id: 'all', label: '全部' },
  { id: '学术搜索', label: '学术搜索' },
  { id: 'AI与学术', label: 'AI与学术' },
  { id: '论文写作', label: '论文写作' },
  { id: '研究方法', label: '研究方法' },
  { id: '工具教程', label: '工具教程' },
  { id: '行业观察', label: '行业观察' },
] as const;

/** 文章列表(后端按 lastmod 倒序返回)。 */
export function useArticleList(kind: ContentKind) {
  return useQuery({
    queryKey: ['help', 'content', kind],
    queryFn: async () =>
      (await http.get<{ items: ArticleCard[] }>(`/content/${kind}`)).data.items,
    staleTime: 10 * 60_000,
  });
}

/** 单篇全文。slug 为空时不发请求;404 不重试(直接走 not-found)。 */
export function useArticle(kind: ContentKind, slug: string) {
  return useQuery({
    queryKey: ['help', 'content', kind, slug],
    queryFn: async () =>
      (await http.get<Article>(`/content/${kind}/${slug}`)).data,
    enabled: !!slug,
    staleTime: 10 * 60_000,
    retry: false,
  });
}

/** 相关文章:同分类 +2 分、标签重合各 +1 分,排除自身,取前 limit 篇。 */
export function relatedArticles<T extends ArticleCard>(
  list: T[] | undefined,
  current: Pick<ArticleCard, 'slug' | 'category' | 'tags'> | undefined,
  limit: number,
): T[] {
  if (!list || !current) return [];
  return list
    .filter((a) => a.slug !== current.slug)
    .map((a) => ({
      a,
      score:
        (a.category === current.category ? 2 : 0) +
        a.tags.filter((t) => current.tags.includes(t)).length,
    }))
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map((x) => x.a);
}
