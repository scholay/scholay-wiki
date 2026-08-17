import type { ReactNode } from "react";
import {
  Activity,
  CalendarRange,
  Clock3,
  Crown,
  Gift,
  Eye,
  MoreHorizontal,
  Search,
  ShieldAlert,
  UserPlus,
} from "lucide-react";
import {
  AdminMockBadge,
  AdminMockButton,
  AdminMockPage,
} from "./WikiEmbedAdminShared";

const USER_ROWS = [
  {
    title: "林晓舟 · ID 28461",
    detail: "lin.xz@example.edu · 手机与 ORCID 已连接",
    meta: "Max · 今天",
    status: "正常",
    tone: "green" as const,
  },
  {
    title: "周奕辰 · ID 28177",
    detail: "zhou.yc@example.edu · 邮箱已验证",
    meta: "Pro · 8 月 10 日",
    status: "正常",
    tone: "green" as const,
  },
  {
    title: "吴谨言 · ID 27602",
    detail: "wu.jy@example.edu · 最近登录 IP 已记录",
    meta: "Free · 8 月 8 日",
    status: "已冻结",
    tone: "red" as const,
  },
] as const;

/** 用户检索、筛选、聚合详情抽屉 · 纯样式 fixture。 */
export function WikiEmbedAdminUserDirectory() {
  return (
    <AdminMockPage
      fixture="admin-user-directory"
      title="用户管理"
      description="共 28,640 个账号 · 含管理员 · 可筛选 / 管会员 / 冻结 / 删除"
      actions={
        <div className="flex h-8 w-full items-center gap-2 rounded-8 border border-border bg-background px-3 text-14 text-faint sm:w-64">
          <Search className="size-4" />
          搜索 ID / 用户名 / 邮箱 / 手机号
        </div>
      }
    >
      <section className="mb-6 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-24 font-medium text-foreground">用户分析</h3>
          <div className="inline-flex h-8 rounded-pill border border-border bg-background p-1">
            {["7 天", "30 天", "90 天"].map((label) => (
              <span
                key={label}
                className={`inline-flex h-6 items-center rounded-pill px-3 text-14 ${label === "30 天" ? "bg-foreground text-on-dark" : "text-muted-foreground"}`}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <UserMetricChart
            icon={UserPlus}
            title="注册量 · 活跃用户 · 最近 30 天"
            kind="area"
          />
          <UserMetricChart icon={Activity} title="注册渠道占比" kind="donut" />
          <UserMetricChart icon={Clock3} title="24h 活跃时段分布" kind="bars" />
          <UserMetricChart
            icon={CalendarRange}
            title="MAU · 最近 12 个月"
            kind="line"
          />
        </div>
      </section>

      <section className="mb-4 flex flex-wrap items-end gap-2 rounded-8 border border-border-hairline bg-surface-1 p-3">
        {[
          ["角色", "全部", "w-28"],
          ["会员", "全部", "w-24"],
          ["状态", "全部", "w-24"],
          ["邮箱验证", "全部", "w-24"],
          ["注册自", "2026-07-01", "w-32"],
          ["注册至", "2026-08-12", "w-32"],
        ].map(([label, value, width]) => (
          <div key={label}>
            <p className="mb-1 text-12 text-faint">{label}</p>
            <div
              className={`flex h-8 items-center rounded-8 border border-border bg-background px-2 text-14 text-foreground ${width}`}
            >
              {value}
            </div>
          </div>
        ))}
      </section>

      <div className="overflow-hidden rounded-8 border border-border bg-background">
        <div className="grid grid-cols-[minmax(220px,1fr)_100px_150px_90px_140px_36px] border-b border-border bg-surface-1 text-12 font-medium text-faint">
          {["用户", "角色", "会员", "状态", "最近登录", ""].map((label) => (
            <span key={label} className="flex h-9 items-center px-3">
              {label}
            </span>
          ))}
        </div>
        {USER_ROWS.map((row, index) => (
          <div
            key={row.title}
            className={`grid min-w-3xl grid-cols-[minmax(220px,1fr)_100px_150px_90px_140px_36px] ${index < USER_ROWS.length - 1 ? "border-b border-border-hairline" : ""}`}
          >
            <div className="flex h-12 min-w-0 flex-col justify-center px-3">
              <p className="truncate text-16 font-medium text-foreground">
                {row.title}
              </p>
              <p className="truncate text-14 text-faint">
                {row.detail.split(" · ")[0]}
              </p>
            </div>
            <div className="flex h-12 items-center px-3">
              <AdminMockBadge>
                {index === 0 ? "普通用户" : index === 1 ? "运营" : "普通用户"}
              </AdminMockBadge>
            </div>
            <div className="flex h-12 items-center gap-1 px-3 text-14 font-medium text-brand-amber">
              {index < 2 ? <Crown className="size-4" /> : null}
              {index === 0 ? "Max" : index === 1 ? "Pro" : "Free"}
              {index < 2 ? (
                <span className="font-normal text-faint">· 2026-12-31</span>
              ) : null}
            </div>
            <div className="flex h-12 items-center px-3">
              <AdminMockBadge tone={row.tone === "red" ? "red" : "green"}>
                {row.status}
              </AdminMockBadge>
            </div>
            <span className="flex h-12 items-center px-3 text-14 text-muted-foreground">
              {row.meta.split(" · ")[1] ?? row.meta}
            </span>
            <span className="flex h-12 items-center justify-center text-faint">
              <MoreHorizontal className="size-4" />
            </span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between text-14 text-muted-foreground">
        <span>1–20 / 共 28,640 条</span>
        <span className="inline-flex items-center gap-2">
          <span className="rounded-8 border border-border px-3 py-2">
            上一页
          </span>
          第 1 / 1,432 页
          <span className="rounded-8 border border-border px-3 py-2">
            下一页
          </span>
        </span>
      </div>
    </AdminMockPage>
  );
}

function UserMetricChart({
  icon: Icon,
  title,
  kind,
}: {
  icon: typeof Activity;
  title: string;
  kind: "area" | "donut" | "bars" | "line";
}) {
  const points =
    "0,80 35,66 70,73 105,47 140,55 175,29 210,39 245,19 280,31 320,15";
  return (
    <section className="rounded-8 border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-16 font-medium text-foreground">{title}</h4>
        <Icon className="size-4 shrink-0 text-faint" />
      </div>
      <div className="relative mt-3 h-52">
        {kind === "donut" ? (
          <div className="flex h-full items-center justify-center gap-8">
            <div className="relative size-28 rounded-pill bg-[conic-gradient(var(--brand-green)_0_58%,var(--brand-amber)_58%_78%,var(--brand-red)_78%_89%,var(--surface-2)_89%)]">
              <span className="absolute inset-5 rounded-pill bg-background" />
            </div>
            <div className="space-y-2 text-14 text-muted-foreground">
              {["邮箱注册 58%", "Google 20%", "ORCID 11%", "其他 11%"].map(
                (label, index) => (
                  <p key={label} className="flex items-center gap-2">
                    <span
                      className={`size-2 rounded-4 ${index === 0 ? "bg-brand-green" : index === 1 ? "bg-brand-amber" : index === 2 ? "bg-brand-red" : "bg-surface-2"}`}
                    />
                    {label}
                  </p>
                ),
              )}
            </div>
          </div>
        ) : kind === "bars" ? (
          <div className="flex h-full items-end gap-2 border-b border-border px-2 pb-4">
            {[
              34, 28, 20, 18, 24, 42, 67, 74, 62, 70, 84, 78, 69, 65, 72, 88,
              92, 76, 68, 61, 54, 48, 43, 38,
            ].map((height, index) => (
              <span
                key={index}
                className="min-w-0 flex-1 bg-brand-green"
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
        ) : (
          <svg
            viewBox="0 0 320 100"
            className="h-full w-full"
            preserveAspectRatio="none"
          >
            {[20, 50, 80].map((y) => (
              <line
                key={y}
                x1="0"
                y1={y}
                x2="320"
                y2={y}
                stroke="var(--border)"
                strokeDasharray="3 3"
              />
            ))}
            {kind === "area" ? (
              <polygon
                points={`${points} 320,100 0,100`}
                fill="var(--brand-green)"
                fillOpacity="0.12"
              />
            ) : null}
            <polyline
              points={points}
              fill="none"
              stroke="var(--brand-green)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
            {kind === "area" ? (
              <polyline
                points="0,72 35,62 70,67 105,58 140,38 175,46 210,26 245,34 280,17 320,22"
                fill="none"
                stroke="var(--brand-amber)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
          </svg>
        )}
      </div>
    </section>
  );
}

/** 冻结、解冻、删除与角色委派的高风险动作 · 纯样式 fixture。 */
export function WikiEmbedAdminUserLifecycle() {
  return (
    <AdminMockPage
      fixture="admin-user-lifecycle"
      title="用户管理"
      description="在用户列表核对身份后，从行末菜单执行账号或角色动作"
      actions={
        <div className="flex h-8 w-64 items-center gap-2 rounded-8 border border-border bg-background px-3 text-14 text-faint">
          <Search className="size-4" /> 搜索 ID / 用户名 / 邮箱 / 手机号
        </div>
      }
    >
      <section className="rounded-8 border border-border bg-background">
        <div className="grid grid-cols-[minmax(220px,1fr)_110px_160px_90px_150px_60px] border-b border-border bg-surface-1 text-12 font-medium text-faint">
          {["用户", "角色", "会员", "状态", "最近登录", ""].map((label) => (
            <span key={label} className="flex h-9 items-center px-3">
              {label}
            </span>
          ))}
        </div>
        <div className="relative grid min-w-3xl grid-cols-[minmax(220px,1fr)_110px_160px_90px_150px_60px]">
          <div className="flex h-14 flex-col justify-center px-3">
            <p className="text-16 font-medium text-foreground">
              林晓舟{" "}
              <span className="font-mono text-12 text-faint">ID 28461</span>
            </p>
            <p className="text-14 text-faint">lin.xz@example.edu</p>
          </div>
          <span className="flex h-14 items-center px-3">
            <AdminMockBadge>普通用户</AdminMockBadge>
          </span>
          <span className="flex h-14 items-center gap-1 px-3 text-14 font-medium text-brand-red">
            <Crown className="size-4" /> Max · 2026-12-31
          </span>
          <span className="flex h-14 items-center px-3">
            <AdminMockBadge tone="green">正常</AdminMockBadge>
          </span>
          <span className="flex h-14 items-center px-3 text-14 text-muted-foreground">
            2026-08-12 10:18
          </span>
          <span className="flex h-14 items-center justify-center text-foreground">
            <MoreHorizontal className="size-4" />
          </span>

          <aside className="absolute right-3 top-10 z-popover w-56 overflow-hidden rounded-8 border border-border bg-background py-2 shadow-raised">
            {[
              ["查看详情 / 会员", "neutral"],
              ["复制用户 ID", "neutral"],
              ["冻结账号", "neutral"],
              ["设为运营", "neutral"],
              ["设为管理员", "neutral"],
              ["删除账号", "red"],
            ].map(([label, tone], index) => (
              <div
                key={label}
                className={`flex h-9 items-center gap-2 px-3 text-14 ${index === 2 || index === 5 ? "border-t border-border-hairline" : ""} ${tone === "red" ? "text-brand-red" : "text-foreground"}`}
              >
                {label}
              </div>
            ))}
          </aside>
        </div>
      </section>
      <div className="mt-20 flex items-start gap-2 rounded-8 border border-brand-amber/30 bg-brand-amber-soft px-3 py-2 text-14 leading-paragraph text-muted-foreground">
        <ShieldAlert className="mt-1 size-4 shrink-0 text-brand-amber" />
        冻结会撤销全部访问令牌，解冻不会恢复旧令牌；删除前还需要输入
        DELETE。角色委派只向具有相应权限的管理员显示。
      </div>
    </AdminMockPage>
  );
}

/** 单用户会员、Credit 与 Reset Pass 补偿面板 · 纯样式 fixture。 */
export function WikiEmbedAdminEntitlementGrants() {
  return (
    <AdminMockPage
      fixture="admin-entitlement-grants"
      title="用户详情"
      description="林晓舟 · ID 28461 · 会员与账户权益"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,420px)]">
        <section className="rounded-8 border border-border bg-background p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["当前会员", "Free"],
              ["科研经费", "36（100 经费 = ¥1）"],
              ["重置次数", "2 次"],
              ["最近交易", "管理员补偿 · 2026-08-10"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-8 bg-surface-1 p-3">
                <p className="text-12 text-faint">{label}</p>
                <p className="mt-1 text-16 font-medium text-foreground">
                  {value}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-14 leading-paragraph text-muted-foreground">
            发放动作位于用户详情抽屉底部。三个区块分别提交，避免把会员、经费与重置次数误当成同一种余额。
          </p>
        </section>

        <aside className="rounded-8 border border-border bg-background p-4">
          <div className="flex items-center justify-between rounded-8 border border-border bg-surface-1 px-3 py-2 text-14">
            <span className="text-faint">当前会员</span>
            <span className="font-medium text-foreground">Free</span>
          </div>

          <section className="mt-4 space-y-3">
            <p className="text-12 text-faint">发放 / 续期会员</p>
            <div className="flex flex-wrap gap-2">
              <AdminMockButton>Pro</AdminMockButton>
              <AdminMockButton tone="outline">Max</AdminMockButton>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StaticInput value="3" width="w-16" />
              {[
                ["天", false],
                ["月", true],
                ["年", false],
              ].map(([label, active]) => (
                <span
                  key={label as string}
                  className={`inline-flex h-8 items-center rounded-8 border px-3 text-14 ${active ? "border-foreground bg-foreground text-on-dark" : "border-border bg-background text-foreground"}`}
                >
                  {label as string}
                </span>
              ))}
            </div>
            <p className="text-12 leading-paragraph text-faint">
              发放时长直接决定到期日；周期标识只决定用户端徽标。
            </p>
            <div className="flex gap-2">
              <AdminMockButton>授予 3 个月 Pro</AdminMockButton>
              <AdminMockButton tone="outline">取消会员</AdminMockButton>
            </div>
          </section>

          <section className="mt-4 space-y-3 border-t border-border-hairline pt-3">
            <p className="text-12 text-faint">调整科研经费</p>
            <div className="flex items-center gap-2">
              <StaticInput value="100" width="w-24" />
              <span className="text-12 text-faint">100 经费 = ¥1</span>
            </div>
            <StaticInput value="备注：内测问题补偿" />
            <div className="flex gap-2">
              <AdminMockButton>发放 100</AdminMockButton>
              <AdminMockButton tone="outline">扣减</AdminMockButton>
            </div>
            <p className="text-12 leading-paragraph text-faint">
              经费长期有效；当前不再区分临时与永久，提交后写入经费流水。
            </p>
          </section>

          <section className="mt-4 space-y-3 border-t border-border-hairline pt-3">
            <p className="text-12 text-faint">发放重置次数</p>
            <div className="flex items-center gap-2">
              <StaticInput value="5" width="w-20" />
              <span className="text-12 text-faint">次，有效期</span>
              <StaticInput value="30" width="w-20" />
              <span className="text-12 text-faint">天</span>
            </div>
            <AdminMockButton>发放重置次数</AdminMockButton>
          </section>
        </aside>
      </div>
    </AdminMockPage>
  );
}

/** 会员 / 经费兑换码批次与批次明细 · 纯样式 fixture。 */
export function WikiEmbedAdminGiftCodes() {
  return (
    <AdminMockPage
      fixture="admin-gift-codes"
      title="会员兑换码"
      description="共 3 个生成批次 · 点击批次查看、复制或导出全部兑换码"
    >
      <section className="mb-4 rounded-8 border border-border bg-background p-4">
        <div className="mb-3">
          <h3 className="flex items-center gap-2 text-16 font-medium text-foreground">
            <Gift className="size-4" /> 生成新批次
          </h3>
          <p className="mt-1 text-12 text-faint">
            每次生成都会创建独立批次；新码示例 K7Q9-2XMP-R4TV-8WCD，固定为 4×4
            格式并排除易混字符。
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <LabeledInput label="数量" value="10" width="w-24" />
          <LabeledInput label="发放类型" value="会员" width="w-24" />
          <LabeledInput label="等级" value="Pro" width="w-24" />
          <div>
            <p className="mb-1 text-12 text-faint">授予时长</p>
            <div className="flex gap-2">
              <StaticInput value="30" width="w-20" />
              <StaticInput value="天" width="w-20" />
            </div>
          </div>
          <LabeledInput label="每码兑换次数" value="1" width="w-24" />
          <LabeledInput label="兑换码有效天数" value="7" width="w-24" />
          <LabeledInput label="批次备注" value="内测邀请" width="w-40" />
          <AdminMockButton>生成批次</AdminMockButton>
        </div>
      </section>

      <section className="mb-4 flex flex-wrap items-end gap-2 rounded-8 border border-border-hairline bg-surface-1 p-3">
        <LabeledInput
          label="批次搜索"
          value="批次号 / 备注"
          width="w-52"
          muted
        />
        <LabeledInput label="发放类型" value="全部" width="w-28" />
        <LabeledInput label="会员等级" value="全部" width="w-24" />
      </section>

      <StaticAdminTable
        columns={[
          "批次号",
          "发放内容",
          "码数",
          "状态分布",
          "兑换次数",
          "备注",
          "创建人",
          "生成时间",
          "操作",
        ]}
        template="190px 160px 70px 300px 100px minmax(120px,1fr) 120px 140px 92px"
        minWidth={1290}
        rows={[
          [
            <span key="batch" className="font-mono text-14 text-foreground">
              7f3a8e4c-2b91-4d6f-9a20-c8e1f547b632
            </span>,
            <AdminMockBadge key="content" tone="green">
              Pro · 30 天
            </AdminMockBadge>,
            "20",
            <div key="status" className="flex flex-wrap gap-2">
              <AdminMockBadge tone="green">20 可用</AdminMockBadge>
              <AdminMockBadge>0 已用完</AdminMockBadge>
              <AdminMockBadge>0 已停用</AdminMockBadge>
            </div>,
            "0 / 20",
            "内测邀请",
            "运营 · #8",
            "2026-08-12 10:15",
            <AdminMockButton key="view" tone="outline">
              <Eye className="size-4" />
              查看
            </AdminMockButton>,
          ],
          [
            <span key="batch" className="font-mono text-14 text-foreground">
              c184d796-6f32-4b0a-8de1-42a9f765bc10
            </span>,
            <AdminMockBadge key="content" tone="amber">
              经费 100
            </AdminMockBadge>,
            "10",
            <div key="status" className="flex flex-wrap gap-2">
              <AdminMockBadge tone="green">4 可用</AdminMockBadge>
              <AdminMockBadge tone="amber">6 已用完</AdminMockBadge>
            </div>,
            "6 / 10",
            "活动补偿",
            "运营 · #8",
            "2026-08-11 16:40",
            <AdminMockButton key="view" tone="outline">
              <Eye className="size-4" />
              查看
            </AdminMockButton>,
          ],
          [
            <span key="batch" className="font-mono text-14 text-foreground">
              2a6d90ef-8c51-4f73-b620-1e9c47a358db
            </span>,
            <AdminMockBadge key="content" tone="red">
              Max · 90 天
            </AdminMockBadge>,
            "8",
            <div key="status" className="flex flex-wrap gap-2">
              <AdminMockBadge>0 可用</AdminMockBadge>
              <AdminMockBadge>8 已用完</AdminMockBadge>
            </div>,
            "8 / 8",
            "合作院校",
            "系统 / 历史",
            "2026-08-08 09:20",
            <AdminMockButton key="view" tone="outline">
              <Eye className="size-4" />
              查看
            </AdminMockButton>,
          ],
        ]}
      />
      <div className="mt-4 flex items-center justify-between text-14 text-muted-foreground">
        <span>1–3 / 共 3 个批次</span>
        <span>第 1 / 1 页</span>
      </div>
      <p className="mt-4 text-14 leading-paragraph text-muted-foreground">
        每行代表一个生成批次；完整兑换码和单码停用、延期、增加次数操作都在批次详情抽屉中。
      </p>
    </AdminMockPage>
  );
}

/** 用户端订单、支付状态、履约与退款观察面 · 纯样式 fixture。 */
export function WikiEmbedAdminOrders() {
  return (
    <AdminMockPage
      fixture="admin-orders"
      title="订单与营收"
      description="充值 / 订阅订单与营收统计 · 同组：会员兑换码 · 计费配置"
    >
      <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <PeriodCard
          title="营收（毛 / 退 / 净）"
          wide
          columns={["毛额", "退款", "净额"]}
          rows={[
            ["今日", "¥8,420", "¥269", "¥8,151"],
            ["近30天", "¥126,580", "¥1,128", "¥125,452"],
            ["全部", "¥829,600", "¥8,420", "¥821,180"],
          ]}
        />
        <PeriodCard
          title="营收构成"
          columns={["充值", "订阅"]}
          rows={[
            ["今日", "¥2,680", "¥5,740"],
            ["近30天", "¥40,506", "¥86,074"],
            ["全部", "¥264,200", "¥565,400"],
          ]}
        />
        <PeriodCard
          title="已支付订单"
          rows={[
            ["今日", "42"],
            ["近30天", "1,284"],
            ["全部", "8,946"],
          ]}
          footer="窗口内待支付 72 · 已过期 19"
        />
        <PeriodCard
          title="兑换码核销"
          rows={[
            ["今日", "18"],
            ["近30天", "486"],
            ["全部", "3,260"],
          ]}
        />
      </section>

      <section className="mb-4 rounded-8 border border-border bg-background p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-16 font-medium text-foreground">
              每日营收 · 近 30 天
            </h3>
            <p className="mt-1 text-12 text-faint">
              区间毛额 ¥126,580 · 充值 ¥40,506 · 订阅 ¥86,074
            </p>
          </div>
          <div className="inline-flex rounded-pill border border-border p-1">
            {["7 天", "30 天", "90 天"].map((label) => (
              <span
                key={label}
                className={`inline-flex h-7 items-center rounded-pill px-3 text-14 ${label === "30 天" ? "bg-foreground text-on-dark" : "text-muted-foreground"}`}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
        <svg
          viewBox="0 0 760 160"
          className="mt-3 h-48 w-full"
          preserveAspectRatio="none"
        >
          {[30, 70, 110, 150].map((y) => (
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
            points="0,140 70,122 140,128 210,96 280,110 350,70 420,82 490,51 560,64 630,28 700,42 760,22 760,160 0,160"
            fill="var(--brand-green)"
            fillOpacity="0.16"
          />
          <polygon
            points="0,150 70,140 140,142 210,124 280,132 350,105 420,113 490,88 560,98 630,72 700,80 760,58 760,160 0,160"
            fill="var(--brand-red)"
            fillOpacity="0.14"
          />
          <polyline
            points="0,140 70,122 140,128 210,96 280,110 350,70 420,82 490,51 560,64 630,28 700,42 760,22"
            fill="none"
            stroke="var(--brand-green)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            points="0,150 70,140 140,142 210,124 280,132 350,105 420,113 490,88 560,98 630,72 700,80 760,58"
            fill="none"
            stroke="var(--brand-red)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </section>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {["全部状态", "已支付", "待支付", "已过期"].map((label) => (
          <span
            key={label}
            className={`inline-flex h-8 items-center rounded-8 border px-3 text-14 ${label === "全部状态" ? "border-foreground bg-foreground text-on-dark" : "border-border bg-background text-foreground"}`}
          >
            {label}
          </span>
        ))}
        <span className="h-4 w-px bg-border" />
        {["全部类型", "充值", "订阅"].map((label) => (
          <span
            key={label}
            className="inline-flex h-8 items-center rounded-8 border border-border bg-background px-3 text-14 text-foreground"
          >
            {label}
          </span>
        ))}
        <div className="ml-auto flex h-8 w-72 items-center rounded-8 border border-border bg-background px-3 text-14 text-faint">
          用户 ID / 用户名 / 邮箱 / 手机号（暂不支持订单号）
        </div>
      </div>

      <StaticAdminTable
        columns={[
          "时间",
          "用户",
          "订单",
          "类型",
          "金额",
          "经费",
          "状态",
          "支付",
        ]}
        template="150px 180px minmax(220px,1fr) 100px 90px 80px 100px 150px"
        minWidth={1070}
        rows={[
          [
            "2026-08-12 10:24",
            "林晓舟 · ID 28461",
            <div key="order">
              <p className="text-14 font-medium text-foreground">
                Max 月度会员
              </p>
              <p className="font-mono text-12 text-faint">ORD-20260812-0842</p>
            </div>,
            <AdminMockBadge key="type" tone="green">
              订阅
            </AdminMockBadge>,
            "¥269.00",
            "0",
            <AdminMockBadge key="status" tone="green">
              已支付
            </AdminMockBadge>,
            "微信支付 · 10:25",
          ],
          [
            "2026-08-12 09:48",
            "周奕辰 · ID 28177",
            <div key="order">
              <p className="text-14 font-medium text-foreground">经费充值</p>
              <p className="font-mono text-12 text-faint">ORD-20260812-0796</p>
            </div>,
            <AdminMockBadge key="type">充值</AdminMockBadge>,
            "¥100.00",
            "10,000",
            <AdminMockBadge key="status" tone="amber">
              待支付
            </AdminMockBadge>,
            "—",
          ],
          [
            "2026-08-11 16:18",
            "吴谨言 · ID 27602",
            <div key="order">
              <p className="text-14 font-medium text-foreground">
                Pro 年度会员
              </p>
              <p className="font-mono text-12 text-faint">ORD-20260811-0618</p>
            </div>,
            <div key="type" className="flex gap-2">
              <AdminMockBadge tone="green">订阅</AdminMockBadge>
              <AdminMockBadge tone="amber">年度</AdminMockBadge>
            </div>,
            "¥590.00",
            "0",
            <div key="status" className="flex flex-col gap-1">
              <AdminMockBadge tone="green">已支付</AdminMockBadge>
              <AdminMockBadge tone="red">已全额退款</AdminMockBadge>
            </div>,
            "微信支付 · 16:19",
          ],
        ]}
      />
      <p className="mt-4 text-14 leading-paragraph text-muted-foreground">
        主状态只使用已支付、待支付、已过期；退款作为已支付订单的附加记录展示，不重写历史营收归属。
      </p>
    </AdminMockPage>
  );
}

function StaticInput({
  value,
  width = "w-full",
}: {
  value: string;
  width?: string;
}) {
  return (
    <span
      className={`flex h-8 items-center rounded-8 border border-border bg-background px-3 text-14 text-foreground ${width}`}
    >
      {value}
    </span>
  );
}

function LabeledInput({
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

function StaticAdminTable({
  columns,
  rows,
  template,
  minWidth,
}: {
  columns: readonly string[];
  rows: readonly (readonly ReactNode[])[];
  template: string;
  minWidth: number;
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

function PeriodCard({
  title,
  columns = [],
  rows,
  footer,
  wide = false,
}: {
  title: string;
  columns?: readonly string[];
  rows: readonly (readonly string[])[];
  footer?: string;
  wide?: boolean;
}) {
  const values = Math.max(1, columns.length);
  return (
    <section
      className={`rounded-8 border border-border bg-background p-4 ${wide ? "lg:col-span-2" : ""}`}
    >
      <h3 className="text-16 font-medium text-foreground">{title}</h3>
      {columns.length ? (
        <div
          className="mt-3 grid gap-2 text-right text-12 text-faint"
          style={{
            gridTemplateColumns: `auto repeat(${values}, minmax(0, 1fr))`,
          }}
        >
          <span />
          {columns.map((column) => (
            <span key={column}>{column}</span>
          ))}
        </div>
      ) : null}
      <div className="mt-2 space-y-2">
        {rows.map(([period, ...rowValues]) => (
          <div
            key={period}
            className="grid gap-2 text-14 tabular-nums"
            style={{
              gridTemplateColumns: `auto repeat(${Math.max(1, rowValues.length)}, minmax(0, 1fr))`,
            }}
          >
            <span className="text-faint">{period}</span>
            {rowValues.map((value) => (
              <span
                key={value}
                className="text-right font-medium text-foreground"
              >
                {value}
              </span>
            ))}
          </div>
        ))}
      </div>
      {footer ? <p className="mt-3 text-12 text-faint">{footer}</p> : null}
    </section>
  );
}
