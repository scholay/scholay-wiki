import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { authorPath, isModifiedClick, useOpenAuthorInBrowser } from '@/shared/hooks';
import type { TranslatePaperResult } from '@/shared/api/translate';
import type { Paper, UserLibraryPaper } from '@/shared/api/types';
import { PaperMetadataBlock } from './PaperMetadataBlock';
import { PaperActionRow } from './PaperActionRow';

/**
 * Hero —— metaRow + 大标题 + 作者 + metadata + actionRow + 分隔线
 *
 * displayedTitle 可能是中文译文(父级翻译切换控制);其他字段始终用原 paper。
 */
export function PaperHeader({
  paper,
  displayedTitle,
  libRow,
  zh,
  showZh,
  onTranslated,
  onToggleZh,
}: {
  /** 原 paper —— ActionRow 的 TranslatePaperButton / 引用 / 收藏 都用原数据 */
  paper: Paper;
  /** 大标题展示文案 —— 可能是中文翻译后的版本 */
  displayedTitle: string;
  libRow: UserLibraryPaper | null;
  zh: TranslatePaperResult | null;
  showZh: boolean;
  onTranslated: (r: TranslatePaperResult) => void;
  onToggleZh: () => void;
}) {
  // metaRow 拼接 —— "VENUE · CATEGORY · YEAR · arXiv:ID(若是 arxiv)"
  // 不再展示 "ID:OLX:xxx" 这种数据源内部标识,对终端用户无意义
  const meta = useMemo(() => {
    const parts: string[] = [];
    if (paper.venue) parts.push(paper.venue);
    if (paper.fieldsOfStudy?.[0]) parts.push(paper.fieldsOfStudy[0]);
    if (paper.year) parts.push(String(paper.year));
    // 从 url 里抠 arXiv id (https://arxiv.org/abs/2510.04217 → 2510.04217)—— 学术圈惯用
    const arxivId = paper.url?.match(/arxiv\.org\/abs\/([\d.v]+)/i)?.[1];
    if (arxivId) parts.push(`arXiv:${arxivId}`);
    return parts.join('  ·  ');
  }, [paper]);

  // 作者:最多展示 12 个,超出 "… (N 位作者)"。
  // 有 authorId 的渲染成真实 <Link href>(SEO 硬约束:水合后的 DOM 必须保留内链),
  // 没 id 的纯文本不可点,与 MetaLine 里的搜索结果卡保持一致。
  // 自由文件(source='local')无上游 → 不可点。
  const openAuthor = useOpenAuthorInBrowser();
  const authors = paper.authors ?? [];
  const visibleAuthors = useMemo(
    () =>
      authors
        .map((a) => ({ ...a, name: a.name?.trim() }))
        .filter(
          (a): a is (typeof authors)[number] & { name: string } => !!a.name
        )
        .slice(0, 12),
    [authors]
  );
  const overflowCount = authors.length - visibleAuthors.length;
  const isLocal = paper.source === 'local';
  // isLocal 已守门:这里 paper.source 必然是 UpstreamSource('stc' | 'olx' | 'pmd')
  // 之一,但 TS 不能从局部变量 isLocal 反推 paper.source 类型,所以再判一次
  const authorSource = paper.source === 'local' ? undefined : paper.source;
  const authorTo = (a: (typeof authors)[number]): string | null =>
    isLocal ? null : authorPath({ authorId: a.authorId, source: authorSource });
  // <Link> 的 onClick 只做副作用(store 写 tab),导航由 <Link> 自己完成;
  // 修饰键点击(新标签)不写 store,由新标签自己 fallback fetch
  const handleClickAuthor = (
    a: (typeof authors)[number],
    e: React.MouseEvent
  ) => {
    if (isModifiedClick(e)) return;
    if (!a.authorId || isLocal) return;
    openAuthor.prepare({
      authorId: a.authorId,
      name: a.name ?? '',
      affiliations: a.affiliations,
      source: authorSource,
    });
  };

  // 单位/机构 —— 去重 + 限制 8 个
  const affiliations = useMemo(() => {
    const set = new Set<string>();
    for (const a of authors) {
      for (const aff of a.affiliations ?? []) {
        if (aff?.trim()) set.add(aff.trim());
      }
    }
    return [...set].slice(0, 8);
  }, [authors]);

  return (
    <header className="space-y-5 sm:space-y-8">
      {/* metaRow —— uppercase 段标。注释原写「letter-spaced 10px #888」,是 .pen 时代的
          遗留口径:10px 不在 Figma 六档内、tracking 已按 Figma §2.5 全站删除、#888 已退休。
          现行实现 = text-12 + text-faint,无 tracking。 */}
      {meta && (
        <div className="text-12 font-medium uppercase text-faint">
          {meta}
        </div>
      )}

      {/* Title —— 详情页 h1。当前 dev.pen 的正式阶梯包含 28/32px,
          与 AuthorHero / JournalDetailPane / HelpLayout 的详情页标题统一。
          移动端保持 28px,桌面升到 32px。
          展示用 displayedTitle,翻译切换时这里跟着变 */}
      <h1 className="font-display font-bold leading-display-tight sm:leading-display-tight text-28 sm:text-32 text-foreground">
        {displayedTitle}
      </h1>

      {/* 作者 + 单位 */}
      {(visibleAuthors.length > 0 || affiliations.length > 0) && (
        <div className="space-y-1.5">
          {visibleAuthors.length > 0 && (
            <p className="text-14 leading-paragraph text-subtle">
              {visibleAuthors.map((a, i) => {
                const to = authorTo(a);
                return (
                  <span key={a.authorId ?? `${i}-${a.name}`}>
                    {i > 0 && <span className="text-faint">, </span>}
                    {to ? (
                      <Link
                        to={to}
                        onClick={(e) => handleClickAuthor(a, e)}
                        title={`查看学者详情:${a.name}`}
                        className="underline decoration-dotted decoration-faint underline-offset-2 hover:text-brand-red hover:decoration-brand-red transition-colors"
                      >
                        {a.name}
                      </Link>
                    ) : (
                      <span>{a.name}</span>
                    )}
                  </span>
                );
              })}
              {overflowCount > 0 && (
                <span className="text-faint">
                  {' '}
                  … ({authors.length} 位作者)
                </span>
              )}
            </p>
          )}
          {affiliations.length > 0 && (
            <p className="text-12 leading-paragraph text-muted-foreground">
              {affiliations.join('   ')}
            </p>
          )}
        </div>
      )}

      {/* 元数据条 —— DOI / 发表日期 / 引用 / 参考 / OA / 学科 / 上游链接 */}
      <PaperMetadataBlock paper={paper} />

      {/* action 行 + 分隔 */}
      <PaperActionRow
        paper={paper}
        libRow={libRow}
        zh={zh}
        showZh={showZh}
        onTranslated={onTranslated}
        onToggleZh={onToggleZh}
      />
    </header>
  );
}
