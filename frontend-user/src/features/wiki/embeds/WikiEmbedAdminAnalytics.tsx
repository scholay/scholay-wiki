import type { ReactNode } from "react";
import {
  Activity,
  BarChart2,
  BarChart3,
  Coins,
  Database,
  Download,
  Eye,
  Globe2,
  Link2,
  MonitorSmartphone,
  Smartphone,
  TrendingUp,
  Users,
  UserX,
} from "lucide-react";
import {
  AdminMockBadge,
  AdminMockButton,
  AdminMockPage,
  AdminMockTabs,
} from "./WikiEmbedAdminShared";

/** Umami 访问概览、趋势与爬虫维度 · 纯样式 fixture。 */
export function WikiEmbedAdminSiteAnalytics() {
  return (
    <AdminMockPage
      fixture="admin-site-analytics"
      title="数据统计"
      description="Umami 自托管 · 后端拉取数据，本页直接渲染图表（不再 iframe）"
      actions={
        <div className="inline-flex h-8 rounded-8 border border-border bg-background p-1">
          {["7 天", "30 天", "90 天", "自定义"].map((label) => (
            <span
              key={label}
              className={`inline-flex h-6 items-center rounded-4 px-3 text-14 ${label === "30 天" ? "bg-foreground text-on-dark" : "text-muted-foreground"}`}
            >
              {label}
            </span>
          ))}
        </div>
      }
    >
      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {[
          {
            label: "独立访客",
            value: "82,640",
            note: "↑ 12.0% vs 上周期",
            Icon: Users,
          },
          {
            label: "会话数",
            value: "106,420",
            note: "↑ 8.4% vs 上周期",
            Icon: Activity,
          },
          {
            label: "访问页数",
            value: "284,160",
            note: "↑ 15.2% vs 上周期",
            Icon: Eye,
          },
          {
            label: "跳出率",
            value: "38.4%",
            note: "窗口聚合",
            Icon: BarChart3,
          },
          {
            label: "篇均时长",
            value: "3m 42s",
            note: "每次会话",
            Icon: Activity,
          },
          {
            label: "实时在线",
            value: "326",
            note: "30s 刷新",
            Icon: Globe2,
            realtime: true,
          },
        ].map(({ label, value, note, Icon, realtime }) => (
          <section
            key={label}
            className={`relative rounded-8 border bg-background p-3 ${realtime ? "border-brand-green" : "border-border"}`}
          >
            {realtime ? (
              <span className="absolute right-2 top-2 size-2 rounded-pill bg-brand-green" />
            ) : null}
            <div className="flex items-center justify-between text-12 text-faint">
              <span>{label}</span>
              <Icon className="size-3 text-faint" />
            </div>
            <p
              className={`mt-2 text-24 font-medium tabular-nums ${realtime ? "text-brand-green" : "text-foreground"}`}
            >
              {value}
            </p>
            <p className="mt-1 text-12 text-faint">{note}</p>
          </section>
        ))}
      </section>

      <section className="mb-6 rounded-8 border border-border bg-background p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-16 font-medium text-foreground">
            访问趋势 · 按天聚合
          </h3>
          <BarChart3 className="size-4 text-faint" />
        </div>
        <div className="mt-1 text-right text-12 text-faint">
          — — 今日（进行中，非最终值）
        </div>
        <svg
          viewBox="0 0 760 180"
          className="h-48 w-full"
          preserveAspectRatio="none"
        >
          {[30, 75, 120, 165].map((y) => (
            <line
              key={y}
              x1="0"
              y1={y}
              x2="760"
              y2={y}
              stroke="var(--border)"
              strokeDasharray="3 3"
            />
          ))}
          <polygon
            points="0,145 70,130 140,136 210,103 280,112 350,72 420,88 490,52 560,61 630,28 700,43 760,21 760,180 0,180"
            fill="hsl(var(--brand-green))"
            fillOpacity="0.12"
          />
          <polyline
            points="0,145 70,130 140,136 210,103 280,112 350,72 420,88 490,52 560,61 630,28 700,43 760,21"
            fill="none"
            stroke="hsl(var(--brand-green))"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            points="0,160 70,146 140,150 210,126 280,132 350,98 420,109 490,79 560,86 630,58 700,67 760,48"
            fill="none"
            stroke="hsl(var(--brand-red))"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div className="flex justify-center gap-4 text-12 text-muted-foreground">
          <span className="flex items-center gap-2">
            <span className="size-2 bg-brand-green" />
            访问页
          </span>
          <span className="flex items-center gap-2">
            <span className="size-2 bg-brand-red" />
            会话
          </span>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        {[
          [
            "TOP 页面",
            Link2,
            [
              ["/search", "84,260", "100%"],
              ["/wiki", "61,420", "73%"],
              ["/journal", "38,860", "46%"],
            ],
          ],
          [
            "TOP 来源",
            Globe2,
            [
              ["直接访问", "42,180", "100%"],
              ["Google", "26,840", "64%"],
              ["Bing", "8,420", "20%"],
            ],
          ],
          [
            "TOP 国家",
            Globe2,
            [
              ["CN", "68,240", "100%"],
              ["US", "12,680", "19%"],
              ["SG", "6,420", "9%"],
            ],
          ],
          [
            "浏览器",
            MonitorSmartphone,
            [
              ["Chrome", "62,840", "100%"],
              ["Safari", "28,620", "46%"],
              ["Edge", "9,410", "15%"],
            ],
          ],
          [
            "操作系统",
            MonitorSmartphone,
            [
              ["macOS", "42,680", "100%"],
              ["Windows", "38,460", "90%"],
              ["iOS", "16,280", "38%"],
            ],
          ],
          [
            "设备",
            Smartphone,
            [
              ["desktop", "76,420", "100%"],
              ["mobile", "26,840", "35%"],
              ["tablet", "3,160", "4%"],
            ],
          ],
        ].map(([title, Icon, rows]) => {
          const MetricIcon = Icon as typeof Globe2;
          const metricRows = rows as string[][];
          return (
            <section
              key={title as string}
              className="rounded-8 border border-border bg-background p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-16 font-medium text-foreground">
                  {title as string}
                </h3>
                <MetricIcon className="size-4 text-faint" />
              </div>
              <div className="space-y-2">
                {metricRows.map(([label, value, width]) => (
                  <div
                    key={label}
                    className="relative flex h-7 items-center justify-between overflow-hidden rounded-4 bg-surface-1 px-2 text-14"
                  >
                    <span
                      className="absolute inset-y-0 left-0 bg-brand-green-soft"
                      style={{ width }}
                    />
                    <span className="relative text-foreground">{label}</span>
                    <span className="relative tabular-nums text-muted-foreground">
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </section>
      <div className="mt-4 rounded-8 border border-brand-amber/30 bg-brand-amber-soft px-3 py-2 text-14 leading-paragraph text-muted-foreground">
        访问分析是聚合视图；与用户、订单或模型账本的业务口径不可直接互换。
      </div>
    </AdminMockPage>
  );
}

/** 功能事件、趋势与智能审稿漏斗 · 纯样式 fixture。 */
export function WikiEmbedAdminFeatureUsage() {
  return (
    <AdminMockPage
      fixture="admin-feature-usage"
      title="使用统计"
      description="各功能使用量 / 趋势 / 智能审稿漏斗"
      actions={<DateRangePills />}
    >
      <section className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <AnalyticsKpi
          icon={<BarChart2 className="size-4" />}
          label="总使用次数"
          value="486,000"
        />
        <AnalyticsKpi
          icon={<TrendingUp className="size-4" />}
          label="今日使用"
          value="18,420"
        />
        <AnalyticsKpi
          icon={<Users className="size-4" />}
          label="活跃用户（登录）"
          value="12,680"
        />
        <AnalyticsKpi
          icon={<UserX className="size-4" />}
          label="独立匿名访客"
          value="3,842"
        />
      </section>

      <section className="mb-6 rounded-8 border border-border bg-background p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-16 font-medium text-foreground">每日使用趋势</h3>
          <span className="text-12 text-faint">— — 今日（进行中）</span>
        </div>
        <svg
          viewBox="0 0 760 170"
          className="h-48 w-full"
          preserveAspectRatio="none"
        >
          {[28, 72, 116, 160].map((y) => (
            <line
              key={y}
              x1="0"
              y1={y}
              x2="760"
              y2={y}
              stroke="var(--border)"
              strokeDasharray="3 3"
            />
          ))}
          <polygon
            points="0,146 70,132 140,136 210,108 280,119 350,82 420,94 490,61 560,70 630,36 700,49 760,27 760,170 0,170"
            fill="hsl(var(--brand-green))"
            fillOpacity="0.14"
          />
          <polyline
            points="0,146 70,132 140,136 210,108 280,119 350,82 420,94 490,61 560,70 630,36 700,49 760,27"
            fill="none"
            stroke="hsl(var(--brand-green))"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <AnalyticsPanel title="功能使用排行">
          <AnalyticsBars
            rows={[
              ["论文搜索", "168,000 次 · 用户 8,420 · 匿名 2,104", "100%"],
              ["智能搜索", "96,000 次 · 用户 4,286 · 匿名 836", "72%"],
              ["智能助手", "62,000 次 · 用户 3,840 · 匿名 0", "52%"],
              ["智能写作", "38,000 次 · 用户 2,416 · 匿名 0", "34%"],
            ]}
          />
        </AnalyticsPanel>
        <AnalyticsPanel
          title="智能审稿漏斗"
          description="按 submission 去重，同一次审稿的各步骤串联"
        >
          <AnalyticsBars
            rows={[
              ["审稿已提交", "1,842", "100%"],
              ["文件已解析", "1,726 · 93.7%", "94%"],
              ["报告已生成", "1,486 · 80.7%", "81%"],
              ["报告已下载", "1,128 · 61.2%", "61%"],
            ]}
          />
        </AnalyticsPanel>
      </section>
    </AdminMockPage>
  );
}

/** 算力点账本、Token 与模型成本维度 · 纯样式 fixture。 */
export function WikiEmbedAdminTokenCost() {
  return (
    <AdminMockPage
      fixture="admin-token-cost"
      title="算力用量统计"
      description="统一 LLM 账本 · 按各模型自己的单价精算 · 1 算力点 = ¥0.001，与用户额度同单位"
    >
      <section className="mb-4 flex flex-wrap items-end gap-3 rounded-8 border border-border-hairline bg-surface-1 p-3">
        <AnalyticsField label="时间范围" value="30 天" width="w-24" />
        <AnalyticsField
          label="自定义起止"
          value="2026-07-14 → 2026-08-12"
          width="w-52"
        />
        <AnalyticsField label="功能" value="全部" width="w-24" />
        <AnalyticsField label="来源" value="全部" width="w-24" />
        <AnalyticsField label="模型" value="全部模型" width="w-32" />
        <AnalyticsField label="Provider" value="全部" width="w-28" />
        <AnalyticsField
          label="用户"
          value="ID / 名称 / 邮箱"
          width="w-44"
          muted
        />
        <AdminMockButton tone="outline">重置</AdminMockButton>
      </section>

      <section className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          {
            label: "总算力点",
            value: "18.42M",
            note: "精确值 18,420,386.4 · ≈ ¥18,420.39",
          },
          { label: "调用次数", value: "486k", note: "公众号 / 匿名 12,840 次" },
          {
            label: "总 Tokens",
            value: "2.84B",
            note: "缓存 1.2B · 命中率 42.3%",
          },
          { label: "独立用户", value: "12,680", note: "匿名消耗 386k 算力点" },
        ].map((metric, index) => (
          <AnalyticsKpi
            key={metric.label}
            icon={
              index === 0 ? (
                <Coins className="size-4" />
              ) : index === 1 ? (
                <Activity className="size-4" />
              ) : index === 2 ? (
                <Database className="size-4" />
              ) : (
                <Users className="size-4" />
              )
            }
            {...metric}
          />
        ))}
      </section>

      <div className="mb-6 rounded-8 border border-brand-amber/30 bg-brand-amber-soft px-3 py-2 text-12 leading-paragraph text-muted-foreground">
        126 次调用未计价，共 8.4M tokens
        未折算成算力点，已从总算力点中排除；成本未知不等于免费。
      </div>

      <section className="mb-6 rounded-8 border border-border bg-background p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-16 font-medium text-foreground">每日用量</h3>
          <AdminMockTabs
            items={[
              "按模型（算力点）",
              "按功能（算力点）",
              "Token 构成",
              "调用次数",
            ]}
            active="按模型（算力点）"
          />
        </div>
        <div className="flex h-56 items-end gap-3 border-b border-border px-3 pb-2">
          {[42, 54, 38, 66, 72, 58, 81, 76, 92, 86, 100, 74].map(
            (height, index) => (
              <div
                key={index}
                className="flex min-w-0 flex-1 flex-col justify-end"
              >
                <span
                  className="bg-brand-green"
                  style={{ height: `${height * 0.62}%` }}
                />
                <span
                  className="bg-brand-amber"
                  style={{ height: `${height * 0.24}%` }}
                />
                <span
                  className="bg-brand-red"
                  style={{ height: `${height * 0.14}%` }}
                />
              </div>
            ),
          )}
        </div>
        <div className="mt-3 flex justify-center gap-4 text-12 text-faint">
          <span>■ deepseek-chat</span>
          <span>■ qwen-max</span>
          <span>■ 其他</span>
        </div>
      </section>

      <AnalyticsDimensionPanel
        tabs={["模型", "功能", "来源", "Provider", "Top 用户"]}
        rows={[
          ["deepseek-chat", "6.82M 算力点 · 184,200 次", "100%"],
          ["qwen-max", "4.26M 算力点 · 96,420 次", "74%"],
          ["kimi-k2", "2.94M 算力点 · 82,640 次", "52%"],
          ["glm-4.5", "1.72M 算力点 · 64,280 次", "34%"],
        ]}
      />

      <section className="mt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-16 font-medium text-foreground">
            调用明细{" "}
            <span className="text-12 font-normal text-faint">
              共 486,000 条
            </span>
          </h3>
          <div className="flex gap-2">
            <AdminMockTabs
              items={["按时间", "按算力点", "按 Tokens"]}
              active="按时间"
            />
            <AdminMockButton tone="outline">
              <Download className="size-4" /> 导出 CSV
            </AdminMockButton>
          </div>
        </div>
        <AnalyticsTable
          columns={[
            "时间",
            "用户",
            "功能",
            "来源",
            "模型",
            "Provider / 账号",
            "算力点",
            "Tokens",
          ]}
          template="150px 170px 90px 80px 150px 150px 100px 100px"
          minWidth={990}
          rows={[
            [
              "2026-08-12 10:24",
              "林晓舟 · ID 28461",
              <AdminMockBadge key="feature">智能助手</AdminMockBadge>,
              "project",
              "deepseek-chat",
              "DeepSeek / 主账号",
              "842.6",
              "128,420",
            ],
            [
              "2026-08-12 10:18",
              "周奕辰 · ID 28177",
              <AdminMockBadge key="feature">智能写作</AdminMockBadge>,
              "agent",
              "qwen-max",
              "DashScope / 写作",
              "526.4",
              "86,240",
            ],
            [
              "2026-08-12 10:03",
              "公众号 / 匿名",
              <AdminMockBadge key="feature">公众号</AdminMockBadge>,
              "wechat",
              "glm-4.5",
              "智谱 / 公众号",
              "—（未计价）",
              "12,680",
            ],
          ]}
        />
      </section>
    </AdminMockPage>
  );
}

/** 全局 AI 额度、会员倍率、套餐与经费换算 · 纯样式 fixture。 */
export function WikiEmbedAdminBillingConfiguration() {
  return (
    <AdminMockPage
      fixture="admin-billing-configuration"
      title="计费体系配置"
      description="统一算力点周期额度（7 天成本制）与经费钱包的动态旋钮，保存后最多 30 秒全量生效"
    >
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-4 rounded-16 border border-border bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-14 font-medium text-foreground">
                收费体系总开关
              </p>
              <p className="mt-1 text-12 text-faint">
                关闭后所有 AI 功能不限额（仅用于灰度 / 应急）
              </p>
            </div>
            <BillingSwitch />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-14 text-muted-foreground">
              「最受欢迎」标在
            </span>
            <AdminMockTabs items={["Pro", "Max", "不标"]} active="Pro" />
          </div>
        </section>

        <BillingGroup
          title="周期额度（算力点 · 7 天）"
          fields={[
            [
              "Free 周期基准（算力点 · 7 天）",
              "300",
              "1 算力点 = ¥0.001 真实成本",
            ],
            ["周期天数", "7", "改动只影响新开的窗口"],
            ["Pro 倍率（× Free）", "20", "≤ 0 表示不限"],
            ["Max 倍率（× Pro）", "5", "≤ 0 表示不限"],
          ]}
          footer="按当前取值派生 · 每 7 天　Free 300 算力点　Pro 6,000 算力点　Max 30,000 算力点"
        />
        <BillingGroup
          title="月度套餐 · 价格（分）"
          fields={[
            ["Pro 月价", "5900", "= ¥59.00"],
            ["Pro 原价（划线）", "7900", "= ¥79.00"],
            ["Max 月价", "26900", "= ¥269.00"],
            ["Max 原价（划线）", "32900", "= ¥329.00"],
          ]}
        />
        <BillingGroup
          title="年度套餐 · 价格（分）"
          fields={[
            ["Pro 年价", "59000", "= ¥590.00；0 表示隐藏年付入口"],
            ["Pro 年原价（划线）", "79000", "= ¥790.00"],
            ["Max 年价", "269000", "= ¥2,690.00；0 表示隐藏年付入口"],
            ["Max 年原价（划线）", "329000", "= ¥3,290.00"],
          ]}
        />
        <BillingGroup
          title="经费 / 按需付费"
          fields={[
            [
              "充值汇率",
              "1 元 = 100 经费",
              "经费 = 分；与兑换率共同决定按需付费单价",
            ],
            ["经费兑换率", "1 经费 = 3 算力点", "现网 ¥1 = 300 算力点"],
            ["起充金额（分）", "1000", "= ¥10.00"],
            [
              "经费→重置次数换算率（历史迁移用）",
              "60 经费 / 次 · 只读",
              "不参与运行时判定；随全列保存继续透传",
            ],
          ]}
        />

        <div className="flex items-center gap-3">
          <AdminMockButton>保存配置</AdminMockButton>
          <span className="text-12 leading-paragraph text-faint">
            订阅不再赠送经费；邀请奖励改在「活动管理」编辑，重置次数也不再直接扣经费。
          </span>
        </div>
      </div>
    </AdminMockPage>
  );
}

/** 后台统计数据源缺失时的明确配置空态 · 纯样式 fixture。 */
export function WikiEmbedAdminAnalyticsSetup() {
  return (
    <AdminMockPage
      fixture="admin-analytics-setup"
      title="数据统计"
      description="Umami 自托管分析（共用 scholar_mysql）"
    >
      <section className="flex min-h-80 items-center justify-center rounded-8 border border-dashed border-border bg-surface-1 px-6 py-12 text-center">
        <div className="max-w-xl">
          <span className="mx-auto flex size-12 items-center justify-center rounded-pill bg-surface-2 text-faint">
            <BarChart3 className="size-6" />
          </span>
          <h3 className="mt-4 text-20 font-medium text-foreground">
            Umami WEBSITE_ID 尚未配置
          </h3>
          <p className="mt-2 text-14 leading-paragraph text-muted-foreground">
            首次启动 Umami 后，用默认 admin / umami 登录并新建 Website；将
            Website ID 写入 UMAMI_WEBSITE_ID，再重启
            backend。完成连接后，本页会显示访问趋势与来源维度。
          </p>
        </div>
      </section>
    </AdminMockPage>
  );
}

function DateRangePills() {
  return (
    <AdminMockTabs
      items={["7 天", "30 天", "90 天", "自定义"]}
      active="30 天"
    />
  );
}

function AnalyticsKpi({
  icon,
  label,
  value,
  note,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <section className="rounded-8 border border-border bg-background p-4">
      <div className="flex items-center justify-between text-faint">
        <span className="text-14">{label}</span>
        {icon}
      </div>
      <p className="mt-2 text-28 font-medium tabular-nums text-foreground">
        {value}
      </p>
      {note ? (
        <p className="mt-1 text-12 leading-paragraph text-faint">{note}</p>
      ) : null}
    </section>
  );
}

function AnalyticsPanel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-8 border border-border bg-background p-4">
      <h3 className="text-16 font-medium text-foreground">{title}</h3>
      {description ? (
        <p className="mt-1 text-12 text-faint">{description}</p>
      ) : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function AnalyticsBars({
  rows,
}: {
  rows: readonly (readonly [string, string, string])[];
}) {
  return (
    <div className="flex flex-col gap-3">
      {rows.map(([label, detail, width]) => (
        <div key={label}>
          <div className="flex items-center justify-between gap-2 text-14">
            <span className="font-medium text-foreground">{label}</span>
            <span className="text-right tabular-nums text-faint">{detail}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-pill bg-surface-2">
            <div
              className="h-full rounded-pill bg-brand-green"
              style={{ width }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function AnalyticsField({
  label,
  value,
  width,
  muted = false,
}: {
  label: string;
  value: string;
  width: string;
  muted?: boolean;
}) {
  return (
    <div>
      <p className="mb-1 text-12 text-faint">{label}</p>
      <span
        className={`flex h-8 items-center rounded-8 border border-border bg-background px-3 text-14 ${muted ? "text-faint" : "text-foreground"} ${width}`}
      >
        {value}
      </span>
    </div>
  );
}

function AnalyticsDimensionPanel({
  tabs,
  rows,
}: {
  tabs: readonly string[];
  rows: readonly (readonly [string, string, string])[];
}) {
  return (
    <section className="mb-6 rounded-8 border border-border bg-background p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <AdminMockTabs items={tabs} active="模型" />
        <span className="text-12 text-faint">条长 = 算力点占比</span>
      </div>
      <AnalyticsBars rows={rows} />
    </section>
  );
}

function AnalyticsTable({
  columns,
  template,
  minWidth,
  rows,
}: {
  columns: readonly string[];
  template: string;
  minWidth: number;
  rows: readonly (readonly ReactNode[])[];
}) {
  return (
    <div className="overflow-x-auto rounded-8 border border-border bg-background">
      <div
        className="grid border-b border-border bg-surface-1 text-12 font-medium text-faint"
        style={{ gridTemplateColumns: template, minWidth }}
      >
        {columns.map((column) => (
          <span key={column} className="flex h-9 items-center px-3">
            {column}
          </span>
        ))}
      </div>
      {rows.map((row, rowIndex) => (
        <div
          key={rowIndex}
          className={`grid ${rowIndex < rows.length - 1 ? "border-b border-border-hairline" : ""}`}
          style={{ gridTemplateColumns: template, minWidth }}
        >
          {row.map((cell, cellIndex) => (
            <div
              key={cellIndex}
              className="flex min-h-12 min-w-0 items-center px-3 text-14 text-muted-foreground"
            >
              {cell}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function BillingSwitch() {
  return (
    <span className="relative inline-flex h-6 w-11 rounded-pill bg-brand-green">
      <span className="absolute right-1 top-1 size-4 rounded-pill bg-background" />
    </span>
  );
}

function BillingGroup({
  title,
  fields,
  footer,
}: {
  title: string;
  fields: readonly (readonly [string, string, string])[];
  footer?: string;
}) {
  return (
    <section className="rounded-16 border border-border bg-background p-4">
      <h3 className="mb-4 text-16 font-medium text-foreground">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map(([label, value, hint]) => (
          <div key={label}>
            <p className="mb-1 text-12 text-muted-foreground">{label}</p>
            <span
              className={`flex h-9 items-center rounded-8 border px-3 text-14 ${label.includes("历史迁移") ? "border-border-hairline bg-surface-2 text-faint" : "border-border bg-background text-foreground"}`}
            >
              {value}
            </span>
            <p className="mt-1 text-12 leading-paragraph text-faint">{hint}</p>
          </div>
        ))}
      </div>
      {footer ? (
        <p className="mt-4 rounded-8 border border-border-hairline bg-surface-1 px-3 py-2 text-12 text-muted-foreground">
          {footer}
        </p>
      ) : null}
    </section>
  );
}
