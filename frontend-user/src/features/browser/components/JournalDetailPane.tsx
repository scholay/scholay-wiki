import { useEffect, useMemo } from 'react';
import { useMatch } from 'react-router-dom';
import {
  AlertCircle,
  ExternalLink,
  Loader2,
  Share2,
  Sparkles,
  Star,
} from 'lucide-react';
import { toast } from 'sonner';
import { copyToClipboard } from '@/shared/lib/clipboard';
import { EmptyState } from '@/shared/components/EmptyState';
import { JournalCover } from '@/shared/components/JournalCover';
import { cn } from '@/shared/lib/utils';
import {
  journalTabKey,
  useBrowserTabs,
} from '@/stores/browser-tabs.store';
import { useJournalDetail } from '@/shared/api/journals';

/**
 * 期刊详情面板 —— 文献集右侧 pane 的内容(kind='journal' tab 命中时渲染),
 * 同时也复用给 /journals/:id 路由(文献集外打开)。
 *
 * 设计稿 .pen `gsFps`(期刊详情页) 五段:
 *   ┌─ Breadcrumb
 *   ├─ Hero(cover + 标题 + 描述 + meta + action)
 *   ├─ 分区与影响因子 4 卡(idxRow)
 *   ├─ twoCol(mainCol = scope + 评分占位 / sideCol = 投稿信息占位 5 卡)
 *   └─ 评论区(占位)
 *
 * 上游目前只返回基础元数据(IF/分区/h-index/sources),评分 & 评论 & 期刊详细收录
 * 信息要等内部研究论坛功能上线,这里画占位框 "即将上线"。
 */

export function JournalDetailPane() {
  // /journal/:id 和 /journal/:id/:slug 都 match; slug 仅做 SEO, 这里只读 id。
  const match = useMatch('/journal/:id/*');
  const id = match?.params.id ? Number(match.params.id) : NaN;
  const tabId = Number.isFinite(id) ? journalTabKey(id) : '';

  const tab = useBrowserTabs((s) => {
    const t = s.tabs.find((t) => t.id === tabId);
    return t && t.kind === 'journal' ? t : undefined;
  });
  const openJournalTab = useBrowserTabs((s) => s.openJournalTab);

  // 兜底拉取:tab 不在 store(分享链接) → 调后端
  const needsFetch = !tab && Number.isFinite(id) && id > 0;
  const fallback = useJournalDetail(needsFetch ? id : null, needsFetch);

  useEffect(() => {
    if (fallback.data) {
      openJournalTab(fallback.data, tab?.returnTo ?? '/');
    }
  }, [fallback.data, tab?.returnTo, openJournalTab]);

  const journal = tab?.journal ?? fallback.data;

  const issns = useMemo(
    () => (journal?.issns ?? []).filter(Boolean).join(' / '),
    [journal]
  );

  if (!journal) {
    if (fallback.isLoading) {
      return (
        <div className="flex items-center justify-center py-16 text-faint">
          <Loader2 className="size-4 animate-spin" />
        </div>
      );
    }
    if (fallback.error) {
      return (
        <EmptyState
          icon={AlertCircle}
          title="期刊加载失败"
          description={
            (fallback.error as Error).message || '该期刊可能已下架或暂时不可用,请稍后重试'
          }
        />
      );
    }
    return (
      <EmptyState
        icon={AlertCircle}
        title="页签已失效"
        description="请回到期刊主页或搜索结果重新打开"
      />
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-6xl mx-auto px-10 py-7 space-y-6">
        {/* breadcrumb 已删除 —— 浏览器 tabs 条已经能交代"我从哪来 / 现在看什么",
            再叠一层"我的收藏 › 期刊 › <name>"反而冗余 */}

        {/* ───── Hero —— .pen `L3sjEN`(rounded-10 bg-FAFAFA border) ───── */}
        <section className="rounded-lg bg-surface-1 border border-border-soft p-6 flex items-stretch gap-6">
          {/* Cover —— .pen `oWWC5` 140x180 */}
          <JournalCover
            id={journal.id}
            name={journal.canonical_name}
            size="lg"
            className="w-[140px] h-[180px] shrink-0"
          />

          <div className="flex-1 min-w-0 flex flex-col gap-3.5">
            {/* metaTop —— badge 行 */}
            <div className="flex items-center gap-2 flex-wrap">
              {journal.publisher && (
                <span className="inline-flex items-center h-6 px-2.5 rounded-pill bg-background border border-border text-2xs font-bold text-subtle">
                  {journal.publisher}
                </span>
              )}
              {journal.country && (
                <span className="inline-flex items-center h-6 px-2.5 rounded-pill bg-background border border-border text-2xs font-bold text-subtle">
                  {journal.country}
                </span>
              )}
              {journal.type && (
                <span className="inline-flex items-center h-6 px-2.5 rounded-pill bg-foreground text-background text-2xs font-bold uppercase tracking-wide">
                  {journal.type}
                </span>
              )}
              {journal.is_oa && (
                <span className="inline-flex items-center h-6 px-2.5 rounded-pill bg-brand-green/10 text-brand-green text-2xs font-bold">
                  Open Access
                </span>
              )}
              {journal.gjqk_warning && (
                <span className="inline-flex items-center h-6 px-2.5 rounded-pill bg-warning-soft text-brand-amber text-2xs font-bold">
                  ⚠ 中科院预警
                </span>
              )}
            </div>

            {/* Title —— .pen `n9lzJB` 32/700 Playfair(arbitrary,token 表最大 24) */}
            <h1 className="font-display font-bold leading-tight text-[32px] text-foreground">
              {journal.canonical_name}
            </h1>

            {/* Description —— 上游不提供 abstract / scope，前置 metadata 拼一句 */}
            <p className="text-base text-subtle leading-relaxed">
              {buildDescription(journal)}
            </p>

            {/* metaBot —— h-index / ISSN / 数据源数 */}
            <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-faint">
              {issns && <span className="font-mono">ISSN {issns}</span>}
              {journal.openalex_h_index != null && (
                <span>
                  <span className="text-subtle font-bold">h-index </span>
                  <span className="tabular-nums">{journal.openalex_h_index}</span>
                </span>
              )}
              {(journal.source_count ?? 0) > 0 && (
                <span>
                  <span className="text-subtle font-bold">已收录于 </span>
                  <span className="tabular-nums">{journal.source_count}</span> 个数据源
                </span>
              )}
            </div>

            {/* actRow —— 查询原刊 / 分享(期刊"收藏"功能待后端接口上线后再加) */}
            <div className="flex items-center gap-2 pt-1">
              {journal.issns?.[0] && (
                <a
                  // ISSN Portal —— 期刊的官方注册条目页(由 ISSN 国际中心维护),
                  // 通常会跳到出版社的真实期刊主页或给出 ISSN 的元数据卡。
                  // 之前用 crossref 搜索结果页(`search.crossref.org/?q=ISSN`)是"搜索",
                  // 不是"期刊"本身,用户体验对不上"查询原刊"这个动作。
                  href={`https://portal.issn.org/resource/ISSN/${encodeURIComponent(journal.issns[0])}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-foreground text-background text-xs font-bold hover:opacity-90 transition-opacity"
                >
                  <ExternalLink className="size-3" strokeWidth={2.5} />
                  查询原刊
                </a>
              )}
              <button
                type="button"
                onClick={async () => {
                  // 走 copyToClipboard:非安全上下文(HTTP / 旧 webview)直接
                  // navigator.clipboard 是 undefined,会抛 TypeError;
                  // 这个 helper 内部会兜底 execCommand,跨浏览器都能用。
                  const ok = await copyToClipboard(window.location.href);
                  if (ok) toast.success('已复制期刊链接');
                  else toast.error('复制失败,请手动复制地址栏链接');
                }}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-xs font-bold text-subtle hover:border-foreground hover:text-foreground transition-colors"
              >
                <Share2 className="size-3" strokeWidth={2.5} />
                分享
              </button>
            </div>
          </div>
        </section>

        {/* ───── 分区与影响因子 —— .pen `lVZBz` / `pBYQd` ───── */}
        <h2 className="font-display font-bold text-lg leading-none text-foreground">
          分区与影响因子
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <IndexCard
            label="JCR 分区"
            value={journal.jcr_quartile ?? '—'}
            sub={journal.jcr_quartile ? '汤森路透' : '未收录'}
          />
          <IndexCard
            label="中科院分区"
            value={journal.fqb_quartile ? `${journal.fqb_quartile}区` : '—'}
            sub={
              journal.fqb_quartile === '1'
                ? 'Top'
                : journal.fqb_quartile
                  ? '大类分区'
                  : '未收录'
            }
          />
          <IndexCard
            label="H-index"
            value={
              journal.openalex_h_index != null
                ? `h ${journal.openalex_h_index}`
                : '—'
            }
            sub="累计 h-index"
          />
          <IndexCard
            label="影响因子"
            value={fmtIf(journal.jcr_impact_factor)}
            sub={journal.ccf_rank ? `CCF ${journal.ccf_rank}` : 'IF'}
            highlight
          />
        </div>

        {/* ───── twoCol —— .pen `ddnpH` ───── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
          {/* mainCol */}
          <div className="space-y-6">
            {/* Scope / 出版社信息 / 数据源 —— 真数据,不占位 */}
            <section className="rounded-lg bg-background border border-border p-5 space-y-3">
              <h3 className="font-display font-bold text-md leading-none text-foreground">
                出版与收录
              </h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-xs">
                <Field label="出版社" value={journal.publisher ?? '—'} />
                <Field label="国家 / 地区" value={journal.country ?? '—'} />
                <Field label="期刊类型" value={journal.type ?? '—'} mono />
                <Field
                  label="开放获取"
                  value={journal.is_oa ? '✓ Open Access' : '订阅期刊'}
                />
              </div>
            </section>

            {/* 评分占位 —— ratSec —— "投稿口碑"/"审稿周期" 等社区数据,即将上线 */}
            <Placeholder
              icon={Star}
              title="期刊评分即将上线"
              body="投稿口碑、平均审稿周期、命中率等社区评分功能尚在开发中,届时将根据真实研究者投稿经历汇总展示。"
            />
          </div>

          {/* sideCol —— .pen `rIJAi` w-340 五卡(投稿要求/截稿/版面费等)占位 */}
          <aside className="space-y-3.5">
            <Placeholder
              icon={Sparkles}
              title="投稿要求即将上线"
              body="格式规范、版面费、首页配图要求等。"
              compact
            />
            <Placeholder
              icon={Sparkles}
              title="发稿周期即将上线"
              body="近 3 年平均审稿周期、命中率分布等。"
              compact
            />
            <Placeholder
              icon={Sparkles}
              title="编委会信息即将上线"
              body="主编、副主编、责任编辑联系方式等。"
              compact
            />
          </aside>
        </div>

        {/* ───── 评论区 —— .pen `P6Pqr6` 占位 ───── */}
        <Placeholder
          icon={Sparkles}
          title="研究论坛即将上线"
          body="同行投稿经验、审稿心得、相关讨论将在此聚合,目前功能正在开发中。"
        />
      </div>
    </div>
  );
}

// ============================================================================

function buildDescription(j: {
  publisher?: string;
  country?: string;
  type?: string;
  canonical_name: string;
}): string {
  const parts: string[] = [];
  if (j.publisher) parts.push(`由 ${j.publisher} 出版`);
  if (j.country) parts.push(`总部位于 ${j.country}`);
  if (j.type === 'journal') parts.push('属于学术期刊');
  if (j.type === 'conference') parts.push('属于学术会议');
  if (parts.length === 0) {
    return `${j.canonical_name} 的详细介绍尚在补充,可通过下方"查询原刊"前往出版方页面。`;
  }
  return parts.join('、') + '。详细 scope/editorial board 即将接入。';
}

function fmtIf(v: number | undefined): string {
  if (v == null) return '—';
  return v.toFixed(1);
}

function IndexCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-lg p-5 space-y-1.5',
        highlight
          ? 'bg-foreground text-background'
          : 'bg-background border border-border'
      )}
    >
      <div
        className={cn(
          'text-2xs font-bold uppercase tracking-[0.16em]',
          highlight ? 'text-background/60' : 'text-faint'
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          'font-display font-bold text-2xl leading-none tabular-nums',
          highlight ? 'text-background' : 'text-foreground'
        )}
      >
        {value}
      </div>
      <div
        className={cn(
          'text-xs',
          highlight ? 'text-background/60' : 'text-muted-foreground'
        )}
      >
        {sub}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-2xs font-bold uppercase tracking-[0.12em] text-faint">
        {label}
      </div>
      <div
        className={cn(
          'mt-0.5 text-foreground',
          mono && 'font-mono uppercase'
        )}
      >
        {value}
      </div>
    </div>
  );
}

function Placeholder({
  icon: Icon,
  title,
  body,
  compact,
}: {
  icon: typeof Sparkles;
  title: string;
  body: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border border-dashed border-border bg-background',
        compact ? 'p-4' : 'p-6'
      )}
    >
      <div
        className={cn(
          'flex items-start gap-3',
          compact ? 'gap-2.5' : 'gap-3'
        )}
      >
        <span
          className={cn(
            'inline-flex shrink-0 items-center justify-center rounded-md bg-surface-2 text-muted-foreground',
            compact ? 'h-8 w-8' : 'h-10 w-10'
          )}
        >
          <Icon className={cn(compact ? 'size-3.5' : 'size-4')} strokeWidth={2} />
        </span>
        <div className="space-y-1">
          <div
            className={cn(
              'font-bold text-foreground leading-none',
              compact ? 'text-xs' : 'text-base'
            )}
          >
            {title}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {body}
          </p>
        </div>
      </div>
    </div>
  );
}
