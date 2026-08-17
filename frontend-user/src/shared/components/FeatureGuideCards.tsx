import { Link } from 'react-router-dom';

const ENTERSCHOLAR_HOME = 'https://enterscholar.com';

/**
 * 功能空态下方的两张导览占位卡。
 * 左:站内 Wiki;右:恩特学术帖子。样式先占位,后续再收。
 */
export function FeatureGuideCards({
  topic,
  wikiHref,
  communityHref = ENTERSCHOLAR_HOME,
}: {
  topic: string;
  wikiHref: string;
  communityHref?: string;
}) {
  return (
    <div className="mt-8 grid w-full grid-cols-2 gap-3">
      <Link
        to={wikiHref}
        className="rounded-16 border border-dashed border-border bg-surface-card px-4 py-5 text-left"
      >
        <p className="text-14 font-medium text-foreground">什么是{topic}?</p>
        <p className="mt-1 text-12 text-faint">站内 Wiki · 占位</p>
      </Link>
      <a
        href={communityHref}
        target="_blank"
        rel="noreferrer"
        className="rounded-16 border border-dashed border-border bg-surface-card px-4 py-5 text-left"
      >
        <p className="text-14 font-medium text-foreground">看看大家怎么用?</p>
        <p className="mt-1 text-12 text-faint">恩特学术 · 占位</p>
      </a>
    </div>
  );
}
