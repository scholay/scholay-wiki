import { useMemo } from 'react';
import { useOpenAuthorDetail } from '@/shared/hooks';
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
  // 有 authorId 的渲染成 button(可点跳学者详情),没 id 的纯文本不可点,
  // 与 MetaLine 里的搜索结果卡保持一致。自由文件(source='local')无上游 → 不可点。
  const openAuthor = useOpenAuthorDetail();
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
  const handleClickAuthor = (a: (typeof authors)[number]) => {
    if (!a.authorId || isLocal) return;
    openAuthor({
      authorId: a.authorId,
      name: a.name ?? '',
      affiliations: a.affiliations,
      // isLocal 已守门:这里 paper.source 必然是 UpstreamSource('stc' | 'olx' | 'pmd')
      // 之一,但 TS 不能从局部变量 isLocal 反推 paper.source 类型,所以再判一次
      source: paper.source === 'local' ? undefined : paper.source,
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
      {/* metaRow —— uppercase letter-spaced 10px #888 */}
      {meta && (
        <div className="text-2xs font-bold uppercase tracking-[0.18em] text-faint">
          {meta}
        </div>
      )}

      {/* Title —— Playfair 42(.pen `J6zGLj`),token 表最大 24,arbitrary 必要。
          移动端收到 text-3xl,避免 42px 在 ~390px 屏一行没几个字、占满整屏;桌面恢复 42px。
          展示用 displayedTitle,翻译切换时这里跟着变 */}
      <h1 className="font-display font-bold leading-[1.2] sm:leading-[1.18] text-3xl sm:text-[42px] text-foreground tracking-tight">
        {displayedTitle}
      </h1>

      {/* 作者 + 单位 */}
      {(visibleAuthors.length > 0 || affiliations.length > 0) && (
        <div className="space-y-1.5">
          {visibleAuthors.length > 0 && (
            <p className="text-md leading-relaxed text-subtle">
              {visibleAuthors.map((a, i) => (
                <span key={a.authorId ?? `${i}-${a.name}`}>
                  {i > 0 && <span className="text-faint">, </span>}
                  {a.authorId && !isLocal ? (
                    <button
                      type="button"
                      onClick={() => handleClickAuthor(a)}
                      title={`查看学者详情:${a.name}`}
                      className="underline decoration-dotted decoration-faint underline-offset-2 hover:text-brand-red hover:decoration-brand-red transition-colors"
                    >
                      {a.name}
                    </button>
                  ) : (
                    <span>{a.name}</span>
                  )}
                </span>
              ))}
              {overflowCount > 0 && (
                <span className="text-faint">
                  {' '}
                  … ({authors.length} 位作者)
                </span>
              )}
            </p>
          )}
          {affiliations.length > 0 && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {affiliations.join('   ')}
            </p>
          )}
        </div>
      )}

      {/* 元数据条 —— DOI / 发表日期 / 引用 / 参考 / OA / 学科 / 上游链接 */}
      <PaperMetadataBlock paper={paper} libRow={libRow} />

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
