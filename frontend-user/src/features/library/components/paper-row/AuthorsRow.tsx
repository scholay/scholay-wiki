import { useOpenAuthorDetail } from '@/shared/hooks';
import type { PaperAuthor, PaperSource } from '@/shared/api/types';

/**
 * 作者行 —— 前 5 个名字可点跳学者详情(对齐搜索结果卡 MetaLine 的交互),
 * 超出 5 个折叠成 "等 N 人"。
 *
 * 走 `useOpenAuthorDetail`:文献集/检索 embed 时进右栏,否则全页浏览器 tab。
 * 作者无 authorId(后端 enrich 不到时)→ 渲染纯文本不可点,避免给出无效链接。
 * 作者同源 = 论文源 —— minicod 三源数据隔离,跨源 authorId 不通。
 */
export function AuthorsRow({
  authors,
  paperSource,
}: {
  authors?: PaperAuthor[];
  /** source 兼容 'local' —— 自由文件的 og_authors 没有 authorId,只渲染纯文本,
      跳转分支不会走到,所以 source='local' 不会引发实际跨源问题 */
  paperSource: PaperSource;
}) {
  const openAuthor = useOpenAuthorDetail();
  if (!authors || authors.length === 0) return null;
  const cleaned = authors
    .map((a) => ({ ...a, name: a?.name?.trim() }))
    .filter((a): a is PaperAuthor & { name: string } => !!a.name);
  if (cleaned.length === 0) return null;
  const visible = cleaned.slice(0, 5);
  const overflow = cleaned.length - visible.length;

  const handleClick = (a: PaperAuthor, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!a.authorId || paperSource === 'local') return;
    openAuthor({
      authorId: a.authorId,
      name: a.name ?? '',
      affiliations: a.affiliations,
      source: paperSource,
    });
  };

  return (
    <p
      className="text-xs text-muted-foreground truncate"
      title={cleaned.map((a) => a.name).join(', ')}
    >
      {visible.map((a, i) => (
        <span key={a.authorId ?? `${i}-${a.name}`}>
          {i > 0 && <span className="text-faint">, </span>}
          {a.authorId ? (
            <button
              type="button"
              onClick={(e) => handleClick(a, e)}
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
      {overflow > 0 && (
        <span className="text-faint"> 等 {cleaned.length} 人</span>
      )}
    </p>
  );
}
