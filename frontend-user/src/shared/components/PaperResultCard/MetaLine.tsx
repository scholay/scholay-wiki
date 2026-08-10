import { Link } from 'react-router-dom';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/shared/ui/tooltip';
import {
  authorPath,
  isModifiedClick,
  journalPath,
  useOpenAuthorInBrowser,
  useOpenJournalInBrowser,
} from '@/shared/hooks';
import type { Paper, PaperAuthor } from '@/shared/api/types';
import type { JournalEnrichment } from '@/shared/api/journal-enrichment';

/**
 * Meta 行 —— .pen `EzEvZ`(Inter 11 #888):venue · 作者列表 · 年份
 *
 * 演化:原来单行 truncate,venue 长就把作者/年份挤掉看不见。
 * 现在:
 *   - venue 在左,占主空间,过长 truncate(title attr 兜底)
 *   - venue 命中期刊增强(enrichment 非空) → 下划线 + 可点跳详情 /browser/j/:id
 *   - 作者只显前 2 个,超出用 +N hover Tooltip 列全名
 *   - year 在右侧 shrink-0,永远可见
 *
 * 期刊/作者跳转渲染真实 <Link href>(SEO 硬约束);onClick 只做副作用
 * (stopPropagation 压卡片级点击 + store 写 tab),导航由 <Link> 完成。
 */
export function MetaLine({
  paper,
  journalEnrichment,
}: {
  paper: Paper;
  journalEnrichment?: JournalEnrichment | null;
}) {
  const openJournal = useOpenJournalInBrowser();
  const openAuthor = useOpenAuthorInBrowser();
  const venue = paper.venue?.trim();
  // 现在把整条 PaperAuthor 对象都带上(name + authorId) —— 没 authorId 的作者
  // 只渲染纯文本不可点,有 id 的渲染成 <Link> 跳学者详情
  const allAuthors = collectAuthors(paper.authors);
  const visibleAuthors = allAuthors.slice(0, 2);
  const extraAuthors = allAuthors.slice(2);
  const year = paper.year;

  // 自由文件(source='local')的作者没上游来源,跳学者详情无意义 → 不渲染链接
  const isLocal = paper.source === 'local';
  const authorTo = (a: PaperAuthor): string | null =>
    isLocal
      ? null
      : authorPath({
          authorId: a.authorId,
          // 论文内作者跟论文同源 —— 用 paper.source 当 author.source(三源数据隔离)
          source: paper.source === 'local' ? undefined : paper.source,
        });

  const handleClickAuthor = (a: PaperAuthor, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isModifiedClick(e)) return;
    if (!a.authorId || isLocal) return;
    openAuthor.prepare({
      authorId: a.authorId,
      name: a.name ?? '',
      affiliations: a.affiliations,
      source: paper.source === 'local' ? undefined : paper.source,
    });
  };

  if (!venue && allAuthors.length === 0 && !year) return null;

  const journalTo = journalEnrichment?.id
    ? journalPath({ id: journalEnrichment.id })
    : null;
  const handleClickVenue = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isModifiedClick(e)) return;
    if (!journalEnrichment) return;
    openJournal.prepare({
      id: journalEnrichment.id,
      canonical_name: journalEnrichment.canonical_name,
      jcr_quartile: journalEnrichment.jcr_quartile,
      jcr_impact_factor: journalEnrichment.jcr_impact_factor,
      fqb_quartile: journalEnrichment.fqb_quartile,
      ccf_rank: journalEnrichment.ccf_rank,
      openalex_h_index: journalEnrichment.openalex_h_index,
      gjqk_warning: journalEnrichment.gjqk_warning,
      is_oa: journalEnrichment.is_oa,
    });
  };

  return (
    <div className="mt-1 flex items-center gap-2 text-12 text-muted-foreground">
      <div className="flex items-center gap-1 min-w-0 flex-1">
        {venue &&
          (journalTo ? (
            <Link
              to={journalTo}
              onClick={handleClickVenue}
              title={`查看期刊详情:${venue}`}
              className="truncate min-w-0 text-left underline decoration-dotted decoration-faint underline-offset-2 hover:text-brand-red hover:decoration-brand-red transition-colors"
            >
              {venue}
            </Link>
          ) : (
            <span className="truncate min-w-0" title={venue}>
              {venue}
            </span>
          ))}
        {venue && visibleAuthors.length > 0 && (
          <span className="text-faint shrink-0">·</span>
        )}
        {visibleAuthors.length > 0 && (
          <span className="shrink-0 max-w-[260px] truncate">
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
          </span>
        )}
        {extraAuthors.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              {/* 保持 button —— 它只开 Tooltip 不导航,锚点不该包住它 */}
              <button
                type="button"
                className="shrink-0 text-faint hover:text-foreground hover:underline underline-offset-2"
                aria-label={`还有 ${extraAuthors.length} 位作者`}
              >
                +{extraAuthors.length}
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              className="max-w-[300px] text-12 leading-paragraph whitespace-normal"
            >
              {/* 只展示名字串,在 Tooltip 里点击不便就不做跳转;入口仍在前两位 */}
              {extraAuthors.map((a) => a.name).join(' · ')}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      {year && (
        <span className="shrink-0 text-faint tabular-nums">{year}</span>
      )}
    </div>
  );
}

function collectAuthors(authors?: PaperAuthor[]): PaperAuthor[] {
  if (!authors) return [];
  return authors
    .map((a) => ({ ...a, name: a.name?.trim() }))
    .filter((a): a is PaperAuthor & { name: string } => !!a.name);
}
