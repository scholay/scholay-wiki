import {
  BarChart3,
  ChartColumnIncreasing,
  Coins,
  MousePointerClick,
} from "lucide-react";
import {
  AdminDetailFrame,
  DetailBadge,
  DetailBars,
  DetailMetricStrip,
  DetailNotice,
  DetailSection,
  DetailTable,
  DetailTabs,
} from "./WikiEmbedAdminDetailPrimitives";

function AnalyticsAreaChart({ dual = false }: { dual?: boolean }) {
  return (
    <div>
      <svg
        className="h-48 w-full"
        viewBox="0 0 720 192"
        preserveAspectRatio="none"
        role="img"
        aria-label="冻结的面积趋势图"
      >
        {[38, 76, 114, 152].map((y) => (
          <line
            key={y}
            x1="0"
            x2="720"
            y1={y}
            y2={y}
            stroke="var(--color-border)"
            strokeDasharray="3 3"
          />
        ))}
        <path
          d="M0 158 L72 144 L144 149 L216 119 L288 128 L360 94 L432 102 L504 62 L576 76 L648 42 L720 55 L720 192 L0 192 Z"
          fill="var(--color-brand-green)"
          opacity="0.12"
        />
        <polyline
          points="0,158 72,144 144,149 216,119 288,128 360,94 432,102 504,62 576,76 648,42 720,55"
          fill="none"
          stroke="var(--color-brand-green)"
          strokeWidth="3"
        />
        {dual ? (
          <polyline
            points="0,171 72,162 144,164 216,146 288,151 360,128 432,133 504,105 576,116 648,88 720,96"
            fill="none"
            stroke="var(--color-cat-blue)"
            strokeWidth="3"
          />
        ) : null}
      </svg>
      <div className="mt-2 flex items-center justify-center gap-4 text-12 text-faint">
        <span>
          <span className="mr-1 inline-block size-2 bg-brand-green" />
          {dual ? "PV" : "使用次数"}
        </span>
        {dual ? (
          <span>
            <span className="mr-1 inline-block size-2 bg-cat-blue" />
            会话
          </span>
        ) : null}
        <span>— — 今日（进行中）</span>
      </div>
    </div>
  );
}

function AnalyticsStackedBars() {
  return (
    <div>
      <div className="flex h-48 items-end gap-3 border-b border-border px-3 pt-4">
        {[44, 58, 52, 72, 64, 86, 76, 94, 82, 100].map((height, index) => (
          <div
            key={index}
            className="flex flex-1 flex-col justify-end"
            style={{ height: `${height}%` }}
          >
            <span className="block bg-brand-amber" style={{ height: "24%" }} />
            <span className="block bg-cat-blue" style={{ height: "31%" }} />
            <span className="block flex-1 bg-brand-green" />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-center gap-4 text-12 text-faint">
        <span>
          <span className="mr-1 inline-block size-2 bg-brand-green" />
          输入
        </span>
        <span>
          <span className="mr-1 inline-block size-2 bg-cat-blue" />
          输出
        </span>
        <span>
          <span className="mr-1 inline-block size-2 bg-brand-amber" />
          缓存
        </span>
      </div>
    </div>
  );
}

/** AnalyticsPage：Umami 的 KPI 和访问趋势。 */
export function WikiEmbedAdminSiteAnalyticsTrend() {
  return (
    <AdminDetailFrame
      fixture="admin-site-analytics-trend"
      icon={BarChart3}
      title="站点访问趋势"
      description="Umami 自托管统计，日期区间同时约束 KPI、趋势和各类 TOP 维度。"
      eyebrow="数据统计"
      action="最近 30 天"
    >
      <DetailMetricStrip
        metrics={[
          {
            label: "独立访客",
            value: "24,680",
            note: "较上期 +8.2%",
            tone: "green",
          },
          { label: "会话数", value: "36,420", note: "1.48 次 / 访客" },
          { label: "访问页数", value: "92,806", note: "2.55 页 / 会话" },
          {
            label: "跳出率",
            value: "42.8%",
            note: "较上期 −1.4%",
            tone: "blue",
          },
          { label: "平均访问时长", value: "4m 28s", note: "会话口径" },
          {
            label: "实时访客",
            value: "186",
            note: "最近 5 分钟",
            tone: "green",
          },
        ]}
      />
      <DetailSection
        title="访问趋势 · 按天聚合"
        description="PV 与 Session 使用同一时间窗口。"
      >
        <AnalyticsAreaChart dual />
      </DetailSection>
    </AdminDetailFrame>
  );
}

/** AnalyticsPage：TOP 页面、来源、国家和设备维度。 */
export function WikiEmbedAdminSiteAnalyticsDimensions() {
  return (
    <AdminDetailFrame
      fixture="admin-site-analytics-dimensions"
      icon={ChartColumnIncreasing}
      title="访问维度排行"
      description="页面、来源、国家、浏览器、操作系统和设备六个维度独立排行。"
      eyebrow="数据统计"
    >
      <div className="grid gap-3 lg:grid-cols-2">
        {[
          [
            "TOP 页面",
            [
              ["/search", "18,420"],
              ["/chat", "12,860"],
              ["/peer-review", "8,106"],
            ],
          ],
          [
            "TOP 来源",
            [
              ["直接访问", "42%"],
              ["Google", "31%"],
              ["微信", "14%"],
            ],
          ],
          [
            "TOP 国家",
            [
              ["中国", "68%"],
              ["美国", "11%"],
              ["新加坡", "6%"],
            ],
          ],
          [
            "浏览器",
            [
              ["Chrome", "62%"],
              ["Safari", "24%"],
              ["Edge", "9%"],
            ],
          ],
          [
            "操作系统",
            [
              ["Windows", "44%"],
              ["macOS", "27%"],
              ["iOS", "18%"],
            ],
          ],
          [
            "设备",
            [
              ["桌面端", "65%"],
              ["移动端", "32%"],
              ["平板", "3%"],
            ],
          ],
        ].map(([title, rows]) => (
          <DetailSection key={title as string} title={title as string}>
            <div className="space-y-2">
              {(rows as string[][]).map(([label, value], index) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-3 rounded-8 bg-surface-1 px-3 py-2 text-12"
                >
                  <span className="min-w-0 truncate text-subtle">
                    {index + 1}. {label}
                  </span>
                  <span className="shrink-0 tabular-nums text-faint">
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </DetailSection>
        ))}
      </div>
      <DetailNotice>
        Umami WEBSITE_ID
        未配置时应显示明确的配置提示，而不是用零值替代真实统计。
      </DetailNotice>
    </AdminDetailFrame>
  );
}

/** UsageStatsPage：每日功能事件趋势。 */
export function WikiEmbedAdminFeatureUsageTrend() {
  return (
    <AdminDetailFrame
      fixture="admin-feature-usage-trend"
      icon={MousePointerClick}
      title="功能使用趋势"
      description="总事件、登录用户和匿名访客分别计数，日期趋势使用功能事件口径。"
      eyebrow="使用统计"
    >
      <DetailMetricStrip
        metrics={[
          { label: "总使用次数", value: "186,420", note: "当前区间" },
          {
            label: "今日使用",
            value: "7,842",
            note: "截至 11:20",
            tone: "green",
          },
          { label: "活跃用户（登录）", value: "12,804", note: "去重用户" },
          {
            label: "独立匿名访客",
            value: "4,126",
            note: "去重访客",
            tone: "blue",
          },
        ]}
      />
      <DetailSection title="每日使用趋势">
        <AnalyticsAreaChart />
      </DetailSection>
      <div className="grid gap-6 lg:grid-cols-2">
        <DetailSection title="功能使用排行">
          <DetailTable
            columns={["功能", "次数"]}
            rows={[
              { id: "feature-search", cells: ["智能搜索", "48,260"] },
              { id: "feature-pdf", cells: ["论文对话", "36,842"] },
              { id: "feature-review", cells: ["智能审稿", "18,406"] },
            ]}
          />
        </DetailSection>
        <DetailSection title="智能审稿漏斗">
          <DetailBars
            bars={[
              {
                label: "开始投稿",
                value: "2,486",
                width: "full",
                tone: "green",
              },
              {
                label: "上传稿件",
                value: "2,164",
                width: "five-sixths",
                tone: "green",
              },
              {
                label: "提交评审",
                value: "1,906",
                width: "three-fourths",
                tone: "green",
              },
              {
                label: "完成评审",
                value: "1,742",
                width: "two-thirds",
                tone: "green",
              },
            ]}
          />
        </DetailSection>
      </div>
    </AdminDetailFrame>
  );
}

/** TokenUsageFilterBar + TokenDailyChart：算力过滤器与日趋势。 */
export function WikiEmbedAdminTokenUsageFiltersChart() {
  return (
    <AdminDetailFrame
      fixture="admin-token-usage-filters-chart"
      icon={Coins}
      title="算力过滤与日趋势"
      description="当前 Scholar 用算力点作为主口径，同时保留调用次数与底层 Token 作为诊断信息。"
      eyebrow="算力用量统计"
      action="导出"
    >
      <div className="flex flex-wrap items-end gap-3 rounded-16 border border-border-soft bg-surface-1 p-3">
        <div>
          <p className="mb-1 text-12 text-faint">时间范围</p>
          <DetailTabs
            tabs={["今天", "7 天", "30 天", "90 天"]}
            active="30 天"
          />
        </div>
        {[
          "功能 · 全部",
          "来源 · 全部",
          "模型 · 全部",
          "Provider · 全部",
          "用户 ID / 邮箱",
        ].map((filter) => (
          <div
            key={filter}
            className="h-8 rounded-8 border border-border bg-background px-3 py-2 text-12 text-subtle"
          >
            {filter}
          </div>
        ))}
      </div>
      <DetailMetricStrip
        metrics={[
          {
            label: "总算力点",
            value: "126,842.6",
            note: "精确到账",
            tone: "red",
          },
          { label: "调用次数", value: "286,420", note: "包含重试" },
          { label: "总 Tokens", value: "1.84B", note: "输入 + 输出" },
          { label: "独立用户", value: "18,206", note: "当前区间" },
        ]}
      />
      <DetailSection title="每日用量" description="单位算力点 · 当前按模型堆叠">
        <div className="mb-2 flex justify-end">
          <DetailTabs
            tabs={["按模型", "按功能", "调用次数", "Token 构成"]}
            active="Token 构成"
          />
        </div>
        <AnalyticsStackedBars />
      </DetailSection>
    </AdminDetailFrame>
  );
}

/** TokenDimensionPanel：按功能、模型、提供方和用户拆分算力。 */
export function WikiEmbedAdminTokenUsageDimensions() {
  return (
    <AdminDetailFrame
      fixture="admin-token-usage-dimensions"
      icon={ChartColumnIncreasing}
      title="算力维度拆分"
      description="同一筛选区间可在功能、模型、提供方和用户四个维度间切换。"
      eyebrow="算力用量统计"
    >
      <DetailTabs
        tabs={["按功能", "按模型", "按提供方", "按用户"]}
        active="按功能"
      />
      <div className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
        <DetailSection title="功能算力排行">
          <DetailBars
            bars={[
              {
                label: "智能搜索",
                value: "48,216.4 点",
                width: "full",
                tone: "red",
              },
              {
                label: "论文对话",
                value: "31,842.7 点",
                width: "two-thirds",
                tone: "amber",
              },
              {
                label: "智能审稿",
                value: "22,406.1 点",
                width: "half",
                tone: "blue",
              },
              {
                label: "Prism 写作",
                value: "14,218.3 点",
                width: "third",
                tone: "green",
              },
            ]}
          />
        </DetailSection>
        <DetailSection title="维度摘要">
          <DetailTable
            columns={["功能", "调用", "均点"]}
            rows={[
              { id: "dim-search", cells: ["智能搜索", "86,420", "0.558"] },
              { id: "dim-pdf", cells: ["论文对话", "61,842", "0.515"] },
              { id: "dim-review", cells: ["智能审稿", "18,406", "1.217"] },
            ]}
          />
        </DetailSection>
      </div>
    </AdminDetailFrame>
  );
}

/** TokenUsageLogTable：单次调用的明细日志。 */
export function WikiEmbedAdminTokenUsageLogs() {
  return (
    <AdminDetailFrame
      fixture="admin-token-usage-logs"
      icon={Coins}
      title="算力调用日志"
      description="调用日志用于追溯扣点；展示模型、Token、算力点、时延和结果。"
      eyebrow="算力用量统计"
    >
      <DetailTable
        columns={[
          "时间",
          "用户",
          "功能 / 来源",
          "模型 / Provider",
          "算力点",
          "输入 / 输出",
          "状态",
        ]}
        columnsTemplate=".9fr 1.1fr 1fr 1.4fr .7fr 1fr .6fr"
        rows={[
          {
            id: "log-1",
            cells: [
              "今天 10:24",
              "林晓舟 · ID 28461",
              "智能搜索 · house",
              "glm-4.5 · 智谱",
              "1.8426",
              "18,420 / 2,106",
              <DetailBadge key="s" tone="green">
                成功
              </DetailBadge>,
            ],
          },
          {
            id: "log-2",
            cells: [
              "今天 10:18",
              "周奕辰 · ID 28177",
              "论文对话 · web",
              "claude-sonnet-4 · Anthropic",
              "2.1840",
              "12,860 / 1,842",
              <DetailBadge key="s" tone="green">
                成功
              </DetailBadge>,
            ],
          },
          {
            id: "log-3",
            cells: [
              "今天 09:52",
              "吴谨言 · ID 27602",
              "智能审稿 · agent",
              "deepseek-v3.2 · DeepSeek",
              "0.6315",
              "8,420 / 0",
              <DetailBadge key="s" tone="red">
                失败
              </DetailBadge>,
            ],
          },
        ]}
      />
      <DetailNotice>
        失败请求是否扣点以服务端落账记录为准；前端不会从 Token 数自行推算余额。
      </DetailNotice>
    </AdminDetailFrame>
  );
}
