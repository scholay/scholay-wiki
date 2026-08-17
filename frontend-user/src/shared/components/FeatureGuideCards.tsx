import { Link } from 'react-router-dom';

const ENTERSCHOLAR_HOME = 'https://enterscholar.com';
const SCHOLAY_SITE = 'https://www.scholay.com';
const CARD_CLASS =
  'rounded-16 border border-dashed border-border bg-surface-card px-4 py-5 text-left transition-colors hover:border-border-strong hover:bg-surface-1 focus-visible:border-border-strong';

/**
 * 功能空态下方的三向导览：Wiki 词条、EnterScholar 社区与 Scholay 功能页。
 * Wiki 保持当前标签页，两个站外目标都在新标签页打开。
 */
export function FeatureGuideCards({
  topic,
  wikiHref,
  scholayPath,
  communityHref = ENTERSCHOLAR_HOME,
}: {
  topic: string;
  wikiHref: `/wiki/${string}`;
  scholayPath: `/${string}`;
  communityHref?: `https://enterscholar.com${string}`;
}) {
  return (
    <div className="mt-8 grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
      <Link to={wikiHref} className={CARD_CLASS}>
        <p className="text-14 font-medium text-foreground">
          在 Wiki 中了解{topic}
        </p>
        <p className="mt-1 text-12 text-faint">概念、边界与使用方法</p>
      </Link>
      <a
        href={communityHref}
        target="_blank"
        rel="noopener noreferrer"
        className={CARD_CLASS}
      >
        <p className="text-14 font-medium text-foreground">看看大家怎么用？</p>
        <p className="mt-1 text-12 text-faint">EnterScholar 社区讨论</p>
      </a>
      <a
        href={`${SCHOLAY_SITE}${scholayPath}`}
        target="_blank"
        rel="noopener noreferrer"
        className={CARD_CLASS}
      >
        <p className="text-14 font-medium text-foreground">
          前往 Scholay 对应页面
        </p>
        <p className="mt-1 text-12 text-faint">打开实际产品与功能入口</p>
      </a>
    </div>
  );
}
