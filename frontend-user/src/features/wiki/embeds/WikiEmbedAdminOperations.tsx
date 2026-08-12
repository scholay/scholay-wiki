import type { ReactNode } from "react";
import {
  CalendarRange,
  CheckCircle2,
  Coins,
  Headset,
  Inbox,
  Mail,
  MailCheck,
  MessageSquare,
  PenLine,
  RefreshCw,
  Reply,
  ScanEye,
  Send,
  Users,
  UserPlus,
  XCircle,
} from "lucide-react";
import {
  AdminMockBadge,
  AdminMockButton,
  AdminMockPage,
  AdminMockTabs,
} from "./WikiEmbedAdminShared";

/** 反馈检索、详情、附件与回复状态 · 纯样式 fixture。 */
export function WikiEmbedAdminFeedback() {
  return (
    <AdminMockPage
      fixture="admin-feedback"
      title="用户反馈"
      description="共 126 条反馈 · 可分配、回复、关闭"
      tabs={
        <div className="flex flex-wrap gap-1">
          {["全部", "待处理", "处理中", "已回复", "已关闭"].map((label) => (
            <span
              key={label}
              className={`inline-flex h-8 items-center rounded-8 border px-3 text-14 font-medium ${label === "待处理" ? "border-foreground bg-foreground text-on-dark" : "border-border bg-background text-foreground"}`}
            >
              {label}
            </span>
          ))}
        </div>
      }
    >
      <div className="mb-4 flex h-9 w-full max-w-sm items-center gap-2 rounded-8 border border-border bg-background px-3 text-14 text-faint">
        <ScanEye className="size-4" />
        搜索 ID / 用户名 / 邮箱 / 反馈内容
      </div>
      <div className="overflow-hidden rounded-8 border border-border bg-background">
        <div className="grid grid-cols-[180px_100px_minmax(260px,1fr)_90px_120px_130px_100px] border-b border-border bg-surface-1 text-12 font-medium text-faint">
          {["用户", "分类", "内容", "状态", "负责人", "时间", ""].map(
            (label) => (
              <span key={label} className="flex h-9 items-center px-3">
                {label}
              </span>
            ),
          )}
        </div>
        {[
          {
            user: "林晓舟 · ID 28461",
            category: "问题报告",
            content: "PDF 解析后公式显示错位，已附 2 张截图。",
            status: "待处理",
            assignee: "未分配",
            time: "2026-08-12 10:20",
            tone: "red" as const,
          },
          {
            user: "周奕辰 · ID 28177",
            category: "功能建议",
            content: "希望支持新的引用格式，并保留自定义 CSL。",
            status: "已回复",
            assignee: "陈老师",
            time: "2026-08-11 16:42",
            tone: "green" as const,
          },
          {
            user: "未登录用户",
            category: "问题报告",
            content: "移动端搜索筛选后无法返回上一层。",
            status: "已关闭",
            assignee: "王珂",
            time: "2026-08-09 09:08",
            tone: "neutral" as const,
          },
        ].map((row, index) => (
          <div
            key={row.content}
            className={`grid min-w-5xl grid-cols-[180px_100px_minmax(260px,1fr)_90px_120px_130px_100px] ${index < 2 ? "border-b border-border-hairline" : ""}`}
          >
            <div className="flex h-12 flex-col justify-center px-3">
              <p className="text-16 font-medium text-foreground">{row.user}</p>
              <p className="text-14 text-faint">lin.xz@example.edu</p>
            </div>
            <span className="flex h-12 items-center px-3">
              <AdminMockBadge>{row.category}</AdminMockBadge>
            </span>
            <span className="line-clamp-2 flex h-12 items-center px-3 text-14 text-subtle">
              {row.content}
            </span>
            <span className="flex h-12 items-center px-3">
              <AdminMockBadge tone={row.tone}>{row.status}</AdminMockBadge>
            </span>
            <span className="flex h-12 items-center px-3 text-14 text-muted-foreground">
              {row.assignee}
            </span>
            <span className="flex h-12 items-center px-3 text-12 text-faint">
              {row.time}
            </span>
            <span className="flex h-12 items-center justify-end px-3">
              <AdminMockButton tone="outline">
                <MessageSquare className="size-4" /> 处理
              </AdminMockButton>
            </span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between text-14 text-muted-foreground">
        <span>1–20 / 共 126 条</span>
        <span>第 1 / 7 页 · 下一页 →</span>
      </div>
      <div className="mt-4 rounded-8 border border-brand-amber/30 bg-brand-amber-soft px-3 py-2 text-14 leading-paragraph text-muted-foreground">
        当前没有管理员指派路由；数据库中的 assignee 字段不等于完整工单队列。
      </div>
    </AdminMockPage>
  );
}

/** IMAP 收件、SMTP 回复、客服配置与发送日志 · 纯样式 fixture。 */
export function WikiEmbedAdminMailSupport() {
  return (
    <AdminMockPage
      fixture="admin-mail-support"
      title="邮件中心"
      description="客服邮箱收件箱 · 未读 18 封 · 收/发信配置见「客服配置」"
      actions={
        <div className="flex gap-2">
          <AdminMockButton tone="outline">
            <RefreshCw className="size-4" /> 立即拉取
          </AdminMockButton>
          <AdminMockButton>
            <PenLine className="size-4" /> 写邮件
          </AdminMockButton>
        </div>
      }
    >
      <section className="mb-4 flex flex-wrap items-center gap-2">
        <AdminMockTabs
          items={["全部", "未读", "已读", "已回复"]}
          active="全部"
        />
        <OperationsField value="发件人 / 主题" width="w-56" muted />
      </section>

      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="overflow-hidden rounded-8 border border-border bg-background">
            {[
              [
                "林晓舟",
                "会员权益到账问题",
                "套餐已支付，但 Max 仍未显示……",
                "08-12 10:06",
                true,
              ],
              [
                "高校科研办公室",
                "合作咨询：机构账号",
                "希望了解批量开通与管理权限。",
                "08-12 09:42",
                false,
              ],
              [
                "周奕辰",
                "验证码邮件未收到",
                "连续尝试后仍没有收到验证码。",
                "08-11 18:20",
                false,
              ],
            ].map(([sender, subject, snippet, time, unread], index) => (
              <div
                key={subject as string}
                className={`px-3 py-3 ${index === 0 ? "bg-surface-2" : ""} ${index < 2 ? "border-b border-border-hairline" : ""}`}
              >
                <div className="flex items-center gap-2">
                  {unread ? (
                    <span className="size-2 shrink-0 rounded-pill bg-brand-red" />
                  ) : null}
                  <span className="min-w-0 flex-1 truncate text-14 font-medium text-foreground">
                    {sender as string}
                  </span>
                  <span className="text-12 tabular-nums text-faint">
                    {time as string}
                  </span>
                </div>
                <p className="mt-1 truncate text-14 text-foreground">
                  {subject as string}
                </p>
                <p className="mt-1 truncate text-12 text-faint">
                  {snippet as string}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-12 text-faint">1–3 / 共 84 封</p>
        </div>

        <section className="min-h-80 rounded-8 border border-border bg-background">
          <div className="border-b border-border px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-16 font-medium text-foreground">
                  会员权益到账问题
                </h3>
                <p className="mt-1 text-12 text-faint">
                  林晓舟 &lt;lin.xz@example.edu&gt; · 2026-08-12 10:06
                </p>
              </div>
              <AdminMockBadge tone="amber">未读</AdminMockBadge>
            </div>
          </div>
          <div className="min-h-44 px-4 py-4 text-14 leading-paragraph text-muted-foreground">
            您好，我今天通过微信支付购买了 Max 月度会员，订单号
            ORD-20260812-0842。支付成功后账户仍显示 Free，请协助核对，谢谢。
          </div>
          <div className="border-t border-border p-4">
            <p className="mb-2 text-12 text-faint">回复此邮件</p>
            <div className="min-h-20 rounded-8 border border-border bg-surface-1 p-3 text-14 text-faint">
              输入回复内容……
            </div>
            <div className="mt-3 flex justify-end">
              <AdminMockButton>
                <Reply className="size-4" /> 发送回复
              </AdminMockButton>
            </div>
          </div>
        </section>
      </div>
      <p className="mt-4 text-14 leading-paragraph text-muted-foreground">
        HTML 来信在 sandbox 中预览；本页是客服邮箱客户端，不承担系统通知重试。
      </p>
    </AdminMockPage>
  );
}

/** AI 会话与智能审稿记录的只读排障面 · 纯样式 fixture。 */
export function WikiEmbedAdminSessionMonitoring() {
  return (
    <AdminMockPage
      fixture="admin-session-monitoring"
      title="用户会话监控"
      description="内测期定位用户问题 —— 各功能下用户的 AI 会话 / 审稿数据（只读）"
      tabs={
        <AdminMockTabs
          items={["智能搜索", "智能助手", "智能写作", "智能审稿"]}
          active="智能助手"
        />
      }
    >
      <OperationsField value="ID / 用户名 / 邮箱 / 手机号" width="w-64" muted />
      <div className="mt-3">
        <OperationsTable
          columns={["用户", "会话 ID", "归属", "最近活跃", ""]}
          template="220px minmax(220px,1fr) 130px 140px 120px"
          minWidth={830}
          rows={[
            [
              <UserIdentity
                key="user"
                name="林晓舟"
                detail="ID 28461 · lin.xz@example.edu"
              />,
              <span key="id" className="font-mono text-12">
                sess_claw_8f2a…
              </span>,
              "project ID 941",
              "今天 10:12",
              <AdminMockButton key="view" tone="outline">
                <ScanEye className="size-4" /> 查看会话
              </AdminMockButton>,
            ],
            [
              <UserIdentity
                key="user"
                name="周奕辰"
                detail="ID 28177 · zhou.yc@example.edu"
              />,
              <span key="id" className="font-mono text-12">
                sess_claw_6c91…
              </span>,
              "conversation ID 638",
              "今天 09:08",
              <AdminMockButton key="view" tone="outline">
                <ScanEye className="size-4" /> 查看会话
              </AdminMockButton>,
            ],
            [
              <UserIdentity
                key="user"
                name="吴谨言"
                detail="ID 27602 · wu.jy@example.edu"
              />,
              <span key="id" className="font-mono text-12">
                sess_claw_3a74…
              </span>,
              "—",
              "昨天 18:42",
              <AdminMockButton key="view" tone="outline">
                <ScanEye className="size-4" /> 查看会话
              </AdminMockButton>,
            ],
          ]}
        />
      </div>
      <div className="mt-3 flex items-center justify-between text-12 text-faint">
        <span>1–20 / 共 184 条</span>
        <span>第 1 / 10 页</span>
      </div>
      <p className="mt-4 text-14 leading-paragraph text-muted-foreground">
        会话详情沿用用户端消息渲染，但没有继续对话或改写入口；记录可能包含未发表研究材料。
      </p>
    </AdminMockPage>
  );
}

/** 邀请打开、注册、奖励和历史规则快照 · 纯样式 fixture。 */
export function WikiEmbedAdminInviteAnalytics() {
  return (
    <AdminMockPage
      fixture="admin-invite-analytics"
      title="邀请监控"
      description="邀请码的生成 / 链接打开 / 注册归因：谁在拉新、拉来了谁"
    >
      <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <OperationsKpi
          icon={<Users className="size-4" />}
          label="生成邀请人数"
          value="4,286"
        />
        <OperationsKpi
          icon={<ScanEye className="size-4" />}
          label="链接总打开"
          value="38,420"
        />
        <OperationsKpi
          icon={<UserPlus className="size-4" />}
          label="成功注册总数"
          value="6,842"
          note="占打开 17.8%"
        />
        <OperationsKpi
          icon={<CalendarRange className="size-4" />}
          label="近 7 天注册"
          value="1,126"
        />
        <OperationsKpi
          icon={<Coins className="size-4" />}
          label="累计发放总奖励"
          value="¥18,640"
          note="1,864,000 经费 · 含注册礼与首单返利"
        />
      </section>
      <div className="mb-4">
        <OperationsField
          value="搜索邀请人邮箱 / 名称 / 邀请码"
          width="w-80"
          muted
        />
      </div>
      <OperationsTable
        columns={[
          "邀请人",
          "邀请码",
          "生成时间",
          "打开次数",
          "成功注册",
          "累计发放",
          "转化率",
          "",
        ]}
        template="minmax(210px,1fr) 130px 130px 90px 90px 110px 80px 110px"
        minWidth={1050}
        rows={[
          [
            <UserIdentity
              key="user"
              name="林晓舟"
              detail="ID 28461 · lin.xz@example.edu"
            />,
            <span key="code" className="font-mono text-12 text-foreground">
              INV-28461
            </span>,
            "2026-05-18",
            "3,820",
            <span key="registered" className="font-medium text-brand-green">
              842
            </span>,
            <span key="reward" title="842,000 经费 · 100 经费 = ¥1">
              842,000
            </span>,
            "22.0%",
            <AdminMockButton key="detail" tone="outline">
              被邀清单 →
            </AdminMockButton>,
          ],
          [
            <UserIdentity
              key="user"
              name="周奕辰"
              detail="ID 28177 · zhou.yc@example.edu"
            />,
            <span key="code" className="font-mono text-12 text-foreground">
              INV-28177
            </span>,
            "2026-04-03",
            "2,164",
            <span key="registered" className="font-medium text-brand-green">
              306
            </span>,
            "294,400",
            "14.1%",
            <AdminMockButton key="detail" tone="outline">
              被邀清单 →
            </AdminMockButton>,
          ],
        ]}
      />
      <p className="mt-4 text-14 leading-paragraph text-muted-foreground">
        历史邀请关系使用创建时的规则快照；当前活动配置不能反推过去奖励或退款冲销。
      </p>
    </AdminMockPage>
  );
}

/** 发送通道成功、失败与错误记录 · 纯样式 fixture。 */
export function WikiEmbedAdminDeliveryLogs() {
  return (
    <AdminMockPage
      fixture="admin-delivery-logs"
      title="发送记录"
      description="全站邮件 + 短信的发送记录：成功 / 失败 / 报错 / 收件地址 / 主题 / 时间"
    >
      <AdminMockTabs items={["邮件", "短信"]} active="邮件" />
      <section className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <OperationsKpi
          icon={<Mail className="size-4" />}
          label="累计发送"
          value="84,260"
        />
        <OperationsKpi
          icon={<CheckCircle2 className="size-4" />}
          label="成功"
          value="83,178"
        />
        <OperationsKpi
          icon={<XCircle className="size-4" />}
          label="失败"
          value="1,082"
        />
      </section>
      <section className="mb-4 flex flex-wrap items-end gap-2 rounded-8 border border-border-hairline bg-surface-1 p-3">
        <OperationsField label="状态" value="全部" width="w-24" />
        <OperationsField label="类别" value="全部" width="w-28" />
        <OperationsField
          label="搜索（收件人 / 主题）"
          value="邮箱地址或主题关键词"
          width="w-64"
          muted
        />
      </section>
      <OperationsTable
        columns={[
          "状态",
          "收件人",
          "主题",
          "类别",
          "发件人",
          "报错",
          "发送时间",
        ]}
        template="70px 170px minmax(210px,1fr) 70px 150px 200px 150px"
        minWidth={1020}
        rows={[
          [
            <AdminMockBadge key="status" tone="green">
              成功
            </AdminMockBadge>,
            <span key="to" className="font-mono text-12 text-foreground">
              lin.xz@example.edu
            </span>,
            "会员权益到账通知",
            "会员",
            "support@scholay.com",
            "—",
            "2026-08-12 10:02",
          ],
          [
            <AdminMockBadge key="status" tone="green">
              成功
            </AdminMockBadge>,
            <span key="to" className="font-mono text-12 text-foreground">
              zhou.yc@example.edu
            </span>,
            "反馈回复",
            "反馈",
            "support@scholay.com",
            "—",
            "2026-08-12 09:45",
          ],
          [
            <AdminMockBadge key="status" tone="red">
              失败
            </AdminMockBadge>,
            <span key="to" className="font-mono text-12 text-foreground">
              invalid@example.edu
            </span>,
            "邮箱验证码",
            "验证码",
            "noreply@scholay.com",
            <span key="error" className="text-brand-red">
              mailbox rejected
            </span>,
            "2026-08-11 18:20",
          ],
        ]}
      />
    </AdminMockPage>
  );
}

/** 客服公开联系方式、IMAP、SMTP 与通知通道 · 纯样式 fixture。 */
export function WikiEmbedAdminSupportConfig() {
  return (
    <AdminMockPage
      fixture="admin-support-config"
      title="客服配置"
      description="用户端联系方式展示 · 客服邮箱收件（IMAP）· 飞书通知"
      actions={<AdminMockButton>保存全部</AdminMockButton>}
    >
      <div className="flex max-w-3xl flex-col gap-6">
        <SupportSection
          icon={<Headset className="size-4" />}
          title="联系方式展示（用户端 /contact）"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <OperationsField label="产品支持邮箱" value="support@scholay.com" />
            <OperationsField label="商务合作邮箱" value="hello@scholay.com" />
          </div>
          <OperationsField
            label="联系说明（可空，展示在渠道卡下方）"
            value="工作日 09:00–18:00 在线"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ["企业微信二维码", "已上传"],
              ["飞书二维码", "未设置"],
            ].map(([label, state]) => (
              <div key={label}>
                <p className="mb-1 text-12 text-faint">{label}</p>
                <div className="flex items-center gap-3">
                  <span className="flex size-20 items-center justify-center rounded-8 border border-dashed border-border bg-surface-1 text-12 text-faint">
                    {state}
                  </span>
                  <AdminMockButton tone="outline">上传图片</AdminMockButton>
                </div>
              </div>
            ))}
          </div>
        </SupportSection>

        <SupportSection
          icon={<Inbox className="size-4" />}
          title="客服邮箱收件（IMAP）"
          right={<StaticSwitch label="启用拉取" />}
        >
          <p className="text-12 leading-paragraph text-muted-foreground">
            使用邮箱授权码自动拉取新邮件到「邮件中心」，回信走下方独立 SMTP
            配置。
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <OperationsField label="IMAP 服务器" value="imap.exmail.qq.com" />
            <OperationsField label="端口" value="993" />
            <OperationsField label="邮箱账号" value="support@scholay.com" />
            <OperationsField label="密码 / 授权码" value="••••••••••••" />
            <OperationsField label="轮询间隔（分钟）" value="5" />
            <StaticSwitch label="TLS（993 端口必开）" />
          </div>
          <AdminMockButton tone="outline">测试连接</AdminMockButton>
        </SupportSection>

        <SupportSection
          icon={<MailCheck className="size-4" />}
          title="客服邮箱发信（SMTP）"
        >
          <p className="text-12 leading-paragraph text-muted-foreground">
            邮件中心回信和写信从此客服邮箱发出；留空时回落到系统邮件配置。
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <OperationsField label="SMTP 服务器" value="smtp.exmail.qq.com" />
            <OperationsField label="端口（465=SSL / 587=TLS）" value="465" />
            <OperationsField label="发信账号" value="support@scholay.com" />
            <OperationsField label="密码 / 授权码" value="••••••••••••" />
            <OperationsField
              label="发信人显示名（可空）"
              value="Scholay 客服"
            />
          </div>
          <AdminMockButton tone="outline">
            测试发信（给自己发一封）
          </AdminMockButton>
        </SupportSection>

        <SupportSection
          icon={<Send className="size-4" />}
          title="飞书通知（群自定义机器人）"
        >
          <p className="text-12 leading-paragraph text-muted-foreground">
            新反馈、客服邮件或支付成功后，将消息推送到配置的飞书群。
          </p>
          <OperationsField
            label="Webhook 地址"
            value="https://open.feishu.cn/open-apis/bot/v2/hook/••••"
          />
          <OperationsField
            label="签名 Secret（未开启签名则留空）"
            value="••••••••••••"
          />
          <div className="flex flex-wrap gap-4">
            <StaticSwitch label="在线反馈提交时推送" />
            <StaticSwitch label="收件箱新邮件时推送" />
            <StaticSwitch label="用户付费成功时推送" />
          </div>
          <AdminMockButton tone="outline">发送测试消息</AdminMockButton>
        </SupportSection>
      </div>
    </AdminMockPage>
  );
}

function OperationsField({
  label,
  value,
  width = "w-full",
  muted = false,
}: {
  label?: string;
  value: string;
  width?: string;
  muted?: boolean;
}) {
  return (
    <div>
      {label ? <p className="mb-1 text-12 text-faint">{label}</p> : null}
      <span
        className={`flex h-8 items-center rounded-8 border border-border bg-background px-3 text-14 ${muted ? "text-faint" : "text-foreground"} ${width}`}
      >
        {value}
      </span>
    </div>
  );
}

function OperationsKpi({
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
    <section className="rounded-8 border border-border bg-background p-3">
      <div className="flex items-center justify-between text-faint">
        <span className="text-12">{label}</span>
        {icon}
      </div>
      <p className="mt-2 text-24 font-medium tabular-nums text-foreground">
        {value}
      </p>
      {note ? (
        <p className="mt-1 text-12 leading-paragraph text-faint">{note}</p>
      ) : null}
    </section>
  );
}

function OperationsTable({
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

function UserIdentity({ name, detail }: { name: string; detail: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-14 font-medium text-foreground">{name}</p>
      <p className="truncate text-12 text-faint">{detail}</p>
    </div>
  );
}

function SupportSection({
  icon,
  title,
  right,
  children,
}: {
  icon: ReactNode;
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-8 border border-border bg-background p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-16 font-medium text-foreground">
          {icon} {title}
        </h3>
        {right}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

function StaticSwitch({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-12 text-muted-foreground">
      <span className="relative inline-flex h-5 w-9 rounded-pill bg-brand-green">
        <span className="absolute right-1 top-1 size-3 rounded-pill bg-background" />
      </span>
      {label}
    </div>
  );
}
