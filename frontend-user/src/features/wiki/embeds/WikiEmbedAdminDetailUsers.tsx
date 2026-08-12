import {
  Activity,
  BellRing,
  CalendarClock,
  ChartNoAxesCombined,
  CircleDollarSign,
  Gift,
  LayoutDashboard,
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
  DetailSteps,
  DetailTable,
  DetailTabs,
} from "./WikiEmbedAdminDetailPrimitives";

/** AdminSidebar + SidebarBadges：菜单级提醒与全局状态。 */
export function WikiEmbedAdminSidebarAlerts() {
  const groups = [
    {
      label: "总览",
      items: [
        ["仪表盘", "3", "red"],
        ["用户管理", "", "neutral"],
      ],
    },
    {
      label: "内容与运营",
      items: [
        ["技能审核", "7", "amber"],
        ["反馈处理", "12", "red"],
        ["邮件中心", "4", "blue"],
      ],
    },
    {
      label: "系统",
      items: [
        ["支付配置", "!", "amber"],
        ["系统配置", "!", "amber"],
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
      <div className="grid gap-4 lg:grid-cols-[17rem_1fr]">
        <aside className="rounded-8 border border-border bg-surface-card p-3">
          <div className="border-b border-border-soft px-2 pb-3">
            <p className="text-14 font-medium text-foreground">
              Scholay 管理后台
            </p>
            <p className="mt-1 text-12 text-faint">super_admin</p>
          </div>
          <div className="mt-3 space-y-4">
            {groups.map((group) => (
              <div key={group.label}>
                <p className="px-2 text-12 text-faint">{group.label}</p>
                <div className="mt-1 space-y-1">
                  {group.items.map(([label, badge, tone]) => (
                    <div
                      key={label}
                      className="flex h-8 items-center justify-between rounded-8 px-2 text-12 text-subtle"
                    >
                      <span>{label}</span>
                      {badge ? (
                        <DetailBadge tone={tone}>{badge}</DetailBadge>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>
        <div className="space-y-3">
          <DetailNotice>
            支付宝与微信支付均未启用，用户当前无法完成支付。
          </DetailNotice>
          <DetailNotice tone="red">
            维护模式已开启，全站处于只读保护状态。
          </DetailNotice>
          <DetailSection
            title="提醒含义"
            description="侧栏只负责聚合入口，记录状态仍以对应页面和后端权限为准。"
          >
            <DetailSteps
              items={[
                {
                  label: "数字徽标",
                  detail: "显示待审核技能、未处理反馈或未读邮件的数量。",
                  status: "待处理",
                  tone: "red",
                },
                {
                  label: "黄色状态点",
                  detail: "表示支付通道缺失或其他需要注意的配置。",
                  status: "注意",
                  tone: "amber",
                },
                {
                  label: "权限过滤",
                  detail: "无对应权限的菜单组不会显示，但后端仍单独校验。",
                  status: "已生效",
                  tone: "green",
                },
              ]}
            />
          </DetailSection>
        </div>
      </div>
    </AdminDetailFrame>
  );
}

/** TodayPanel：仪表盘今日待办的正常、降级和失败检查。 */
export function WikiEmbedAdminDashboardTodayPanel() {
  return (
    <AdminDetailFrame
      fixture="admin-dashboard-today-panel"
      icon={CalendarClock}
      title="今日待办"
      description="把审核积压、服务检查和支付通道异常聚合成可进入的任务。"
      eyebrow="仪表盘"
      action="重新检查"
    >
      <DetailNotice>
        部分检查使用最近一次成功结果：邮件发送服务当前处于降级状态。
      </DetailNotice>
      <DetailSteps
        items={[
          {
            label: "处理 7 条技能举报",
            detail: "举报队列包含安全、版权与内容质量三类原因。",
            status: "7 条",
            tone: "red",
          },
          {
            label: "回复 12 条用户反馈",
            detail: "其中 3 条已标记高优先级，最早等待 19 小时。",
            status: "12 条",
            tone: "amber",
          },
          {
            label: "配置支付通道",
            detail: "支付宝和微信支付均未启用，充值与订阅结算不可用。",
            status: "阻断",
            tone: "red",
          },
          {
            label: "检查邮件服务",
            detail: "SMTP 最近一次探测延迟 2.8 秒，发送功能仍可用。",
            status: "降级",
            tone: "amber",
          },
          {
            label: "OAuth 回调检查",
            detail: "Google、GitHub 与微信开放平台回调地址均通过。",
            status: "正常",
            tone: "green",
          },
        ]}
      />
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
        metrics={[
          {
            label: "今日新增用户",
            value: "86",
            note: "较昨日 +12.4%",
            tone: "green",
          },
          {
            label: "今日活跃用户",
            value: "3,218",
            note: "较昨日 +4.8%",
            tone: "green",
          },
          {
            label: "今日净收入",
            value: "¥8,642",
            note: "毛收入减退款",
            tone: "blue",
          },
          {
            label: "待处理事项",
            value: "19",
            note: "较昨日 -6",
            tone: "amber",
          },
        ]}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <DetailSection
          title="近 7 天用户趋势"
          description="新增与活跃采用自然日口径。"
        >
          <DetailBars
            bars={[
              {
                label: "8 月 6 日",
                value: "2,880",
                width: "three-fifths",
                tone: "blue",
              },
              {
                label: "8 月 7 日",
                value: "3,042",
                width: "two-thirds",
                tone: "blue",
              },
              {
                label: "8 月 8 日",
                value: "3,106",
                width: "three-fourths",
                tone: "blue",
              },
              {
                label: "8 月 9 日",
                value: "3,218",
                width: "four-fifths",
                tone: "green",
              },
            ]}
          />
        </DetailSection>
        <DetailSection
          title="指标解释"
          description="趋势卡只显示汇总，不替代明细页。"
        >
          <DetailTable
            columns={["指标", "本期", "对比"]}
            rows={[
              {
                id: "dashboard-reg",
                cells: [
                  "注册",
                  "486",
                  <DetailBadge tone="green">+8.1%</DetailBadge>,
                ],
              },
              {
                id: "dashboard-order",
                cells: [
                  "已支付订单",
                  "214",
                  <DetailBadge tone="green">+5.6%</DetailBadge>,
                ],
              },
              {
                id: "dashboard-refund",
                cells: [
                  "退款金额",
                  "¥620",
                  <DetailBadge tone="red">+2.2%</DetailBadge>,
                ],
              },
            ]}
          />
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
      <DetailTabs
        tabs={["最近 7 天", "最近 30 天", "最近 90 天"]}
        active="最近 30 天"
      />
      <DetailMetricStrip
        metrics={[
          { label: "新增注册", value: "2,486", note: "日均 82.9" },
          {
            label: "活跃用户",
            value: "12,840",
            note: "去重账号",
            tone: "green",
          },
          {
            label: "月活 MAU",
            value: "18,206",
            note: "滚动 30 天",
            tone: "blue",
          },
          { label: "邮箱验证率", value: "91.2%", note: "新注册用户" },
        ]}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <DetailSection
          title="注册渠道占比"
          description="以账号首次注册来源归因。"
        >
          <DetailBars
            bars={[
              {
                label: "邮箱",
                value: "1,244 · 50%",
                width: "full",
                tone: "green",
              },
              {
                label: "微信",
                value: "696 · 28%",
                width: "three-fifths",
                tone: "blue",
              },
              {
                label: "Google",
                value: "348 · 14%",
                width: "third",
                tone: "amber",
              },
              { label: "GitHub", value: "198 · 8%", width: "quarter" },
            ]}
          />
        </DetailSection>
        <DetailSection
          title="24h 活跃时段"
          description="按本地时区 Asia/Shanghai 汇总。"
        >
          <DetailBars
            bars={[
              {
                label: "08:00–12:00",
                value: "22%",
                width: "two-fifths",
                tone: "blue",
              },
              {
                label: "12:00–18:00",
                value: "31%",
                width: "three-fifths",
                tone: "blue",
              },
              {
                label: "18:00–24:00",
                value: "39%",
                width: "four-fifths",
                tone: "green",
              },
              {
                label: "00:00–08:00",
                value: "8%",
                width: "quarter",
                tone: "amber",
              },
            ]}
          />
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
      <DetailDrawer title="林晓舟" meta="用户 ID #28461 · lin.xz@example.edu">
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
      description="用户详情中的三个独立分页面板：订单、经费流水与经费兑换。"
      eyebrow="用户详情"
    >
      <DetailTabs tabs={["订单", "经费流水", "经费兑换"]} active="订单" />
      <DetailTable
        columns={["订单 / 交易号", "类型", "金额", "状态"]}
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
      <div className="grid gap-3 sm:grid-cols-2">
        <DetailSection title="经费流水（充值 / 消费）">
          <DetailTable
            columns={["变动", "余额", "归因"]}
            rows={[
              { id: "credit-1", cells: ["−12.6", "368.0", "智能搜索"] },
              { id: "credit-2", cells: ["+100", "380.6", "后台补发"] },
            ]}
          />
        </DetailSection>
        <DetailSection title="经费兑换">
          <DetailTable
            columns={["兑换码", "权益", "时间"]}
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
        当前对象：林晓舟 ·
        #28461。长周期会员、扣减经费和大额重置次数需再次确认。
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
      <div className="grid gap-3 sm:grid-cols-2">
        <DetailSection title="其他可独立操作">
          <DetailFields
            fields={[
              { label: "增加兑换次数", value: "+2" },
              { label: "修改会员授予时长", value: "90 天", kind: "select" },
            ]}
          />
        </DetailSection>
        <DetailSection title="当前状态">
          <DetailFields
            fields={[
              { label: "已使用 / 上限", value: "0 / 1", kind: "readonly" },
              { label: "停用状态", value: "未停用", kind: "readonly" },
            ]}
          />
        </DetailSection>
      </div>
    </AdminDetailFrame>
  );
}
