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
        ]}
      />
      <DetailSection
        title="访问趋势 · 按天聚合"
        description="PV 与 Session 使用同一时间窗口。"
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_14rem]">
          <DetailBars
            bars={[
              {
                label: "8 月 8 日",
                value: "PV 2,804 · Session 1,162",
                width: "three-fifths",
                tone: "blue",
              },
              {
                label: "8 月 9 日",
                value: "PV 3,218 · Session 1,284",
                width: "two-thirds",
                tone: "blue",
              },
              {
                label: "8 月 10 日",
                value: "PV 3,046 · Session 1,226",
                width: "three-fifths",
                tone: "blue",
              },
              {
                label: "8 月 11 日",
                value: "PV 3,642 · Session 1,438",
                width: "four-fifths",
                tone: "green",
              },
              {
                label: "8 月 12 日",
                value: "PV 4,106 · Session 1,604",
                width: "full",
                tone: "green",
              },
            ]}
          />
          <div className="rounded-8 bg-surface-1 p-3 text-12 text-subtle">
            <p className="font-medium text-foreground">平均访问时长</p>
            <p className="mt-2 text-20 tabular-nums">4m 28s</p>
            <p className="mt-1 text-faint">较上期 +18s</p>
          </div>
        </div>
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
      <div className="grid gap-4 lg:grid-cols-[1.4fr_.6fr]">
        <DetailSection title="每日使用趋势">
          <DetailBars
            bars={[
              {
                label: "8 月 8 日",
                value: "6,842",
                width: "two-thirds",
                tone: "blue",
              },
              {
                label: "8 月 9 日",
                value: "7,106",
                width: "three-fourths",
                tone: "blue",
              },
              {
                label: "8 月 10 日",
                value: "6,920",
                width: "two-thirds",
                tone: "blue",
              },
              {
                label: "8 月 11 日",
                value: "7,426",
                width: "four-fifths",
                tone: "green",
              },
              {
                label: "8 月 12 日",
                value: "7,842",
                width: "full",
                tone: "green",
              },
            ]}
          />
        </DetailSection>
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
      <div className="grid gap-2 rounded-8 border border-border bg-surface-card p-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          "最近 30 天",
          "全部功能",
          "全部模型",
          "全部提供方",
          "用户 ID / 邮箱",
        ].map((filter) => (
          <div
            key={filter}
            className="rounded-8 border border-border bg-surface-1 px-3 py-2 text-12 text-subtle"
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
      <DetailSection
        title="每日算力点"
        description="柱长表示统一算力点，不直接等同于 Token 数。"
      >
        <DetailBars
          bars={[
            {
              label: "8 月 8 日",
              value: "3,842.4 点",
              width: "half",
              tone: "red",
            },
            {
              label: "8 月 9 日",
              value: "4,920.8 点",
              width: "three-fifths",
              tone: "red",
            },
            {
              label: "8 月 10 日",
              value: "5,216.1 点",
              width: "two-thirds",
              tone: "red",
            },
            {
              label: "8 月 11 日",
              value: "6,482.6 点",
              width: "four-fifths",
              tone: "red",
            },
            {
              label: "8 月 12 日",
              value: "7,810.3 点",
              width: "full",
              tone: "red",
            },
          ]}
        />
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
        columns={["用户 / 功能", "模型", "Tokens", "算力点 / 状态"]}
        rows={[
          {
            id: "log-1",
            cells: [
              <span key="u">
                <strong className="font-medium text-foreground">
                  林晓舟 #28461
                </strong>
                <br />
                智能搜索 · 今天 10:24
              </span>,
              "glm-4.5 · 智谱",
              "18,420 → 2,106",
              <span key="c" className="flex flex-col gap-1">
                <span>1.8426</span>
                <DetailBadge tone="green">成功</DetailBadge>
              </span>,
            ],
          },
          {
            id: "log-2",
            cells: [
              <span key="u">
                <strong className="font-medium text-foreground">
                  周奕辰 #28177
                </strong>
                <br />
                论文对话 · 今天 10:18
              </span>,
              "claude-sonnet-4 · Anthropic",
              "12,860 → 1,842",
              <span key="c" className="flex flex-col gap-1">
                <span>2.1840</span>
                <DetailBadge tone="green">成功</DetailBadge>
              </span>,
            ],
          },
          {
            id: "log-3",
            cells: [
              <span key="u">
                <strong className="font-medium text-foreground">
                  吴谨言 #27602
                </strong>
                <br />
                智能审稿 · 今天 09:52
              </span>,
              "deepseek-v3.2 · DeepSeek",
              "8,420 → 0",
              <span key="c" className="flex flex-col gap-1">
                <span>0.6315</span>
                <DetailBadge tone="red">失败</DetailBadge>
              </span>,
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
