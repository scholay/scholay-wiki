import { Link, useParams } from 'react-router-dom';
import { AlertCircle, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { EmptyState } from '@/shared/components/EmptyState';
import { HubJournalCard } from '../components/HubJournalCard';
import {
  useJournalHubList,
  useJournalHubOverview,
  type JournalHubDimension,
} from '../api/journal-hubs';
import { countryDisplayName, HUB_BROWSE_PATH, hubListPath } from '../hub-paths';

/**
 * 枢纽列表页 —— category / country / warning / oa 四个维度共用一套渲染,
 * 路由各挂一个薄 wrapper(见文件底部导出 + routes.tsx)。
 *
 * SEO 硬约束:
 *   - 期刊卡刊名 = 真实 <Link>(HubJournalCard 内,journalCanonicalPath);
 *   - 分页 = 路径式真 <Link>(/journals/category/x/2),不是 query、不是 button;
 *   - RouteSEO canonical 与分页路径一致(路径式分页可索引,不 noindex)。
 */

interface HubListMeta {
  /** 面包屑 / h1 的维度名 */
  crumb: string;
  heading: string;
  title: string;
  description: string;
  intro?: string;
}

function metaFor(
  dimension: JournalHubDimension,
  keyName: string,
  page: number,
): HubListMeta {
  const pageSuffix = page > 1 ? `(第 ${page} 页)` : '';
  switch (dimension) {
    case 'category':
      return {
        crumb: '按学科',
        heading: `${keyName} 期刊`,
        title: `${keyName} 期刊列表${pageSuffix} - 影响因子与分区 | Scholay 期刊库`,
        description: `${keyName} 领域收录期刊完整列表,含 JCR 影响因子、JCR / 中科院分区、预警状态与开放获取信息,辅助选刊投稿。`,
        intro: `按中科院大类整理的 ${keyName} 领域期刊,点开逐刊查看影响因子趋势、分区与投稿信息。`,
      };
    case 'country':
      return {
        crumb: '按国家 / 地区',
        heading: `${keyName} 期刊`,
        title: `${keyName} 出版期刊列表${pageSuffix} - 影响因子与分区 | Scholay 期刊库`,
        description: `${keyName} 出版的收录期刊列表,含影响因子、JCR / 中科院分区、预警状态与开放获取信息。`,
      };
    case 'warning':
      return {
        crumb: '专题',
        heading: '国际期刊预警名单',
        title: `国际期刊预警名单${pageSuffix} - 中科院预警期刊 | Scholay 期刊库`,
        description:
          '中科院《国际期刊预警名单》收录的预警期刊完整列表,含预警等级、影响因子与分区信息 —— 投稿前必查,避开高风险期刊。',
        intro:
          '中科院文献情报中心每年发布《国际期刊预警名单》,提示存在批量发文、高自引等风险的期刊。名单内期刊均标注预警等级,投稿前请逐刊核对。',
      };
    case 'oa':
      return {
        crumb: '专题',
        heading: '开放获取(OA)期刊',
        title: `开放获取(OA)期刊列表${pageSuffix} - Scholay 期刊库`,
        description:
          '开放获取(Open Access)期刊完整列表,含影响因子、JCR / 中科院分区与 h-index,读者免费阅读,便于成果传播。',
      };
  }
}

function HubListPage({ dimension }: { dimension: JournalHubDimension }) {
  const params = useParams<{ slug?: string; cc?: string; page?: string }>();
  const key =
    dimension === 'category' ? params.slug : dimension === 'country' ? params.cc : undefined;
  const page = Math.max(1, Number(params.page) || 1);

  const listQ = useJournalHubList({ dimension, key, page });
  // overview 已被 browse 页热身(STALE_COLD 缓存);这里只为把 category slug 解析成中文名
  const overviewQ = useJournalHubOverview();

  const keyName =
    dimension === 'category'
      ? overviewQ.data?.categories.find((c) => c.slug === key)?.name ?? key ?? ''
      : dimension === 'country'
        ? countryDisplayName(key ?? '')
        : '';

  const meta = metaFor(dimension, keyName, page);
  const items = listQ.data?.items ?? [];
  const total = listQ.data?.total ?? 0;
  const perPage = listQ.data?.per_page ?? 50;
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, perPage)));

  return (
    <div className="h-full overflow-auto bg-background">
      <RouteSEO
        title={meta.title}
        description={meta.description}
        canonical={hubListPath(dimension, key, page)}
      />

      <div className="max-w-6xl mx-auto px-10 py-7 space-y-6">
        {/* 面包屑 + 标题 —— 全部真实 <Link>,给每刊稳定的入链路径 */}
        <header className="space-y-2">
          <nav aria-label="面包屑" className="text-12 text-faint">
            <Link to="/journals/search" className="hover:text-foreground">
              期刊
            </Link>
            <span className="mx-1">/</span>
            <Link to={HUB_BROWSE_PATH} className="hover:text-foreground">
              浏览全部
            </Link>
            <span className="mx-1">/</span>
            <span className="text-subtle">{meta.heading}</span>
          </nav>
          <h1 className="font-display font-bold leading-display-tight text-28 text-foreground">
            {meta.heading}
          </h1>
          <p className="text-14 text-faint">
            {total > 0 && (
              <>
                共{' '}
                <span className="text-foreground font-medium tabular-nums">
                  {total.toLocaleString()}
                </span>{' '}
                刊
                {totalPages > 1 && ` · 每页 ${perPage} 刊 · 第 ${page} / ${totalPages} 页`}
              </>
            )}
          </p>
          {meta.intro && page === 1 && (
            <p className="text-12 leading-paragraph text-muted-foreground max-w-3xl">
              {meta.intro}
            </p>
          )}
        </header>

        {listQ.error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-16 bg-brand-red-soft text-brand-red text-12">
            <AlertCircle className="size-4" />
            期刊列表加载失败,请稍后重试
          </div>
        )}

        {listQ.isLoading && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-24 rounded-12 bg-surface-card border border-border-hairline animate-pulse"
              />
            ))}
          </div>
        )}

        {!listQ.isLoading && !listQ.error && items.length === 0 && (
          <EmptyState
            icon={Search}
            title="该维度下暂无已收录期刊"
            description="数据按批次发布,稍后再来看看;也可以回浏览页换一个学科或国家。"
            action={
              <Link
                to={HUB_BROWSE_PATH}
                className="inline-flex items-center h-8 px-3 rounded-8 border border-border text-12 font-medium text-foreground hover:bg-surface-1 transition-colors"
              >
                返回浏览全部
              </Link>
            }
          />
        )}

        {items.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {items.map((item) => (
              <HubJournalCard key={item.journal_id} item={item} />
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <HubPagination
            dimension={dimension}
            keyValue={key}
            page={page}
            totalPages={totalPages}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================================

/**
 * 路径式分页 —— 上一页/下一页是真实 <Link href>(/journals/category/x/2),
 * 爬虫沿 href 逐页发现全部期刊;不是 query 参数、不是 button onClick。
 */
function HubPagination({
  dimension,
  keyValue,
  page,
  totalPages,
}: {
  dimension: JournalHubDimension;
  keyValue?: string;
  page: number;
  totalPages: number;
}) {
  const linkCls =
    'inline-flex h-7 px-3 items-center gap-1 rounded-8 text-12 font-medium border border-border text-foreground hover:bg-surface-1 transition-colors';
  const disabledCls =
    'inline-flex h-7 px-3 items-center gap-1 rounded-8 text-12 font-medium border border-border-hairline text-faint cursor-not-allowed';

  return (
    <nav aria-label="分页" className="flex items-center justify-center gap-2 py-4">
      {page > 1 ? (
        <Link to={hubListPath(dimension, keyValue, page - 1)} className={linkCls}>
          <ChevronLeft className="size-3" strokeWidth={2.5} />
          上一页
        </Link>
      ) : (
        <span aria-disabled className={disabledCls}>
          <ChevronLeft className="size-3" strokeWidth={2.5} />
          上一页
        </span>
      )}

      <span className="inline-flex h-7 min-w-16 px-3 items-center justify-center rounded-8 bg-foreground text-on-dark text-12 font-medium tabular-nums">
        {page} / {totalPages}
      </span>

      {page < totalPages ? (
        <Link to={hubListPath(dimension, keyValue, page + 1)} className={linkCls}>
          下一页
          <ChevronRight className="size-3" strokeWidth={2.5} />
        </Link>
      ) : (
        <span aria-disabled className={disabledCls}>
          下一页
          <ChevronRight className="size-3" strokeWidth={2.5} />
        </span>
      )}
    </nav>
  );
}

// ============================================================================
// 路由薄 wrapper —— routes.tsx 每条路径挂一个(页面级 lazy 以文件为单位,
// 四个维度共用本 chunk)。
// ============================================================================

export function JournalHubCategoryPage() {
  return <HubListPage dimension="category" />;
}

export function JournalHubCountryPage() {
  return <HubListPage dimension="country" />;
}

export function JournalHubWarningPage() {
  return <HubListPage dimension="warning" />;
}

export function JournalHubOaPage() {
  return <HubListPage dimension="oa" />;
}

export default JournalHubCategoryPage;
