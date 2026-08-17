import {
  Activity,
  BarChart3,
  Bell,
  CheckCircle2,
  Coins,
  Gift,
  LayoutDashboard,
  LockKeyhole,
  MessageSquare,
  Shield,
  ShoppingCart,
  Users,
  Wallet,
} from "lucide-react";
import {
  ADMIN_MOCK_THEME,
  AdminMockPage,
  AdminPermissionNotice,
} from "./WikiEmbedAdminShared";

const ADMIN_NAV_GROUPS = [
  {
    label: "总览",
    items: [{ label: "看板", Icon: LayoutDashboard, active: true }],
  },
  {
    label: "运营管理",
    items: [
      { label: "用户管理", Icon: Users, active: false },
      { label: "站内消息", Icon: Bell, active: false },
      { label: "数据统计", Icon: BarChart3, active: false },
    ],
  },
] as const;

/** 管理后台单 SPA 外壳、导航分组与工作区 · 纯样式 fixture。 */
export function WikiEmbedAdminConsole() {
  return (
    <div
      className="w-full max-w-5xl overflow-hidden rounded-12 border border-border bg-background"
      style={ADMIN_MOCK_THEME}
      aria-hidden
      data-wiki-fixture="admin-console"
    >
      <div className="flex min-h-96">
        <aside className="hidden w-56 shrink-0 border-r border-border bg-background sm:block">
          <div className="flex h-12 items-center justify-between border-b border-border px-3">
            <span className="inline-flex size-8 items-center justify-center rounded-8 border border-border bg-background text-foreground">
              <Shield className="size-4" />
            </span>
            <span className="text-16 font-medium text-foreground">
              管理员后台
            </span>
            <span className="size-8" />
          </div>

          <nav className="space-y-4 p-3">
            {ADMIN_NAV_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="px-2 text-12 text-faint">{group.label}</p>
                <div className="mt-1 space-y-1">
                  {group.items.map(({ label, Icon, active }) => (
                    <div
                      key={label}
                      className={
                        active
                          ? "flex h-8 items-center gap-2 rounded-8 bg-brand-red-soft px-2 text-14 font-medium text-brand-red"
                          : "flex h-8 items-center gap-2 rounded-8 px-2 text-14 text-subtle"
                      }
                    >
                      <Icon className="size-3" />
                      {label}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="border-b border-border-hairline bg-background px-6 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-28 font-medium text-foreground">看板</p>
                <p className="mt-1 text-20 text-muted-foreground">
                  平台核心指标 · 用户 / 订单 / 营收一屏直观
                </p>
              </div>
              <span className="inline-flex h-7 items-center rounded-pill border border-brand-green px-3 text-12 text-brand-green">
                operations
              </span>
            </div>
          </header>

          <div className="space-y-4 p-3 sm:p-4 lg:p-6">
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["待处理反馈", "12"],
                ["草稿消息", "3"],
                ["发送记录", "86"],
              ].map(([label, value]) => (
                <section
                  key={label}
                  className="rounded-8 border border-border bg-surface-card p-3"
                >
                  <p className="text-12 text-faint">{label}</p>
                  <p className="mt-2 text-20 font-medium tabular-nums text-foreground">
                    {value}
                  </p>
                </section>
              ))}
            </div>
            <AdminPermissionNotice />
            <section className="rounded-8 border border-border bg-surface-card p-4">
              <h3 className="text-14 font-medium text-foreground">管理范围</h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {["用户与权限", "订单与计费", "内容运营", "观测与日志"].map(
                  (label) => (
                    <div
                      key={label}
                      className="flex h-9 items-center justify-between rounded-8 bg-surface-1 px-3 text-12 text-subtle"
                    >
                      {label}
                      <LockKeyhole className="size-3 text-faint" />
                    </div>
                  ),
                )}
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

const PERMISSIONS = [
  ["查看看板与统计", "允许", "允许", "允许"],
  ["维护内容与互动", "允许", "允许", "允许"],
  ["冻结、补发权益", "—", "允许", "允许"],
  ["修改系统配置", "—", "允许", "允许"],
  ["委派后台角色", "—", "—", "允许"],
] as const;

/** operations / admin / super_admin 权限矩阵 · 纯样式 fixture。 */
export function WikiEmbedAdminAccessControl() {
  return (
    <div
      className="w-full max-w-4xl overflow-hidden rounded-12 border border-border bg-surface-card"
      style={ADMIN_MOCK_THEME}
      aria-hidden
      data-wiki-fixture="admin-access-control"
    >
      <header className="flex items-start gap-3 border-b border-border p-4 sm:p-6">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-8 bg-surface-2 text-subtle">
          <Shield className="size-4" />
        </span>
        <div>
          <h2 className="text-18 font-medium text-foreground">
            后台角色与权限
          </h2>
          <p className="mt-1 text-12 leading-paragraph text-subtle">
            前端菜单按权限裁剪，后端接口执行最终授权。
          </p>
        </div>
      </header>

      <div className="space-y-4 p-4 sm:p-6">
        <div className="overflow-hidden rounded-8 border border-border">
          <div className="grid grid-cols-4 gap-2 bg-surface-1 px-3 py-2 text-12 text-faint">
            <span>能力</span>
            <span className="text-center">operations</span>
            <span className="text-center">admin</span>
            <span className="text-center">super_admin</span>
          </div>
          {PERMISSIONS.map(([label, operations, admin, superAdmin]) => (
            <div
              key={label}
              className="grid grid-cols-4 gap-2 border-t border-border-soft px-3 py-3 text-12"
            >
              <span className="font-medium text-foreground">{label}</span>
              {[operations, admin, superAdmin].map((value, index) => (
                <span
                  key={`${label}-${index}`}
                  className={
                    value === "允许"
                      ? "text-center text-brand-green"
                      : "text-center text-faint"
                  }
                >
                  {value}
                </span>
              ))}
            </div>
          ))}
        </div>
        <AdminPermissionNotice />
      </div>
    </div>
  );
}

/** 后台核心指标、趋势与运行检查 · 纯样式 fixture。 */
export function WikiEmbedAdminDashboard() {
  return (
    <AdminMockPage
      fixture="admin-dashboard"
      title="看板"
      description="平台核心指标 · 用户 / 订单 / 营收一屏直观；在线 / DAU / 漏斗移至数据统计"
    >
      <section className="rounded-8 border border-border bg-background">
        <header className="flex items-center justify-between border-b border-border-hairline px-4 py-3">
          <h3 className="text-16 font-medium text-foreground">今日待办</h3>
          <span className="text-12 text-faint">3 项</span>
        </header>
        {[
          {
            label: "待处理反馈",
            hint: "点击查看 →",
            value: "12 条",
            Icon: MessageSquare,
            tone: "red",
          },
          {
            label: "第三方账号失败率高",
            hint: "失败率 > 10%",
            value: "2 个",
            Icon: Activity,
            tone: "red",
          },
          {
            label: "草稿消息未发送",
            hint: "点击查看 →",
            value: "3 条",
            Icon: Bell,
            tone: "neutral",
          },
        ].map(({ label, hint, value, Icon, tone }, index) => (
          <div
            key={label}
            className={`flex h-12 items-center gap-3 px-4 ${index < 2 ? "border-b border-border-hairline" : ""}`}
          >
            <span
              className={`inline-flex size-7 shrink-0 items-center justify-center rounded-8 ${tone === "red" ? "bg-brand-red-soft text-brand-red" : "bg-surface-2 text-faint"}`}
            >
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1 leading-sans">
              <p className="text-16 font-medium text-foreground">{label}</p>
              <p className="mt-px truncate text-12 text-faint">{hint}</p>
            </div>
            <span
              className={`text-16 font-medium tabular-nums ${tone === "red" ? "text-brand-red" : "text-subtle"}`}
            >
              {value}
            </span>
          </div>
        ))}
      </section>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          ["总用户", "28,640", "今日新增 86 · 30 日 3,280", Users],
          ["30 日营收", "¥126,580", "今日 ¥8,420 · 累计 ¥829,600", Wallet],
          ["已支付订单", "1,284", "待支付 72 · 总 1,356", ShoppingCart],
          ["付费用户", "4,280", "Free 24,360", CheckCircle2],
          [
            "今日 AI 成本",
            "¥614.00",
            "30 日 ¥18,420 · 明细见 Token 用量",
            Coins,
          ],
          ["兑换码已核销", "860", "总生成 1,200", Gift],
        ].map(([label, value, hint, Icon]) => {
          const MetricIcon = Icon as typeof Users;
          return (
            <section
              key={label as string}
              className="flex flex-col gap-2 rounded-8 border border-border bg-background p-4"
            >
              <div className="flex items-center justify-between text-faint">
                <span className="text-20">{label as string}</span>
                <MetricIcon className="size-4" />
              </div>
              <strong className="text-32 font-medium tabular-nums text-foreground">
                {value as string}
              </strong>
              <span className="text-14 text-muted-foreground">
                {hint as string}
              </span>
            </section>
          );
        })}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <DashboardTrend
          title="新增用户 · 30 天"
          value="3,280 人"
          color="green"
          points="0,92 30,74 60,84 90,46 120,60 150,24 180,42 210,14 240,30 270,8 300,20"
        />
        <DashboardTrend
          title="营收(¥) · 30 天"
          value="¥126,580"
          color="red"
          area
          points="0,82 30,68 60,74 90,52 120,60 150,34 180,40 210,18 240,28 270,10 300,16"
        />
        <DashboardTrend
          title="AI 成本(¥) · 30 天"
          value="¥18,420"
          color="amber"
          area
          points="0,86 30,76 60,80 90,66 120,58 150,64 180,40 210,48 240,26 270,34 300,18"
        />
      </div>
    </AdminMockPage>
  );
}

function DashboardTrend({
  title,
  value,
  points,
  color,
  area = false,
}: {
  title: string;
  value: string;
  points: string;
  color: "green" | "red" | "amber";
  area?: boolean;
}) {
  const stroke =
    color === "green"
      ? "var(--brand-green)"
      : color === "red"
        ? "var(--brand-red)"
        : "var(--brand-amber)";
  return (
    <section className="rounded-8 border border-border bg-background p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-16 font-medium text-foreground">{title}</h3>
        <BarChart3 className="size-4 text-faint" />
      </div>
      <p className="mt-1 text-14 tabular-nums text-muted-foreground">{value}</p>
      <svg
        viewBox="0 0 300 110"
        className="mt-3 h-48 w-full overflow-visible"
        preserveAspectRatio="none"
      >
        {[20, 50, 80].map((y) => (
          <line
            key={y}
            x1="0"
            y1={y}
            x2="300"
            y2={y}
            stroke="var(--border)"
            strokeDasharray="3 3"
          />
        ))}
        {area ? (
          <polygon
            points={`${points} 300,100 0,100`}
            fill={stroke}
            fillOpacity="0.1"
          />
        ) : null}
        <polyline
          points={points}
          fill="none"
          stroke={stroke}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
        {points.split(" ").map((point) => {
          const [cx, cy] = point.split(",");
          return area ? null : (
            <circle key={point} cx={cx} cy={cy} r="2" fill={stroke} />
          );
        })}
      </svg>
      <div className="flex justify-between text-12 text-faint">
        <span>07-14</span>
        <span>07-29</span>
        <span>08-12</span>
      </div>
    </section>
  );
}
