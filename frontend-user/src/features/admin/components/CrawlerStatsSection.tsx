import { useState } from 'react';
import { AlertTriangle, Activity, Bot, Link2 } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { compactAxis } from '@/shared/lib/chart-format';
import { chartTheme } from '@/shared/lib/theme-bridge';
import { toApiError } from '@/shared/lib/http';
import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { useCrawlerStats, type CrawlerRange } from '../api/analytics';

/**
 * CrawlerStatsSection —— 「搜索引擎抓取」面板(数据统计页内嵌 section)。
 *
 * 数据源:backend /admin/analytics/crawler(crawlerwatch 写入的独立 umami 站点,
 * 服务端 UA 识别 —— 爬虫不执行 JS,上方真人访问统计天生看不见它们)。
 * 未配置(UMAMI_CRAWLER_WEBSITE_ID 空)时后端返 configured:false,渲染配置引导卡。
 */

const RANGES: Array<{ key: CrawlerRange; label: string }> = [
  { key: '24h', label: '24小时' },
  { key: '7d', label: '近7天' },
  { key: '30d', label: '近30天' },
];

/** 引擎 key → 展示名(mirrors backend/internal/crawlerwatch/classify.go uaRules) */
const ENGINE_LABELS: Record<string, string> = {
  google: 'Google',
  bing: 'Bing',
  baidu: '百度',
  yandex: 'Yandex',
  sogou: '搜狗',
  so360: '360 搜索',
  bytedance: '字节跳动 (Bytespider)',
  duckduckgo: 'DuckDuckGo',
  apple: 'Apple',
  naver: 'Naver',
  seznam: 'Seznam',
  'ai-openai': 'OpenAI (GPTBot)',
  'ai-openai-search': 'OpenAI Search',
  'ai-openai-user': 'ChatGPT-User',
  'ai-anthropic': 'Anthropic (ClaudeBot)',
  'ai-anthropic-search': 'Claude Search/User',
  'ai-perplexity': 'Perplexity',
  'ai-meta': 'Meta',
  'ai-amazon': 'Amazon',
  'ai-ccbot': 'Common Crawl (CCBot)',
  'other-bot': '其他爬虫',
};

const isAIEngine = (key: string) => key.startsWith('ai-');

export function CrawlerStatsSection() {
  const [range, setRange] = useState<CrawlerRange>('7d');
  const q = useCrawlerStats(range);
  const configured = q.data?.configured === true;

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h2 className="flex items-center gap-2 text-16 font-medium text-foreground">
            <Bot className="size-4 text-faint" />
            搜索引擎抓取
          </h2>
          <p className="text-12 text-faint mt-1">
            服务端识别爬虫 UA 写入独立 umami 站点 —— 爬虫不执行 JS,上方真人访问统计看不见它们
          </p>
        </div>
        {configured && (
          <div className="flex flex-wrap items-center gap-2">
            {q.data?.status_hint && <StatusHints hint={q.data.status_hint} />}
            <div className="flex items-center gap-2">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setRange(r.key)}
                  className={cn(
                    'h-7 rounded-8 px-3 text-12 font-medium transition-colors',
                    range === r.key
                      ? 'bg-brand-red text-on-brand'
                      : 'bg-surface-2 text-subtle hover:bg-surface-1',
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {q.isLoading ? (
        <Skeleton className="h-48 w-full rounded-16" />
      ) : q.isError ? (
        <Panel icon={AlertTriangle} title="搜索引擎抓取">
          <div className="flex flex-col items-center gap-2 py-6 text-center text-12">
            <span className="flex items-center gap-2 font-medium text-brand-red">
              <AlertTriangle className="size-4" />
              加载失败
            </span>
            <span className="text-muted-foreground">{toApiError(q.error).message}</span>
            <Button size="sm" variant="outline" onClick={() => q.refetch()}>
              重试
            </Button>
          </div>
        </Panel>
      ) : !configured ? (
        <SetupGuideCard />
      ) : (
        <>
          <Panel
            icon={Activity}
            title={`抓取量趋势 · 按${q.data?.unit === 'hour' ? '小时' : '天'}聚合`}
          >
            {q.data?.series && q.data.series.some((p) => p.count > 0) ? (
              <CrawlerTrend series={q.data.series} />
            ) : (
              <Empty hint="窗口内没有爬虫命中 —— 新站点被搜索引擎发现需要时间,可先确认 robots.txt / sitemap 可达" />
            )}
          </Panel>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
            <Panel icon={Bot} title="引擎抓取量排行">
              {q.data?.engines?.length ? (
                <EngineRanking engines={q.data.engines} />
              ) : (
                <Empty hint="窗口内没有爬虫命中" />
              )}
            </Panel>
            <Panel icon={Link2} title="被抓取页面 TOP 30">
              {q.data?.top_pages?.length ? (
                <TopPagesTable pages={q.data.top_pages} />
              ) : (
                <Empty hint="窗口内没有页面被抓取记录" />
              )}
            </Panel>
          </div>
        </>
      )}
    </section>
  );
}

// ----------------- 子组件 -----------------

/** 与 AnalyticsPage 的 Panel 同款式(那边是页面私有,这里保持视觉一致的最小复刻)。 */
function Panel({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Bot;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-16 border border-border bg-surface-card p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-14 font-medium text-foreground">{title}</h3>
        <Icon className="size-3.5 text-faint" />
      </div>
      <div className="min-h-32">{children}</div>
    </div>
  );
}

function Empty({ hint }: { hint: string }) {
  return <div className="text-12 text-faint text-center py-6">{hint}</div>;
}

/** 429/5xx 提示 —— 429 是抓取配额风险信号(Google 会把持续限流记为站点降速)。 */
function StatusHints({ hint }: { hint: { '429': number; '5xx': number } }) {
  return (
    <div className="flex items-center gap-2 text-12">
      <span
        className={cn(
          'rounded-8 px-2 py-1 tabular-nums',
          hint['429'] > 0 ? 'bg-brand-amber-soft text-brand-amber' : 'bg-surface-2 text-faint',
        )}
        title="窗口内爬虫收到 429(限流)的次数 —— 持续 429 会被 Google 记成站点限流,压低抓取配额"
      >
        429 限流 {hint['429'].toLocaleString()}
      </span>
      <span
        className={cn(
          'rounded-8 px-2 py-1 tabular-nums',
          hint['5xx'] > 0 ? 'bg-brand-red-soft text-brand-red' : 'bg-surface-2 text-faint',
        )}
        title="窗口内爬虫收到 5xx(服务端错误)的次数"
      >
        5xx 错误 {hint['5xx'].toLocaleString()}
      </span>
    </div>
  );
}

/** 未配置引导卡 —— 步骤与 backend UMAMI_CRAWLER_WEBSITE_ID 的语义一一对应。 */
function SetupGuideCard() {
  const steps: React.ReactNode[] = [
    <>
      打开 umami 后台,新建一个<strong className="font-medium">独立</strong>的
      website(如「爬虫监控」)—— 不要复用现有用户统计站点,否则爬虫事件会污染真人 PV/UV
    </>,
    <>复制新站点的 Website ID</>,
    <>
      在 <Code>.env</Code> 写入 <Code>UMAMI_CRAWLER_WEBSITE_ID=&lt;Website ID&gt;</Code>
      (umami 不在内网默认地址时另配 <Code>UMAMI_CRAWLER_BASE_URL</Code>)
    </>,
    <>
      <Code>docker-compose restart backend</Code> —— 重启后爬虫命中开始写入,本面板自动出数
    </>,
  ];
  return (
    <div className="rounded-16 border border-border bg-surface-card p-6">
      <div className="flex items-center gap-2 mb-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-pill bg-surface-2 text-faint">
          <Bot className="size-5" />
        </span>
        <div>
          <h3 className="text-14 font-medium text-foreground">爬虫监控尚未配置</h3>
          <p className="text-12 text-muted-foreground">
            配一个独立的 umami 站点即可看到各搜索引擎 / AI 爬虫的抓取量、时段分布与被抓页面
          </p>
        </div>
      </div>
      <ol className="mt-3 space-y-2">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-2 text-12 text-subtle">
            <Badge variant="muted" className="text-12 px-2 h-4 shrink-0 mt-px tabular-nums">
              {i + 1}
            </Badge>
            <span className="min-w-0">{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="px-1 rounded-4 bg-surface-2 break-all">{children}</code>;
}

/** 桶 key → 轴/Tooltip 展示。hour 桶 "2006-01-02 15:04" → "MM/DD HH:mm",day 桶 → "MM/DD"。 */
function fmtBucket(t: string): string {
  if (!t) return '';
  const md = t.slice(5, 10).replace('-', '/');
  return t.length >= 16 ? `${md} ${t.slice(11, 16)}` : md;
}

/** 抓取量单折线 —— 琥珀(与真人流量的松青/朱砂区分开);单序列不设图例,标题即身份。 */
function CrawlerTrend({ series }: { series: Array<{ t: string; count: number }> }) {
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="crawlerGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-brand-amber)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--color-brand-amber)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} vertical={false} />
          <XAxis
            dataKey="t"
            tickFormatter={fmtBucket}
            tick={{ fontSize: chartTheme.fontSize, fill: chartTheme.axis }}
            tickLine={false}
            axisLine={{ stroke: chartTheme.grid }}
            minTickGap={24}
          />
          <YAxis
            allowDecimals={false}
            tickFormatter={compactAxis}
            tick={{ fontSize: chartTheme.fontSize, fill: chartTheme.axis }}
            tickLine={false}
            axisLine={false}
            width={38}
          />
          <Tooltip content={<TrendTooltip />} />
          <Area
            type="monotone"
            dataKey="count"
            stroke="var(--color-brand-amber)"
            strokeWidth={2}
            fill="url(#crawlerGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function TrendTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: { t: string; count: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div style={chartTheme.tooltip}>
      <div
        style={{
          color: 'var(--color-muted-foreground)',
          fontSize: chartTheme.fontSize,
          marginBottom: 2,
        }}
      >
        {fmtBucket(row.t)}
      </div>
      <div style={{ color: 'var(--color-foreground)' }}>抓取 {row.count.toLocaleString()}</div>
    </div>
  );
}

/**
 * 引擎排行 —— 横向条 + 数值,配色按引擎「类别」固定(搜索引擎=松青 / AI=琥珀),
 * 不随名次变;占比相对本列表最高值。
 */
function EngineRanking({ engines }: { engines: Array<{ engine: string; count: number }> }) {
  const max = engines.reduce((m, e) => Math.max(m, e.count), 0);
  return (
    <ul className="space-y-2">
      {engines.map((e, i) => {
        const pct = max > 0 ? (e.count / max) * 100 : 0;
        const ai = isAIEngine(e.engine);
        return (
          <li key={e.engine} className="relative">
            <div className="absolute inset-0 -m-px rounded-4 bg-surface-2 overflow-hidden">
              <div
                className="h-full"
                style={{
                  width: `${pct}%`,
                  backgroundColor: ai
                    ? 'color-mix(in srgb, var(--color-brand-amber) 16%, transparent)'
                    : 'color-mix(in srgb, var(--color-brand-green) 14%, transparent)',
                }}
              />
            </div>
            <div className="relative flex items-center justify-between gap-2 px-2 py-1 text-foreground">
              <div className="flex items-center gap-2 min-w-0">
                <Badge variant="muted" className="text-12 px-2 h-4 shrink-0 tabular-nums">
                  {i + 1}
                </Badge>
                <span className="text-12 truncate" title={e.engine}>
                  {ENGINE_LABELS[e.engine] ?? e.engine}
                </span>
                {ai && (
                  <span className="text-12 text-brand-amber shrink-0" title="AI 爬虫(训练语料 / AI 搜索)">
                    AI
                  </span>
                )}
              </div>
              <span className="text-12 tabular-nums shrink-0">{e.count.toLocaleString()}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** 被抓取页面 TOP 30 —— 路径 + 次数,超出可视高度内部滚动。 */
function TopPagesTable({ pages }: { pages: Array<{ url: string; count: number }> }) {
  return (
    <ol className="max-h-96 space-y-1 overflow-y-auto">
      {pages.map((p, i) => (
        <li
          key={`${p.url}-${i}`}
          className="flex items-center justify-between gap-2 rounded-4 px-2 py-1 hover:bg-surface-2"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Badge variant="muted" className="text-12 px-2 h-4 shrink-0 tabular-nums">
              {i + 1}
            </Badge>
            <code className="text-12 truncate" title={p.url}>
              {p.url || '/'}
            </code>
          </div>
          <span className="text-12 tabular-nums shrink-0">{p.count.toLocaleString()}</span>
        </li>
      ))}
    </ol>
  );
}
