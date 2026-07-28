import { useMemo } from 'react';
import { useAuthorDetail, useAuthorPapers } from '@/shared/api/authors';
import type { Author, Paper, PaperAuthor, UpstreamSource } from '@/shared/api/types';
import { AuthorHero } from '../author-detail/AuthorHero';
import { TopicSection } from '../author-detail/TopicSection';
import { FeaturedPapersCol } from '../author-detail/FeaturedPapersCol';
import { CollaboratorsCol } from '../author-detail/CollaboratorsCol';
import { YearlyChart } from '../author-detail/YearlyChart';
import { AlertCircle, Loader2 } from 'lucide-react';
import { EmptyState } from '@/shared/components/EmptyState';

export function AuthorDetailContent({
  seedAuthor,
  compact = false,
}: {
  seedAuthor: Author;
  compact?: boolean;
}) {
  const needsFetch =
    seedAuthor.paperCount == null ||
    seedAuthor.hIndex == null ||
    !seedAuthor.name?.trim();
  const detailQ = useAuthorDetail(seedAuthor.authorId, needsFetch);
  const author = detailQ.data ?? seedAuthor;
  const papersQ = useAuthorPapers({
    authorId: author.authorId,
    limit: 50,
    enabled: !!author.authorId,
  });

  if (needsFetch && detailQ.isLoading && !detailQ.data) {
    return (
      <div className="flex items-center justify-center py-16 text-faint">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  if (detailQ.error && !detailQ.data) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="学者信息加载失败"
        description={(detailQ.error as Error).message || '请稍后重试'}
      />
    );
  }

  return (
    <div
      className={
        compact
          ? 'mx-auto max-w-6xl space-y-4 px-4 py-4 sm:px-6 sm:py-6'
          : 'mx-auto max-w-6xl space-y-4 px-4 py-4 sm:space-y-6 sm:px-10 sm:py-7'
      }
    >
      <AuthorHero author={author} />
      <TopicSection papers={papersQ.data?.items ?? []} loading={papersQ.isLoading} />
      <AuthorWorksSection
        author={author}
        papers={papersQ.data?.items ?? []}
        total={papersQ.data?.total ?? 0}
        loading={papersQ.isLoading}
        error={papersQ.error as Error | null}
      />
      <YearlyChart papers={papersQ.data?.items ?? []} />
    </div>
  );
}

function AuthorWorksSection({
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
  const featured = useMemo(
    () =>
      [...papers]
        .sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0))
        .slice(0, 5),
    [papers],
  );

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
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
      <FeaturedPapersCol papers={featured} total={total} loading={loading} error={error} />
      <CollaboratorsCol
        collaborators={collaborators}
        loading={loading}
        currentSource={(author.source ?? 'stc') as UpstreamSource}
      />
    </div>
  );
}
