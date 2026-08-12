import {
  BarChart3,
  Bell,
  LayoutDashboard,
  LockKeyhole,
  Shield,
  Users,
} from "lucide-react";
import {
  AdminAnalyticsFixture,
  AdminPermissionNotice,
} from "./WikiEmbedAdminShared";

const SETTLED_ACTIVITY = [
  {
    title: "数据聚合完成",
    detail: "",
    meta: "今天 10:20",
    status: "已完成",
    tone: "green" as const,
  },
  {
    title: "日报快照已生成",
    detail: "",
    meta: "昨天 23:55",
    status: "已归档",
    tone: "neutral" as const,
  },
] as const;

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
      className="w-full max-w-5xl overflow-hidden rounded-12 border border-border bg-surface-1"
      aria-hidden
      data-wiki-fixture="admin-console"
    >
      <div className="flex min-h-96">
        <aside className="hidden w-48 shrink-0 border-r border-border bg-surface-card sm:block">
          <div className="flex h-14 items-center gap-2 border-b border-border px-4">
            <span className="inline-flex size-8 items-center justify-center rounded-8 bg-foreground text-on-dark">
              <Shield className="size-4" />
            </span>
            <span className="text-14 font-medium text-foreground">
              管理员后台
            </span>
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
                          ? "flex h-8 items-center gap-2 rounded-8 bg-danger-soft px-2 text-12 font-medium text-brand-red"
                          : "flex h-8 items-center gap-2 rounded-8 px-2 text-12 text-subtle"
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
          <header className="border-b border-border bg-surface-card p-4 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-18 font-medium text-foreground">看板</p>
                <p className="mt-1 text-12 leading-paragraph text-subtle">
                  管理入口、权限菜单与运营工作区位于同一套用户端 SPA。
                </p>
              </div>
              <span className="inline-flex h-8 items-center rounded-pill bg-success-soft px-3 text-12 text-brand-green">
                operations
              </span>
            </div>
          </header>

          <div className="space-y-4 p-4 sm:p-6">
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
    <AdminAnalyticsFixture
      fixture="admin-dashboard"
      icon={LayoutDashboard}
      title="看板"
      description="平台核心指标与今日检查；聚合结果显示独立更新时间。"
      metrics={[
        { label: "总用户", value: "28,640", note: "今日 +86", tone: "blue" },
        {
          label: "净收入",
          value: "¥126,580",
          note: "已扣除退款",
          tone: "green",
        },
        {
          label: "已支付订单",
          value: "1,284",
          note: "待支付 72",
          tone: "neutral",
        },
        { label: "AI 成本", value: "¥18,420", note: "本周期", tone: "amber" },
      ]}
      tabs={["核心指标", "今日检查"]}
      activeTab="核心指标"
      bars={[
        { label: "新增用户", value: "3,280", width: "full", tone: "blue" },
        {
          label: "付费用户",
          value: "1,920",
          width: "three-fourths",
          tone: "green",
        },
        { label: "兑换码核销", value: "860", width: "half", tone: "amber" },
        { label: "退款订单", value: "38", width: "third", tone: "red" },
      ]}
      activity={SETTLED_ACTIVITY}
    />
  );
}
