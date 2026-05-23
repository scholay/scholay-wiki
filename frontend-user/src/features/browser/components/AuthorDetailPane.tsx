import { useEffect, useMemo } from 'react';
import { useMatch } from 'react-router-dom';
import { AlertCircle, Loader2 } from 'lucide-react';
import { EmptyState } from '@/shared/components/EmptyState';
import { useAuthorDetail, useAuthorPapers } from '@/shared/api/authors';
import {
  authorTabKey,
  useBrowserTabs,
} from '@/stores/browser-tabs.store';
import type {
  Author,
  Paper,
  PaperAuthor,
  UpstreamSource,
} from '@/shared/api/types';
import { AuthorHero } from './author-detail/AuthorHero';
import { TopicSection } from './author-detail/TopicSection';
import { FeaturedPapersCol } from './author-detail/FeaturedPapersCol';
import { CollaboratorsCol } from './author-detail/CollaboratorsCol';
import { YearlyChart } from './author-detail/YearlyChart';

/**
 * 学者详情面板 —— 路由 `/browser/a/:source/:authorId`,设计稿 .pen `xw3fM`。
 *
 * 路由层(本文件):URL 解析 → tab + detailQ + papersQ 数据装配 → loading/error 守门
 *
 * 视图段拆到 `author-detail/`:
 *   ┌─ AuthorHero(140 圆 avatar + Playfair 大名 + 4 stats + actions)
 *   ├─ TopicSection(fieldsOfStudy 聚合 chips)
 *   ├─ TwoColumn(FeaturedPapersCol 左 + CollaboratorsCol 右)
 *   └─ YearlyChart(年度柱状图,峰值 amber)
 */

export function AuthorDetailPane() {
  const match = useMatch('/author/:source/:authorId');
  const source = (match?.params.source as UpstreamSource | undefined) ?? 'stc';
  const authorId = match?.params.authorId
    ? decodeURIComponent(match.params.authorId)
    : '';
  const tabId = authorId ? authorTabKey(source, authorId) : '';

  const tab = useBrowserTabs((s) => {
    const t = s.tabs.find((t) => t.id === tabId);
    return t && t.kind === 'author' ? t : undefined;
  });
  const openAuthorTab = useBrowserTabs((s) => s.openAuthorTab);

  // tab 缺数据(分享链接 / 清缓存)→ fallback 拉。已有 tab 也补一次:tab 里可能只有
  // stub(authorId + name)缺 hIndex / paperCount,详情接口能补齐
  const needsFetch =
    !tab || tab.author.paperCount == null || tab.author.hIndex == null;
  const detailQ = useAuthorDetail(authorId, needsFetch && !!authorId);

  useEffect(() => {
    if (detailQ.data) {
      openAuthorTab(detailQ.data, tab?.returnTo ?? '/library');
    }
  }, [detailQ.data, tab?.returnTo, openAuthorTab]);

  const author = tab?.author ?? detailQ.data;

  // 作品列表 —— author 一确定就拉
  const papersQ = useAuthorPapers({
    authorId: author?.authorId,
    limit: 50,
    enabled: !!author?.authorId,
  });

  if (!author) {
    if (detailQ.isLoading) {
      return (
        <div className="flex items-center justify-center py-16 text-faint">
          <Loader2 className="size-4 animate-spin" />
        </div>
      );
    }
    if (detailQ.error) {
      return (
        <EmptyState
          icon={AlertCircle}
          title="学者信息加载失败"
          description={
            (detailQ.error as Error).message ||
            '该期刊可能已下架或暂时不可用,请稍后重试'
          }
        />
      );
    }
    return (
      <EmptyState
        icon={AlertCircle}
        title="页签已失效"
        description="请回到搜索结果重新打开"
      />
    );
  }

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="max-w-6xl mx-auto px-10 py-7 space-y-6">
        <AuthorHero author={author} />
        <TopicSection
          papers={papersQ.data?.items ?? []}
          loading={papersQ.isLoading}
        />
        <TwoColumn
          author={author}
          papers={papersQ.data?.items ?? []}
          total={papersQ.data?.total ?? 0}
          loading={papersQ.isLoading}
          error={papersQ.error as Error | null}
        />
        <YearlyChart papers={papersQ.data?.items ?? []} />
      </div>
    </div>
  );
}

// ============================================================================
// 双列布局 —— featured/collaborators 数据派生留在本文件(与 author 主数据耦合)
// ============================================================================

function TwoColumn({
  author,
  papers,
  total,
  loading,
  error,
}: {
  author: Author;
  papers: Paper[];
  total: number;
  loading: boolean;
  error: Error | null;
}) {
  // 代表作 —— 按引用数倒序取前 5
  const featured = useMemo(() => {
    return [...papers]
      .sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0))
      .slice(0, 5);
  }, [papers]);

  // 合作学者聚合 —— 排除本人,按出现次数 top 8
  const collaborators = useMemo(() => {
    const counts = new Map<string, { author: PaperAuthor; count: number }>();
    for (const p of papers) {
      for (const a of p.authors ?? []) {
        if (!a?.authorId || a.authorId === author.authorId) continue;
        const cur = counts.get(a.authorId);
        if (cur) cur.count += 1;
        else counts.set(a.authorId, { author: a, count: 1 });
      }
    }
    return [...counts.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [papers, author.authorId]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
      <FeaturedPapersCol
        papers={featured}
        total={total}
        loading={loading}
        error={error}
      />
      <CollaboratorsCol
        collaborators={collaborators}
        loading={loading}
        currentSource={author.source ?? 'stc'}
      />
    </div>
  );
}
