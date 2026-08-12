import { Coins, Gift, ShieldAlert, UserCog, Users } from "lucide-react";
import {
  AdminSettingsFixture,
  AdminTableFixture,
} from "./WikiEmbedAdminShared";

const USER_ROWS = [
  {
    title: "林晓舟 · #28461",
    detail: "lin.xz@example.edu · 手机与 ORCID 已连接",
    meta: "Max · 今天",
    status: "正常",
    tone: "green" as const,
  },
  {
    title: "周奕辰 · #28177",
    detail: "zhou.yc@example.edu · 邮箱已验证",
    meta: "Pro · 8 月 10 日",
    status: "正常",
    tone: "green" as const,
  },
  {
    title: "吴谨言 · #27602",
    detail: "wu.jy@example.edu · 最近登录 IP 已记录",
    meta: "Free · 8 月 8 日",
    status: "已冻结",
    tone: "red" as const,
  },
] as const;

/** 用户检索、筛选、聚合详情抽屉 · 纯样式 fixture。 */
export function WikiEmbedAdminUserDirectory() {
  return (
    <AdminTableFixture
      fixture="admin-user-directory"
      icon={Users}
      title="用户管理"
      description="按身份、会员、状态和注册时间检索账号，并查看独立加载的聚合详情。"
      metrics={[
        { label: "账号总数", value: "28,640", note: "今日新增 86" },
        { label: "Pro / Max", value: "4,280", note: "付费会员", tone: "green" },
        { label: "冻结账号", value: "42", note: "需人工复核", tone: "red" },
        { label: "已验证邮箱", value: "91%", note: "全量账号", tone: "blue" },
      ]}
      filters={["角色", "会员档位", "账号状态"]}
      rows={USER_ROWS}
      detailTitle="林晓舟 · 聚合详情"
      detailLines={[
        "身份与 OAuth 连接 · 已加载",
        "订单、钱包与兑换记录 · 已加载",
        "VIP、额度与 Reset Pass · 已加载",
        "功能与模型用量 · 已加载",
      ]}
    />
  );
}

/** 冻结、解冻、删除与角色委派的高风险动作 · 纯样式 fixture。 */
export function WikiEmbedAdminUserLifecycle() {
  return (
    <AdminSettingsFixture
      fixture="admin-user-lifecycle"
      icon={ShieldAlert}
      title="账号状态与角色"
      description="在核对用户 ID 后执行冻结、删除或角色变更。"
      action="查看操作记录"
      notice="冻结会撤销全部访问令牌；解冻不会恢复旧令牌。删除要求再次输入 DELETE 确认。"
      sections={[
        {
          title: "冻结与解冻",
          description: "普通账号可被冻结，管理员角色受保护。",
          fields: [
            { label: "当前状态", value: "正常", kind: "enabled" },
            { label: "冻结原因", value: "异常登录复核" },
          ],
        },
        {
          title: "角色委派",
          description: "仅 super_admin 可以授予 operations 或 admin。",
          fields: [
            { label: "当前角色", value: "user" },
            { label: "目标角色", value: "operations" },
          ],
        },
        {
          title: "删除账号",
          description: "不可逆业务操作，只作用于当前选中的用户。",
          fields: [
            { label: "用户 ID", value: "#28461" },
            { label: "确认文本", value: "DELETE" },
          ],
        },
        {
          title: "权限校验",
          description: "菜单隐藏不是安全边界，接口仍会检查权限。",
          fields: [
            { label: "users.manage", value: "允许", kind: "enabled" },
            { label: "users.role.assign", value: "禁止", kind: "disabled" },
          ],
        },
      ]}
    />
  );
}

/** 单用户会员、Credit 与 Reset Pass 补偿面板 · 纯样式 fixture。 */
export function WikiEmbedAdminEntitlementGrants() {
  return (
    <AdminSettingsFixture
      fixture="admin-entitlement-grants"
      icon={UserCog}
      title="发放账户权益"
      description="会员、Credit 与 Reset Pass 独立调整，并保留各自的有效期与交易记录。"
      notice="示例仅展示操作结构。提交前需要再次核对用户、档位、余额和有效期。"
      sections={[
        {
          title: "会员发放与撤销",
          description: "选择 Pro / Max、时长和周期标识。",
          fields: [
            { label: "会员档位", value: "Pro" },
            { label: "时长", value: "90 天" },
            { label: "周期标识", value: "不变" },
            { label: "当前会员", value: "Free" },
          ],
        },
        {
          title: "Credit 调整",
          description: "可补发或扣减，余额最低为零。",
          fields: [
            { label: "调整方向", value: "+ 补发" },
            { label: "数量", value: "100" },
            { label: "类型", value: "永久" },
            { label: "交易记录", value: "提交后写入", kind: "enabled" },
          ],
        },
        {
          title: "Reset Pass",
          description: "补充可重置额度，可设置到期时间。",
          fields: [
            { label: "发放次数", value: "5" },
            { label: "到期日", value: "2026-09-30" },
          ],
        },
        {
          title: "账户现状",
          description: "补偿前先核对三种权益的当前值。",
          fields: [
            { label: "Credit", value: "36" },
            { label: "Reset Pass", value: "2" },
          ],
        },
      ]}
    />
  );
}

/** 会员 / 经费兑换码批次与批次明细 · 纯样式 fixture。 */
export function WikiEmbedAdminGiftCodes() {
  return (
    <AdminTableFixture
      fixture="admin-gift-codes"
      icon={Gift}
      title="会员兑换码"
      description="首屏按生成批次管理；进入批次后再复制、导出或处理单个兑换码。"
      action="生成批次"
      searchPlaceholder="批次号 / 备注"
      filters={["发放类型", "会员等级"]}
      rows={[
        {
          title: "7f3a8e4c-2b91-4d6f-9a20-c8e1f547b632",
          detail: "Pro · 30 天 · 20 个码 · 备注：内测邀请",
          meta: "今天 10:15",
          status: "20 可用",
          tone: "green",
        },
        {
          title: "c184d796-6f32-4b0a-8de1-42a9f765bc10",
          detail: "永久经费 100 · 10 个码 · 已兑 6 / 10 次",
          meta: "昨天 16:40",
          status: "4 可用",
          tone: "amber",
        },
        {
          title: "2a6d90ef-8c51-4f73-b620-1e9c47a358db",
          detail: "Max · 90 天 · 8 个码 · 已兑 8 / 8 次",
          meta: "8 月 8 日",
          status: "0 可用",
          tone: "neutral",
        },
      ]}
      notice="列表中的每一行都是生成批次，不是单个兑换码；完整码只在批次详情中查看。"
      detailTitle="批次详情 · 20 个码"
      detailLines={[
        "ABCD-EFGH-JKMP-2345 · 可用",
        "Q7RX-V9WT-3KDM-8H2P · 可用",
        "复制全部 · 导出 CSV",
        "单码停用、延期或增加次数",
      ]}
    />
  );
}

/** 用户端订单、支付状态、履约与退款观察面 · 纯样式 fixture。 */
export function WikiEmbedAdminOrders() {
  return (
    <AdminTableFixture
      fixture="admin-orders"
      icon={Coins}
      title="订单与营收"
      description="按支付状态查看充值与订阅订单；退款作为已支付订单的附加记录展示。"
      metrics={[
        {
          label: "营收（毛 / 退 / 净）",
          value: "¥126,580",
          note: "退款独立记账",
          tone: "green",
        },
        { label: "营收构成", value: "68%", note: "订阅 · 充值 32%" },
        { label: "已支付订单", value: "1,284", note: "待支付 72 · 已过期 19" },
        { label: "兑换码核销", value: "486", note: "近 30 天", tone: "blue" },
      ]}
      filters={["订单状态", "订单类型"]}
      searchPlaceholder="用户 ID / 用户名 / 邮箱 / 手机号"
      rows={[
        {
          title: "ORD-20260812-0842",
          detail: "Max 月度会员 · 微信支付",
          meta: "¥269.00",
          status: "已支付",
          tone: "green",
        },
        {
          title: "ORD-20260812-0796",
          detail: "Credit 充值 · 支付宝",
          meta: "¥100.00",
          status: "待支付",
          tone: "amber",
        },
        {
          title: "ORD-20260811-0618",
          detail: "Pro 年度会员 · 微信支付",
          meta: "¥590.00",
          status: "已支付",
          tone: "green",
          secondaryStatus: "已全额退款",
          secondaryTone: "red",
        },
        {
          title: "ORD-20260810-0521",
          detail: "经费充值 · 支付宝",
          meta: "¥50.00",
          status: "已过期",
          tone: "neutral",
        },
      ]}
      notice="主状态只使用已支付、待支付、已过期；部分或全额退款叠加在已支付徽章下方，不改写主状态。"
    />
  );
}
