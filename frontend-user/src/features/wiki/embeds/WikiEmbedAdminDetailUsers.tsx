import {
  Activity,
  BellRing,
  CalendarClock,
  ChartNoAxesCombined,
  CircleDollarSign,
  CreditCard,
  Gift,
  LayoutDashboard,
  MessageSquare,
  Plug,
  Settings,
  ShieldAlert,
  UserRoundSearch,
  WalletCards,
} from "lucide-react";
import {
  AdminDetailFrame,
  DetailBadge,
  DetailBars,
  DetailDialog,
  DetailDrawer,
  DetailFields,
  DetailMetricStrip,
  DetailNotice,
  DetailSection,
  DetailTable,
  DetailTabs,
} from "./WikiEmbedAdminDetailPrimitives";

function MiniTrendChart({
  tone = "green",
  secondTone,
  area = false,
}: {
  tone?: "green" | "amber" | "red" | "blue";
  secondTone?: "green" | "amber" | "red" | "blue";
  area?: boolean;
}) {
  const color = {
    green: "var(--color-brand-green)",
    amber: "var(--color-brand-amber)",
    red: "var(--color-brand-red)",
    blue: "var(--color-cat-blue)",
  }[tone];
  const secondColor = secondTone
    ? {
        green: "var(--color-brand-green)",
        amber: "var(--color-brand-amber)",
        red: "var(--color-brand-red)",
        blue: "var(--color-cat-blue)",
      }[secondTone]
    : undefined;

  return (
    <svg
      className="h-40 w-full"
      viewBox="0 0 520 160"
      preserveAspectRatio="none"
      role="img"
      aria-label="冻结的趋势图预览"
    >
      {[32, 64, 96, 128].map((y) => (
        <line
          key={y}
          x1="0"
          x2="520"
          y1={y}
          y2={y}
          stroke="var(--color-border)"
          strokeDasharray="3 3"
        />
      ))}
      {area ? (
        <path
          d="M0 132 L58 126 L116 118 L174 124 L232 95 L290 102 L348 78 L406 84 L464 45 L520 55 L520 160 L0 160 Z"
          fill={color}
          opacity="0.12"
        />
      ) : null}
      <polyline
        points="0,132 58,126 116,118 174,124 232,95 290,102 348,78 406,84 464,45 520,55"
        fill="none"
        stroke={color}
        strokeWidth="3"
      />
      {secondColor ? (
        <polyline
          points="0,110 58,104 116,112 174,91 232,96 290,74 348,82 406,58 464,64 520,36"
          fill="none"
          stroke={secondColor}
          strokeWidth="3"
        />
      ) : null}
    </svg>
  );
}

function MiniDonut() {
  return (
    <div className="flex h-40 items-center justify-center gap-6">
      <svg className="size-32 -rotate-90" viewBox="0 0 100 100" aria-hidden>
        <circle
          cx="50"
          cy="50"
          r="34"
          fill="none"
          stroke="var(--color-surface-2)"
          strokeWidth="16"
        />
        <circle
          cx="50"
          cy="50"
          r="34"
          fill="none"
          stroke="var(--color-brand-green)"
          strokeDasharray="107 214"
          strokeWidth="16"
        />
        <circle
          cx="50"
          cy="50"
          r="34"
          fill="none"
          stroke="var(--color-cat-blue)"
          strokeDasharray="60 214"
          strokeDashoffset="-107"
          strokeWidth="16"
        />
        <circle
          cx="50"
          cy="50"
          r="34"
          fill="none"
          stroke="var(--color-brand-amber)"
          strokeDasharray="30 214"
          strokeDashoffset="-167"
          strokeWidth="16"
        />
      </svg>
      <div className="space-y-2 text-12 text-subtle">
        <p>
          <span className="mr-2 inline-block size-2 bg-brand-green" />
          邮箱 50%
        </p>
        <p>
          <span className="mr-2 inline-block size-2 bg-cat-blue" />
          微信 28%
        </p>
        <p>
          <span className="mr-2 inline-block size-2 bg-brand-amber" />
          Google 14%
        </p>
        <p>
          <span className="mr-2 inline-block size-2 bg-foreground" />
          其他 8%
        </p>
      </div>
    </div>
  );
}

/** AdminSidebar + SidebarBadges：菜单级提醒与全局状态。 */
export function WikiEmbedAdminSidebarAlerts() {
  const groups = [
    {
      label: "总览",
      items: [["看板", "", "neutral"]],
    },
    {
      label: "内容与运营",
      items: [
        ["反馈处理", "12", "red"],
        ["站内消息", "3", "neutral"],
        ["第三方账号", "2", "red"],
      ],
    },
    {
      label: "系统",
      items: [
        ["支付配置", "dot", "amber"],
        ["系统配置", "dot", "amber"],
      ],
    },
  ] as const;

  return (
    <AdminDetailFrame
      fixture="admin-sidebar-alerts"
      icon={BellRing}
      title="侧栏提醒状态"
      description="计数徽标表示待处理记录；状态点表示需要管理员关注的系统配置。"
      eyebrow="后台框架"
    >
      <div className="flex min-h-112 overflow-hidden rounded-8 border border-border bg-surface-2">
        <aside className="w-64 shrink-0 border-r border-border bg-background p-3">
          <div className="flex h-10 items-center justify-between border-b border-border-soft px-2">
            <span className="text-12 text-faint">←</span>
            <p className="text-14 font-medium text-foreground">管理员后台</p>
            <ShieldAlert className="size-4 text-faint" />
          </div>
          <div className="mt-3 space-y-4">
            {groups.map((group) => (
              <div key={group.label}>
                <p className="px-2 text-12 text-faint">{group.label}</p>
                <div className="mt-1 space-y-1">
                  {group.items.map(([label, badge, tone], index) => (
                    <div
                      key={label}
                      className={`flex h-8 items-center justify-between rounded-8 px-2 text-12 ${group.label === "总览" && index === 0 ? "bg-surface-2 text-foreground" : "text-subtle"}`}
                    >
                      <span>{label}</span>
                      {badge === "dot" ? (
                        <span className="size-2 rounded-pill bg-brand-amber" />
                      ) : badge ? (
                        <span
                          className={`inline-flex h-5 min-w-5 items-center justify-center rounded-pill px-1 text-12 font-medium ${tone === "red" ? "bg-brand-red text-on-dark" : "bg-surface-2 text-faint"}`}
                        >
                          {badge}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>
        <div className="flex flex-1 items-start p-6">
          <div className="w-full rounded-8 border border-border bg-background p-4">
            <p className="text-16 font-medium text-foreground">看板</p>
            <p className="mt-1 text-12 text-faint">
              数字徽标只显示真实待办数量；支付和维护状态用圆点提醒。
            </p>
          </div>
        </div>
      </div>
    </AdminDetailFrame>
  );
}

/** TodayPanel：仪表盘今日待办的正常、降级和失败检查。 */
export function WikiEmbedAdminDashboardTodayPanel() {
  const items = [
    {
      icon: MessageSquare,
      label: "待处理反馈",
      hint: "点击查看 →",
      value: "12 条",
      tone: "red",
    },
    {
      icon: Plug,
      label: "三方账号失败率高",
      hint: "失败率 > 10%",
      value: "2 个",
      tone: "red",
    },
    {
      icon: CreditCard,
      label: "支付配置缺失",
      hint: "当前无激活商户，用户无法支付",
      value: "支付宝 · 微信支付",
      tone: "amber",
    },
    {
      icon: Settings,
      label: "维护模式已开启",
      hint: "记得关闭",
      value: "全站只读",
      tone: "amber",
    },
    {
      icon: BellRing,
      label: "草稿消息未发送",
      hint: "点击查看 →",
      value: "3 条",
      tone: "neutral",
    },
  ] as const;

  return (
    <AdminDetailFrame
      fixture="admin-dashboard-today-panel"
      icon={CalendarClock}
      title="今日待办"
      description="把审核积压、服务检查和支付通道异常聚合成可进入的任务。"
      eyebrow="仪表盘"
      action="重新检查"
    >
      <section className="overflow-hidden rounded-8 border border-border bg-background">
        <header className="flex items-center justify-between border-b border-border-soft px-4 py-3">
          <h3 className="text-14 font-medium text-foreground">今日待办</h3>
          <span className="text-12 text-faint">{items.length} 项</span>
        </header>
        <ul>
          {items.map((item, index) => {
            const Icon = item.icon;
            return (
              <li
                key={item.label}
                className={`flex h-12 items-center gap-3 px-4 ${index < items.length - 1 ? "border-b border-border-soft" : ""}`}
              >
                <span
                  className={`inline-flex size-7 shrink-0 items-center justify-center rounded-8 ${item.tone === "red" ? "bg-danger-soft text-brand-red" : item.tone === "amber" ? "bg-warning-soft text-brand-amber" : "bg-surface-2 text-faint"}`}
                >
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-14 font-medium text-foreground">
                    {item.label}
                  </span>
                  <span className="block truncate text-12 text-faint">
                    {item.hint}
                  </span>
                </span>
                <span
                  className={`shrink-0 text-14 font-medium tabular-nums ${item.tone === "red" ? "text-brand-red" : item.tone === "amber" ? "text-brand-amber" : "text-subtle"}`}
                >
                  {item.value}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </AdminDetailFrame>
  );
}

/** DashboardPage TrendCard：关键指标趋势卡。 */
export function WikiEmbedAdminDashboardTrendCards() {
  return (
    <AdminDetailFrame
      fixture="admin-dashboard-trend-cards"
      icon={LayoutDashboard}
      title="关键指标趋势"
      description="卡片对比今日值与上一周期，并保留趋势方向和口径说明。"
      eyebrow="仪表盘"
    >
      <DetailMetricStrip
        columns={3}
        metrics={[
          {
            label: "总用户",
            value: "28,461",
            note: "今日新增 86 · 30 日 2,486",
          },
          {
            label: "30 日营收",
            value: "¥126,580",
            note: "今日 ¥8,642 · 累计 ¥824,610",
            tone: "red",
          },
          {
            label: "已支付订单",
            value: "1,284",
            note: "待支付 46 · 总订单 1,492",
          },
          {
            label: "付费用户",
            value: "3,806",
            note: "Free 24,655",
          },
          {
            label: "今日 AI 成本",
            value: "¥428.16",
            note: "30 日 ¥9,842.60 · 明细见算力用量",
            tone: "amber",
          },
          {
            label: "兑换码已核销",
            value: "842",
            note: "总生成 1,240",
            tone: "green",
          },
        ]}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <DetailSection title="新增用户 · 30 天">
          <MiniTrendChart tone="green" />
        </DetailSection>
        <DetailSection title="营收（¥）· 30 天">
          <MiniTrendChart tone="red" area />
        </DetailSection>
        <DetailSection title="AI 成本（¥）· 30 天">
          <MiniTrendChart tone="amber" area />
        </DetailSection>
      </div>
    </AdminDetailFrame>
  );
}

/** UserMetricsPanel：注册、活跃、渠道与时段分析。 */
export function WikiEmbedAdminUserMetrics() {
  return (
    <AdminDetailFrame
      fixture="admin-user-metrics"
      icon={Activity}
      title="用户分析"
      description="在 7、30、90 天窗口间查看注册、活跃、来源与时段分布。"
      eyebrow="用户管理"
    >
      <DetailTabs tabs={["7 天", "30 天", "90 天"]} active="30 天" />
      <div className="grid gap-4 lg:grid-cols-2">
        <DetailSection
          title="注册量 · 活跃用户 · 最近 30 天"
          description="面积=当日新注册；折线=当日去重活跃用户。"
        >
          <div className="mb-2 flex justify-end gap-3 text-12 tabular-nums">
            <span className="text-brand-green">注册 2,486</span>
            <span className="text-brand-amber">活跃 12,840</span>
          </div>
          <MiniTrendChart tone="green" secondTone="amber" area />
        </DetailSection>
        <DetailSection title="注册渠道占比">
          <MiniDonut />
        </DetailSection>
        <DetailSection title="24h 活跃时段分布">
          <div className="flex h-40 items-end gap-2 border-b border-border px-2 pt-4">
            {[28, 35, 46, 38, 52, 65, 58, 82, 74, 92, 68, 44].map(
              (height, index) => (
                <div
                  key={index}
                  className="flex-1 rounded-t-4 bg-brand-green"
                  style={{ height: `${height}%` }}
                />
              ),
            )}
          </div>
          <div className="mt-2 flex justify-between text-12 text-faint">
            <span>00:00</span>
            <span>08:00</span>
            <span>16:00</span>
            <span>23:00</span>
          </div>
        </DetailSection>
        <DetailSection title="MAU · 最近 12 个月">
          <MiniTrendChart tone="red" />
        </DetailSection>
      </div>
    </AdminDetailFrame>
  );
}

/** UserDetailDrawer：聚合身份、账户、资产和使用状态。 */
export function WikiEmbedAdminUserDetailDrawer() {
  return (
    <AdminDetailFrame
      fixture="admin-user-detail-drawer"
      icon={UserRoundSearch}
      title="用户聚合详情抽屉"
      description="从用户列表打开；固定信息、账户状态、资产与使用概况分别加载。"
      eyebrow="用户管理"
    >
      <DetailDrawer title="林晓舟" meta="用户 ID 28461 · lin.xz@example.edu">
        <div className="flex flex-wrap gap-2">
          <DetailBadge tone="green">账号正常</DetailBadge>
          <DetailBadge tone="blue">Pro</DetailBadge>
          <DetailBadge>user</DetailBadge>
          <DetailBadge tone="green">邮箱已验证</DetailBadge>
        </div>
        <DetailTabs tabs={["固定信息", "账户与财务记录"]} active="固定信息" />
        <DetailSection title="身份资料">
          <DetailFields
            columns={3}
            fields={[
              { label: "用户名", value: "lin_xiaozhou", kind: "readonly" },
              { label: "手机号", value: "138****2046", kind: "readonly" },
              { label: "注册来源", value: "微信", kind: "readonly" },
              {
                label: "注册时间",
                value: "2025-11-18 09:42",
                kind: "readonly",
              },
              { label: "最后登录", value: "今天 10:26", kind: "readonly" },
              { label: "登录 IP", value: "203.0.113.42", kind: "readonly" },
            ]}
          />
        </DetailSection>
        <div className="grid gap-3 sm:grid-cols-3">
          {["科研经费 · 368", "重置次数 · 2", "AI 算力 · 41.8 / 100"].map(
            (item) => (
              <div
                key={item}
                className="rounded-8 border border-border bg-surface-1 p-3 text-12 text-subtle"
              >
                {item}
              </div>
            ),
          )}
        </div>
      </DetailDrawer>
    </AdminDetailFrame>
  );
}

/** UserUsageOverviewPanel：单用户功能事件与 AI 算力。 */
export function WikiEmbedAdminUserTokenUsage() {
  return (
    <AdminDetailFrame
      fixture="admin-user-token-usage"
      icon={ChartNoAxesCombined}
      title="单用户使用概况"
      description="功能事件与 AI 算力分开计量；调用次数包含重试，成本按统一算力口径展示。"
      eyebrow="用户详情"
    >
      <DetailTabs tabs={["7 天", "30 天", "90 天", "365 天"]} active="30 天" />
      <DetailMetricStrip
        metrics={[
          { label: "功能事件", value: "184", note: "9 个功能" },
          {
            label: "AI 算力消耗",
            value: "41.8",
            note: "统一计费单位",
            tone: "amber",
          },
          { label: "AI 调用（含重试）", value: "236", note: "成功 221" },
          { label: "最近功能事件", value: "12", note: "当前抽屉展示" },
        ]}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <DetailSection
          title="按功能消耗"
          description="算力只按已落账请求聚合。"
        >
          <DetailBars
            bars={[
              { label: "智能搜索", value: "18.4", width: "full", tone: "red" },
              {
                label: "论文对话",
                value: "11.2",
                width: "three-fifths",
                tone: "amber",
              },
              { label: "同行评审", value: "8.7", width: "half", tone: "blue" },
              { label: "其他", value: "3.5", width: "quarter" },
            ]}
          />
        </DetailSection>
        <DetailSection title="最近功能事件">
          <DetailTable
            columns={["功能", "事件", "时间"]}
            rows={[
              { id: "usage-smart", cells: ["智能搜索", "完成会话", "10:24"] },
              { id: "usage-pdf", cells: ["论文对话", "发送消息", "09:58"] },
              { id: "usage-review", cells: ["同行评审", "生成报告", "昨天"] },
            ]}
          />
        </DetailSection>
      </div>
    </AdminDetailFrame>
  );
}

/** UserBillingPanels：订单、经费流水和兑换记录。 */
export function WikiEmbedAdminUserBillingHistory() {
  return (
    <AdminDetailFrame
      fixture="admin-user-billing-history"
      icon={WalletCards}
      title="账户与财务记录"
      description="用户详情中顺序展示订单、经费流水与经费兑换三个独立区块。"
      eyebrow="用户详情"
    >
      <DetailSection title="订单" variant="plain">
        <DetailTable
          columns={["订单 / 交易号", "类型", "金额", "状态"]}
          columnsTemplate="1.5fr 1fr .7fr .8fr"
          rows={[
            {
              id: "order-S2608120019",
              cells: [
                <span key="id" className="font-mono text-foreground">
                  S2608120019
                </span>,
                "Pro 年付",
                "¥299.00",
                <DetailBadge key="status" tone="green">
                  已支付
                </DetailBadge>,
              ],
            },
            {
              id: "order-S2607280064",
              cells: [
                <span key="id" className="font-mono text-foreground">
                  S2607280064
                </span>,
                "经费充值",
                "¥100.00",
                <span key="status" className="flex items-center gap-1">
                  <DetailBadge tone="green">已支付</DetailBadge>
                  <DetailBadge tone="amber">已退 ¥20</DetailBadge>
                </span>,
              ],
            },
            {
              id: "order-S2607010021",
              cells: [
                <span key="id" className="font-mono text-foreground">
                  S2607010021
                </span>,
                "Max 月付",
                "¥59.00",
                <DetailBadge key="status">已过期</DetailBadge>,
              ],
            },
          ]}
        />
      </DetailSection>
      <div className="space-y-4">
        <DetailSection title="经费流水（充值 / 消费）" variant="plain">
          <DetailTable
            columns={["变动", "余额", "归因"]}
            columnsTemplate=".7fr .7fr 1.6fr"
            rows={[
              { id: "credit-1", cells: ["−12.6", "368.0", "智能搜索"] },
              { id: "credit-2", cells: ["+100", "380.6", "后台补发"] },
            ]}
          />
        </DetailSection>
        <DetailSection title="经费兑换" variant="plain">
          <DetailTable
            columns={["兑换码", "权益", "时间"]}
            columnsTemplate="1.4fr 1fr .8fr"
            rows={[
              {
                id: "redeem-1",
                cells: ["ABCD-****-2345", "经费 100", "8 月 8 日"],
              },
              {
                id: "redeem-2",
                cells: ["Q7RX-****-8H2P", "Pro 30 天", "7 月 12 日"],
              },
            ]}
          />
        </DetailSection>
      </div>
    </AdminDetailFrame>
  );
}

/** UserGrantPanel：会员、科研经费和重置次数的独立补偿。 */
export function WikiEmbedAdminUserGrantPanel() {
  return (
    <AdminDetailFrame
      fixture="admin-user-grant-panel"
      icon={ShieldAlert}
      title="发放用户权益"
      description="三类权益各自提交并写入记录；科研经费不再区分永久与临时。"
      eyebrow="用户详情"
    >
      <DetailNotice>
        当前对象：林晓舟 · 用户 ID
        28461。长周期会员、扣减经费和大额重置次数需再次确认。
      </DetailNotice>
      <div className="grid gap-4 lg:grid-cols-3">
        <DetailSection
          title="会员"
          description="Pro / Max，可按天、月或年发放。"
        >
          <DetailFields
            columns={1}
            fields={[
              { label: "会员等级", value: "Pro", kind: "select" },
              { label: "发放时长", value: "3 个月", kind: "select" },
              { label: "周期标识", value: "保持现状", kind: "select" },
              { label: "当前状态", value: "Free", kind: "readonly" },
            ]}
          />
          <div className="mt-3 flex gap-2">
            <DetailBadge tone="green">发放会员</DetailBadge>
            <DetailBadge>撤销会员</DetailBadge>
          </div>
        </DetailSection>
        <DetailSection
          title="科研经费"
          description="补发或扣减，最低余额为零。"
        >
          <DetailFields
            columns={1}
            fields={[
              { label: "金额", value: "100" },
              { label: "人民币参考", value: "≈ ¥1.00", kind: "readonly" },
              {
                label: "调账备注",
                value: "活动补偿，计入经费流水",
                kind: "textarea",
              },
            ]}
          />
          <div className="mt-3 flex gap-2">
            <DetailBadge tone="green">发放</DetailBadge>
            <DetailBadge tone="red">扣减</DetailBadge>
          </div>
        </DetailSection>
        <DetailSection
          title="重置次数"
          description="次数和有效期共同决定可用额度。"
        >
          <DetailFields
            columns={1}
            fields={[
              { label: "次数", value: "2" },
              { label: "有效天数", value: "365" },
              { label: "当前次数", value: "2", kind: "readonly" },
            ]}
          />
          <div className="mt-3">
            <DetailBadge tone="green">发放重置次数</DetailBadge>
          </div>
        </DetailSection>
      </div>
    </AdminDetailFrame>
  );
}

/** RevenueChart：订单收入构成与退款后的净收入。 */
export function WikiEmbedAdminOrderRevenueChart() {
  return (
    <AdminDetailFrame
      fixture="admin-order-revenue-chart"
      icon={CircleDollarSign}
      title="营收趋势"
      description="毛收入、退款与净收入按支付完成时间聚合，兑换码不计入现金收入。"
      eyebrow="订单管理"
    >
      <DetailTabs
        tabs={["最近 7 天", "最近 30 天", "最近 90 天"]}
        active="最近 30 天"
      />
      <DetailMetricStrip
        metrics={[
          { label: "毛收入", value: "¥132,840", note: "已支付订单" },
          { label: "退款", value: "¥6,260", note: "47 笔", tone: "red" },
          {
            label: "净收入",
            value: "¥126,580",
            note: "毛收入 − 退款",
            tone: "green",
          },
          { label: "支付订单", value: "1,284", note: "订阅 68%" },
        ]}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <DetailSection title="每日净收入" className="lg:col-span-2">
          <DetailBars
            bars={[
              {
                label: "8 月 8 日",
                value: "¥3,840",
                width: "half",
                tone: "green",
              },
              {
                label: "8 月 9 日",
                value: "¥5,260",
                width: "two-thirds",
                tone: "green",
              },
              {
                label: "8 月 10 日",
                value: "¥4,780",
                width: "three-fifths",
                tone: "green",
              },
              {
                label: "8 月 11 日",
                value: "¥6,920",
                width: "five-sixths",
                tone: "green",
              },
              {
                label: "8 月 12 日",
                value: "¥8,642",
                width: "full",
                tone: "green",
              },
            ]}
          />
        </DetailSection>
        <DetailSection title="收入构成">
          <DetailBars
            bars={[
              {
                label: "订阅",
                value: "68%",
                width: "two-thirds",
                tone: "blue",
              },
              {
                label: "经费充值",
                value: "32%",
                width: "third",
                tone: "amber",
              },
            ]}
          />
          <p className="mt-4 text-12 leading-paragraph text-faint">
            退款作为原订单的附加记录，不改写原支付状态。
          </p>
        </DetailSection>
      </div>
    </AdminDetailFrame>
  );
}

/** VipCodeGeneratePanel：按批次生成会员或科研经费兑换码。 */
export function WikiEmbedAdminGiftCodeGenerator() {
  return (
    <AdminDetailFrame
      fixture="admin-gift-code-generator"
      icon={Gift}
      title="生成兑换码批次"
      description="选择会员或科研经费权益；一次提交生成一个批次和多条独立兑换码。"
      eyebrow="兑换码管理"
    >
      <DetailSection
        title="新批次"
        description="生成后在批次详情复制或导出完整兑换码。"
        action="生成兑换码"
      >
        <DetailFields
          columns={3}
          fields={[
            { label: "数量", value: "20" },
            { label: "发放类型", value: "会员", kind: "select" },
            { label: "会员等级", value: "Pro", kind: "select" },
            { label: "授予时长", value: "30 天", kind: "select" },
            { label: "每码兑换次数", value: "1" },
            { label: "兑换码有效天数", value: "7" },
            {
              label: "批次备注",
              value: "秋季学术写作营内测邀请",
              kind: "textarea",
            },
          ]}
        />
      </DetailSection>
      <DetailNotice tone="green">
        将生成 20 个 Pro 会员兑换码，每码可兑换 1 次，7 天后未使用的码自动失效。
      </DetailNotice>
    </AdminDetailFrame>
  );
}

/** VipCodeBatchCodeTable：批次内的单码清单与导出操作。 */
export function WikiEmbedAdminGiftCodeList() {
  return (
    <AdminDetailFrame
      fixture="admin-gift-code-list"
      icon={Gift}
      title="批次兑换码清单"
      description="完整兑换码只在批次详情出现；列表可复制、导出并管理单码状态。"
      eyebrow="兑换码管理"
      action="导出 CSV"
    >
      <DetailMetricStrip
        metrics={[
          { label: "批次总数", value: "20", note: "Pro · 30 天" },
          { label: "可用", value: "14", note: "未过期", tone: "green" },
          { label: "已兑换", value: "5", note: "5 次核销", tone: "blue" },
          { label: "已停用", value: "1", note: "人工停用", tone: "red" },
        ]}
      />
      <DetailTable
        columns={["兑换码", "权益", "使用次数", "状态"]}
        rows={[
          {
            id: "code-ABCD",
            cells: [
              <span key="c" className="font-mono text-foreground">
                ABCD-EFGH-JKMP-2345
              </span>,
              "Pro · 30 天",
              "0 / 1",
              <DetailBadge key="s" tone="green">
                可用
              </DetailBadge>,
            ],
          },
          {
            id: "code-Q7RX",
            cells: [
              <span key="c" className="font-mono text-foreground">
                Q7RX-V9WT-3KDM-8H2P
              </span>,
              "Pro · 30 天",
              "1 / 1",
              <DetailBadge key="s" tone="blue">
                已兑换
              </DetailBadge>,
            ],
          },
          {
            id: "code-M4NP",
            cells: [
              <span key="c" className="font-mono text-foreground">
                M4NP-6QRS-7TUV-9XYZ
              </span>,
              "Pro · 30 天",
              "0 / 1",
              <DetailBadge key="s" tone="red">
                已停用
              </DetailBadge>,
            ],
          },
        ]}
      />
      <div className="flex flex-wrap gap-2 text-12 text-subtle">
        <DetailBadge>复制本页</DetailBadge>
        <DetailBadge>复制全部</DetailBadge>
        <DetailBadge tone="blue">导出批次</DetailBadge>
      </div>
    </AdminDetailFrame>
  );
}

/** VipCodeActionDialog：延期、增次与修改会员授予时长。 */
export function WikiEmbedAdminGiftCodeActionDialog() {
  return (
    <AdminDetailFrame
      fixture="admin-gift-code-action-dialog"
      icon={Gift}
      title="单个兑换码操作"
      description="对已选中的兑换码延期、增加使用次数或修改会员授予时长。"
      eyebrow="兑换码管理"
    >
      <DetailDialog
        title="延长兑换码有效期"
        description="ABCD-EFGH-JKMP-2345 · 当前有效至 2026-08-19"
        primary="确认延期"
        size="sm"
      >
        <DetailFields
          fields={[
            { label: "延长天数", value: "14" },
            { label: "调整后有效期", value: "2026-09-02", kind: "readonly" },
          ]}
        />
        <DetailNotice>
          该操作只影响兑换码本身的有效期，不改变兑换后会员权益的授予时长。
        </DetailNotice>
      </DetailDialog>
    </AdminDetailFrame>
  );
}
