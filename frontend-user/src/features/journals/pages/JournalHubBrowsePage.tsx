import { Link } from 'react-router-dom';
import { AlertCircle, AlertTriangle, ArrowUpRight, Unlock } from 'lucide-react';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { HubJournalCard } from '../components/HubJournalCard';
import { useJournalHubOverview } from '../api/journal-hubs';
import { countryDisplayName, hubListPath } from '../hub-paths';

/**
 * /journals/browse —— 期刊发现层总枢纽。
 *
 * 冷请求由后端 SSR 输出可爬 HTML;本页是水合后的 SPA 视图,数据同一个
 * /public/journal-hubs/overview。所有入口都是真实 <Link href>(SEO 硬约束):
 * 学科 / 国家 / 预警 / OA 各维度列表页 + 最新收录 20 刊。
 */
export function JournalHubBrowsePage() {
  const q = useJournalHubOverview();
  const data = q.data;

  return (
    <div className="h-full overflow-auto bg-background">
      <RouteSEO
        title="按学科 / 国家浏览全部期刊 - Scholay 期刊库"
        description="按中科院大类学科、国家/地区、国际期刊预警名单与开放获取(OA)专题浏览全部收录期刊,逐刊查看影响因子、JCR 与中科院分区、h-index 与投稿信息。"
        keywords="期刊大全,按学科浏览期刊,按国家浏览期刊,预警期刊名单,OA期刊列表,期刊分区,影响因子"
        canonical="/journals/browse"
      />

      <div className="max-w-6xl mx-auto px-10 py-7 space-y-8">
        {/* 面包屑 + 标题 */}
        <header className="space-y-2">
          <nav aria-label="面包屑" className="text-12 text-faint">
            <Link to="/journals/search" className="hover:text-foreground">
              期刊
            </Link>
            <span className="mx-1">/</span>
            <span className="text-subtle">浏览全部</span>
          </nav>
          <h1 className="font-display font-bold leading-display-tight text-28 text-foreground">
            按学科 / 国家浏览全部期刊
          </h1>
          <p className="text-14 text-faint max-w-3xl">
            从学科大类、国家/地区或专题入口进入完整期刊列表;每刊可查看影响因子、JCR
            与中科院分区、预警状态与投稿信息。
          </p>
        </header>

        {q.error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-16 bg-brand-red-soft text-brand-red text-12">
            <AlertCircle className="size-4" />
            枢纽数据加载失败,请稍后重试
          </div>
        )}

        {q.isLoading && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-16 rounded-12 bg-surface-card border border-border-hairline animate-pulse"
              />
            ))}
          </div>
        )}

        {data && (
          <>
            {/* ── 专题入口 ───────────────────────────────────────── */}
            <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Link
                to={hubListPath('warning')}
                className="group flex items-center gap-3 p-4 rounded-16 bg-surface-card border border-border hover:border-foreground transition-colors"
              >
                <span className="inline-flex size-9 items-center justify-center rounded-8 bg-brand-red-soft text-brand-red">
                  <AlertTriangle className="size-4" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-14 font-medium text-foreground group-hover:text-brand-red transition-colors">
                    国际期刊预警名单
                  </span>
                  <span className="block text-12 text-faint">
                    中科院预警期刊 {data.warning_count.toLocaleString()} 刊,投稿前必查
                  </span>
                </span>
                <ArrowUpRight className="size-4 text-faint group-hover:text-foreground" />
              </Link>

              <Link
                to={hubListPath('oa')}
                className="group flex items-center gap-3 p-4 rounded-16 bg-surface-card border border-border hover:border-foreground transition-colors"
              >
                <span className="inline-flex size-9 items-center justify-center rounded-8 bg-brand-green-soft text-brand-green">
                  <Unlock className="size-4" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-14 font-medium text-foreground group-hover:text-brand-red transition-colors">
                    开放获取(OA)期刊
                  </span>
                  <span className="block text-12 text-faint">
                    {data.oa_count.toLocaleString()} 刊开放获取,读者免费阅读
                  </span>
                </span>
                <ArrowUpRight className="size-4 text-faint group-hover:text-foreground" />
              </Link>
            </section>

            {/* ── 按学科(中科院大类) ────────────────────────────── */}
            {data.categories.length > 0 && (
              <section className="space-y-3">
                <h2 className="font-display font-bold text-16 text-foreground">
                  按学科浏览
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {data.categories.map((cat) => (
                    <Link
                      key={cat.slug}
                      to={hubListPath('category', cat.slug)}
                      className="flex items-center justify-between gap-2 h-10 px-3 rounded-8 bg-surface-card border border-border text-14 text-foreground hover:border-foreground transition-colors"
                    >
                      <span className="truncate">{cat.name}</span>
                      <span className="text-12 text-faint tabular-nums shrink-0">
                        {cat.count.toLocaleString()}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* ── 按国家 / 地区 ──────────────────────────────────── */}
            {data.countries.length > 0 && (
              <section className="space-y-3">
                <h2 className="font-display font-bold text-16 text-foreground">
                  按国家 / 地区浏览
                </h2>
                <div className="flex flex-wrap gap-2">
                  {data.countries.map((c) => (
                    <Link
                      key={c.code}
                      to={hubListPath('country', c.code)}
                      className="inline-flex items-center gap-1 h-7 px-3 rounded-pill border border-border bg-surface-card text-12 text-subtle hover:border-foreground hover:text-foreground transition-colors"
                    >
                      {countryDisplayName(c.code)}
                      <span className="text-faint tabular-nums">
                        {c.count.toLocaleString()}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* ── 最新收录 ───────────────────────────────────────── */}
            {data.latest.length > 0 && (
              <section className="space-y-3">
                <h2 className="font-display font-bold text-16 text-foreground">
                  最新收录
                </h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {data.latest.map((item) => (
                    <HubJournalCard key={item.journal_id} item={item} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default JournalHubBrowsePage;
