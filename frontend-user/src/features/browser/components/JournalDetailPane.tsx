import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useMatch } from 'react-router-dom';
import { AlertCircle, ExternalLink, Loader2, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { copyToClipboard } from '@/shared/lib/clipboard';
import { EmptyState } from '@/shared/components/EmptyState';
import { JournalCover } from '@/shared/components/JournalCover';
import { JournalSubmissionCard } from '@/shared/components/JournalSubmissionCard';
import { JournalMetricsGroups } from '@/shared/components/JournalMetricsGroups';
import { JournalDecisionCard } from '@/shared/components/JournalDecisionCard';
import { cn } from '@/shared/lib/utils';
import {
  journalTabKey,
  useBrowserTabs,
} from '@/stores/browser-tabs.store';
import { useJournalDetail, useJournalFullDetail } from '@/shared/api/journals';

// recharts(~84KB gz)懒加载:只有期刊详情才渲染年度趋势图,而 /paper、/author、/pdf 与本面板
// 共用同一个 BrowserPage chunk —— 不该让它们的首开背上 recharts。仅当本面板真正渲染趋势图时
// 才拉取该 chunk(与移动端 JournalFeedCard 同款写法)。
const JournalTrendChart = lazy(() =>
  import('@/shared/components/JournalTrendChart').then((m) => ({
    default: m.JournalTrendChart,
  }))
);

/**
 * 期刊详情面板 —— 文件夹右侧 pane 的内容(kind='journal' tab 命中时渲染),
 * 同时也复用给 /journals/:id 路由(文件夹外打开)。
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

  // full=1 完整详情 —— 全字段分组 / 年度趋势 / 投稿资源共用(与 useJournalDetail 同缓存键,
  // 不额外多打一次上游)。无论 tab 来自何处都按 id 拉,因为 store/规范化后的 journal 不含这些。
  const validId = Number.isFinite(id) && id > 0;
  const fullQ = useJournalFullDetail(validId ? id : 0, validId);
  const unified = fullQ.data?.unified;
  // 投稿资源真实结构在 sources.submission(main.has_* + latex.class);规整成卡片要的精简态。
  const subSrc = fullQ.data?.sources?.submission;
  const submissionInfo = subSrc
    ? {
        has_guideline: !!subSrc.main?.has_guideline,
        has_latex: !!subSrc.main?.has_latex,
        latex_class: subSrc.latex?.class ?? null,
      }
    : null;
  const hasSubmission = !!(
    submissionInfo &&
    (submissionInfo.has_guideline || submissionInfo.has_latex)
  );

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
      <div className="max-w-6xl mx-auto px-4 py-4 sm:px-10 sm:py-7 space-y-4 sm:space-y-6">
        {/* breadcrumb 已删除 —— 浏览器 tabs 条已经能交代"我从哪来 / 现在看什么",
            再叠一层"我的收藏 › 期刊 › <name>"反而冗余 */}

        {/* ───── Hero —— rounded-16(Figma §3 主力容器圆角)+ surface-1 弱卡片底 + 发丝边。
             原注释写 .pen `L3sjEN` 的 `rounded-10 bg-FAFAFA` —— 该真源与那两个值都已退休。
             移动端封面在上、信息在下 ───── */}
        <section className="rounded-16 bg-surface-1 border border-border-soft p-4 sm:p-6 flex flex-col sm:flex-row sm:items-stretch gap-4 sm:gap-6">
          {/* Cover —— 期刊封面 140×180(移动端 110×145)。Figma 未给期刊封面规格,
              token 侧也无对应尺寸档,属内容图的固有比例(≈0.78),保留 arbitrary。 */}
          <JournalCover
            id={journal.id}
            name={journal.canonical_name}
            size="lg"
            className="w-[110px] h-[145px] sm:w-[140px] sm:h-[180px] shrink-0"
          />

          <div className="flex-1 min-w-0 flex flex-col gap-3.5">
            {/* metaTop —— badge 行 */}
            <div className="flex items-center gap-2 flex-wrap">
              {journal.publisher && (
                <span className="inline-flex items-center h-6 px-2.5 rounded-pill bg-surface-card border border-border text-12 font-medium text-subtle">
                  {journal.publisher}
                </span>
              )}
              {journal.country && (
                <span className="inline-flex items-center h-6 px-2.5 rounded-pill bg-surface-card border border-border text-12 font-medium text-subtle">
                  {journal.country}
                </span>
              )}
              {journal.type && (
                <span className="inline-flex items-center h-6 px-2.5 rounded-pill bg-foreground text-on-dark text-12 font-medium uppercase">
                  {journal.type}
                </span>
              )}
              {journal.is_oa && (
                <span className="inline-flex items-center h-6 px-2.5 rounded-pill bg-brand-green/10 text-brand-green text-12 font-medium">
                  Open Access
                </span>
              )}
              {journal.xr_quartile && (
                <span className="inline-flex items-center h-6 px-2.5 rounded-pill bg-brand-green/10 text-brand-green text-12 font-medium">
                  新锐 {journal.xr_quartile} 区{journal.xr_top ? ' · Top' : ''}
                </span>
              )}
              {journal.gjqk_warning && (
                <span className="inline-flex items-center h-6 px-2.5 rounded-pill bg-warning-soft text-brand-amber text-12 font-medium">
                  ⚠ 中科院预警
                </span>
              )}
            </div>

            {/* Title —— 详情页 h1。
                原先 `sm:text-[32px]`,依据是 .pen `n9lzJB`(真源已作废);Figma §2.2 里 32px
                只作为「字体展示样本」出现,不是 UI 档位。改用展示档 token `text-display-36`,
                与同级的 PaperHeader / AuthorHero 两个详情页 h1 统一。移动端保持 text-24
                (globals.css 标注即「详情页 h1 移动端」)。 */}
            <h1 className="font-display font-bold leading-display-tight text-24 sm:text-display-36 text-foreground">
              {journal.canonical_name}
            </h1>

            {/* Description —— 上游不提供 abstract / scope，前置 metadata 拼一句 */}
            <p className="text-14 text-subtle leading-paragraph">
              {buildDescription(journal)}
            </p>

            {/* metaBot —— h-index / ISSN / 数据源数 */}
            <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-12 text-faint">
              {issns && <span className="font-mono">ISSN {issns}</span>}
              {journal.openalex_h_index != null && (
                <span>
                  <span className="text-subtle font-medium">h-index </span>
                  <span className="tabular-nums">{journal.openalex_h_index}</span>
                </span>
              )}
              {(journal.source_count ?? 0) > 0 && (
                <span>
                  <span className="text-subtle font-medium">已收录于 </span>
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
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-8 bg-foreground text-on-dark text-12 font-medium hover:opacity-90 transition-opacity"
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
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-8 border border-border text-12 font-medium text-subtle hover:border-foreground hover:text-foreground transition-colors"
              >
                <Share2 className="size-3" strokeWidth={2.5} />
                分享
              </button>
            </div>
          </div>

          {/* 投稿资源 —— Hero 右侧栏(有数据才出现;非 Max 会员锁定)。移动端落到信息下方。 */}
          {hasSubmission && submissionInfo && (
            <div className="shrink-0 border-t border-border-soft pt-4 sm:w-60 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6">
              <JournalSubmissionCard
                journalId={journal.id}
                journalName={journal.canonical_name}
                submission={submissionInfo}
              />
            </div>
          )}
        </section>

        {/* ───── 投稿决策 TL;DR —— 把关键选刊信号一句话综合(零新增请求) ───── */}
        <JournalDecisionCard journal={journal} unified={unified} />

        {/* ───── 分区与影响因子 —— .pen `lVZBz` / `pBYQd` ───── */}
        <h2 className="font-display font-bold text-16 leading-none text-foreground">
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

        {/* 年度趋势(IF / 发文量 / 被引量)—— 复用 feed 同款图;无足够年份数据时自隐。
            与上方详情同缓存键,不额外打上游。recharts 懒加载,fallback 留空(图本就可缺)。 */}
        {validId && (
          <Suspense fallback={null}>
            <JournalTrendChart journalId={id} active />
          </Suspense>
        )}

        {/* 全部指标 —— full=1 返回但主区没铺开的几十个字段,按数据源分组;无数据自隐。 */}
        {unified && <JournalMetricsGroups unified={unified} />}

        {/* 出版与收录 —— 真数据。评分 / 投稿要求 / 发稿周期 / 编委会 / 研究论坛(评论)等
            社区占位卡按需求已移除(后端未上线),只保留有真实数据的区块。 */}
        <section className="rounded-16 bg-surface-card border border-border p-5 space-y-3">
          <h3 className="font-display font-bold text-14 leading-none text-foreground">
            出版与收录
          </h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-12">
            <Field label="出版社" value={journal.publisher ?? '—'} />
            <Field label="国家 / 地区" value={journal.country ?? '—'} />
            <Field label="期刊类型" value={journal.type ?? '—'} mono />
            <Field label="开放获取" value={journal.is_oa ? '✓ Open Access' : '订阅期刊'} />
          </div>
        </section>
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
        'rounded-16 p-5 space-y-1.5',
        highlight
          ? 'bg-foreground text-on-dark'
          : 'bg-surface-card border border-border'
      )}
    >
      <div
        className={cn(
          'text-12 font-medium uppercase',
          highlight ? 'text-on-dark/60' : 'text-faint'
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          'font-display font-bold text-24 leading-none tabular-nums',
          highlight ? 'text-on-dark' : 'text-foreground'
        )}
      >
        {value}
      </div>
      <div
        className={cn(
          'text-12',
          highlight ? 'text-on-dark/60' : 'text-muted-foreground'
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
      <div className="text-12 font-medium uppercase text-faint">
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

