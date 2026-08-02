/**
 * 契约 schema —— 行为关键的 FE↔BE 数据契约的 zod 真源。
 *
 * 背景:本项目无代码生成(swagger 链路已废,见 CLAUDE.md §3.6),前端类型全手写镜像
 * 后端 Go struct。手写镜像最大的风险是「后端改字段 → 前端静默 undefined」,且**编译期
 * 和请求期都没有任何信号**。本目录用 zod 把那些**驱动 UI 分支**的契约(error code 表 /
 * 额度信号 / 计费总览 / 分页信封)钉住,对照**录制的真实后端响应**(fixtures/)校验,
 * 漂移直接在 `npm run test:contract` fail —— 挡在构建期而不是用户屏幕上。
 *
 * 加新契约:既在对应 api/*.ts 写 interface,也在这里加 schema + 在 fixtures/ 加样本,
 * 然后用 record.mjs 对真实后端刷新样本。
 */
import { z } from 'zod';

// ── 通用响应信封 ──────────────────────────────────────────────────────────
// source: backend/internal/common/utils/response.go (utils.Success / utils.Error)
// 不变量(http.ts:93 也声明):后端在所有 Response 里都填 code。
export const envelopeSchema = z
  .object({
    code: z.number(),
    message: z.string(),
    data: z.unknown().optional(),
    request_id: z.string().optional(),
  })
  .passthrough();

// ── 分页信封(**目标**规范形态,见架构报告 item 5 / utils.Page)────────────
// 现网后端有 6 种分页形状;此 schema 是收口目标,新列表端点应满足它。
export const paginatedSchema = <T extends z.ZodTypeAny>(item: T) =>
  z
    .object({
      items: z.array(item),
      total: z.number(),
      page: z.number().optional(),
      page_size: z.number().optional(),
    })
    .passthrough();

// ── 计费总览 ──────────────────────────────────────────────────────────────
// source: backend/internal/vip/quota.go Overview/TokenStatus + wallet.go BalanceView
// 注意:Go 的 TokenStatus 带 consumed_today、BalanceView 带 auto_reset —— FE interface
// 当前漏声明这两个字段(架构报告 finding I1)。schema 用 .passthrough() 容忍额外字段,
// 但**要求**前端实际消费的字段都在,后端删/改它们时这里 fail。
export const tokenStatusSchema = z
  .object({
    used: z.number(),
    ceiling: z.number(), // -1 = 不限
    percent: z.number(),
    unlimited: z.boolean(),
    consumed_today: z.number(), // 当日统计(P4 起前端消费)
    // P4:7 天锚定周期(null = 未开窗,首次使用开始计时)。
    window_days: z.number(),
    window_started_at: z.string().nullable(),
    window_reset_at: z.string().nullable(),
  })
  .passthrough();

// 0090:经费只剩一种 —— temp / lots 已从 BalanceView 移除。
// 用 z.never().optional() **拒绝**它们复活:这两个字段一旦回来,说明临时经费链路被改回去了,
// 而那条链路已经被迁移 0092 换算过一遍 —— 同一笔钱会同时以经费和重置次数两种形态存在。
export const balanceViewSchema = z
  .object({
    perm: z.number(),
    total: z.number(),
    // 0094:经费是小数,真值走 micro-credit;points 是当前兑换率下的可兑算力。
    // 缺 points 会让余额失去参照(兑换率可调,「600 经费」本身不说明任何事)。
    perm_micro: z.number(),
    points: z.number(),
    credit_autopay: z.boolean(),
    temp: z.never().optional(),
    lots: z.never().optional(),
  })
  .passthrough();

export const vipOverviewSchema = z
  .object({
    tier: z.enum(['free', 'pro', 'max']),
    // 计费周期(0079):付费档在期时 monthly|yearly(年费会员徽标),免费/过期 omitempty 省略。
    cycle: z.enum(['monthly', 'yearly']).optional(),
    expires_at: z.string().nullable(),
    token: tokenStatusSchema,
    // GetOverview 保证 credit 非空(架构报告 finding L2 —— Go 是 *BalanceView 指针,
    // 但 producer 有早返回不变量)。若后端某天送 null,录制刷新会在此 fail,正好提醒。
    credit: balanceViewSchema,
    auto_reset: z.boolean(),
    // 0090:reset_cost(重置花费多少经费)→ reset_passes(还剩几次)。
    // 三个客户端硬闸(PC 资产卡 / QuotaNotifier / 移动资产卡)都按这个数决定重置入口是否可点,
    // 缺了它们会静默 undefined → `undefined > 0` 为 false → 重置入口对所有人永久置灰。
    reset_passes: z.number(),
    reset_pass_next_expiry: z.string().nullable(),
    reset_cost: z.never().optional(),
  })
  .passthrough();

// ── 结构化 6010 载荷(冻结契约,2026-07)────────────────────────────────────
// source: backend payAsYouGoOrQuotaError 顺手带出(零额外查询)。三条通道同一形状:
//   HTTP 6010 信封 data.quota / WS error 帧顶层 quota。
// FE 侧全可选(quota-events.QuotaPayload)—— 旧后端不下发时弹窗回落 /user/billing/overview。
// reset_at 为 RFC3339,**无窗口时是空串**(不是缺字段);reset_passes 刻意不进载荷
// (热路径不查 DB 的既有拍板),弹窗仍从 overview 拿。
export const quotaPayloadSchema = z
  .object({
    reset_at: z.string().optional(),
    window_days: z.number().optional(),
    credit_balance_positive: z.boolean().optional(),
    credit_autopay: z.boolean().optional(),
  })
  .passthrough();

// ── agent WS error 帧(额度信号的 WS 形态)──────────────────────────────────
// source: agent/src/turn/turnLoop.ts 的 sink.frame({type:"error",...}) (error 帧 = {message, code, retryable})
//       ⚠️ 原写 agent/src/server/ws/events.ts —— 该文件已在 a30add8d2 删除,别去找
//       + backend/internal/agentbridge/ws.go (code='quota_exceeded' 等)
// 行为关键:FE useAgentSocket 据 code==='quota_exceeded' 弹额度重置弹窗,并把 quota 对象
// 透传进 notifyQuotaExceeded(弹窗要素行/payg 分支的数据源)。
export const agentErrorFrameSchema = z
  .object({
    type: z.literal('error'),
    message: z.string().optional(),
    code: z.string().optional(),
    retryable: z.boolean().optional(),
    quota: quotaPayloadSchema.optional(),
  })
  .passthrough();

// ── 用户端「不下发额度绝对值」不变量 ──────────────────────────────────────────
// source: backend/internal/vip/quota.go StripQuotaAmounts / ResetResult.StripAmounts
//         + billing_handler.go UsageCalendar / PublicPlans
//
// P5 成本制:额度绝对值(微元真实成本 → ÷1000 = 算力点)**只在 admin 可见**,用户端只看百分比。
// 这条不变量此前靠人肉记得在每个 handler 调 strip,漏了三处(重置回包 / 月度热力图的每日绝对成本
// + 日均参考线 / 免登录套餐页的额度基数)。下面两条 schema 用 **strict 拒绝**把它机械化:
// 新字段一旦把绝对值带回用户端,contract 直接红 —— 不能用 passthrough,那正好会放过泄漏。
export const publicPlansNoAbsoluteQuotaSchema = z
  .object({
    window_days: z.number(),
    plans: z.array(z.object({ tier: z.string(), multiplier: z.number() }).passthrough()),
    // 免登录端点:任何「额度基数」字段都不允许出现 —— 基数 × multiplier = 三档绝对上限。
    free_window_tokens: z.never().optional(),
    free_daily_tokens: z.never().optional(),
    // 0094:按需付费区块要用 recharge_rate × credit_to_points 算出「¥1 = N 算力点」。
    // 这两个是**相对价格**(不泄漏绝对额度基数),可以下发;缺了定价页那块会整个隐藏。
    recharge_rate: z.number(),
    credit_to_points: z.number(),
    // 0100:邀请奖励活动信号(>0=开启,点亮「邀请有奖」入口;0=关闭全隐藏)+ 日上限(规则行措辞用)。
    invite_reward_credits: z.number(),
    invite_reward_daily_cap: z.number(),
  })
  .passthrough();

export const usageCalendarNoAbsoluteQuotaSchema = z
  .object({
    // 每日只给相对强度百分比,不给成本。cost/daily_ceiling 出现即视为回归。
    days: z.array(z.object({ date: z.string(), pct: z.number(), cost: z.never().optional() }).passthrough()),
    unlimited: z.boolean(),
    daily_ceiling: z.never().optional(),
  })
  .passthrough();

// ── 后台算力用量看板总览 ─────────────────────────────────────────────────────
// source: backend/internal/llmusage/models_admin.go (Totals / DayPoint / BreakdownItem /
//         UserUsageItem / DayDimPoint) + service_stats.go (Overview)
//
// 为什么这条值得钉:后端 Totals / BreakdownItem 从 migration 0065 起就返回 cost_micro_yuan,
// 而前端 api/token-usage.ts 的 interface **整整两个结构体都没声明它**,看板因此长期只显示
// 裸 token —— 文件头还写着「字段对齐 models_admin.go」。这类漂移编译期和请求期都没有信号,
// 只有对着真实响应做 schema 校验才拦得住。
//
// 🔴 **所有 *_micro_yuan 字段单位是微元**(1e6 微元 = ¥1;÷1000 = 算力点 = ¥0.001)。
// z.number() 拦不住单位漂移 —— 后端哪天改成直接下发算力点,这里全绿但页面会小 1000 倍。
// 单位是本注释的职责,改后端换算时必须同步改这段话。
const costFieldsSchema = {
  cost_micro_yuan: z.number(),
};

const tokenFieldsSchema = {
  total_tokens: z.number(),
  input_tokens: z.number(),
  output_tokens: z.number(),
  cache_read_tokens: z.number(),
  cache_creation_tokens: z.number(),
  calls: z.number(),
};

export const llmUsageOverviewSchema = z
  .object({
    totals: z
      .object({
        total_tokens: z.number(),
        input_tokens: z.number(),
        output_tokens: z.number(),
        cache_read_tokens: z.number(),
        cache_creation_tokens: z.number(),
        total_calls: z.number(),
        unique_users: z.number(),
        anon_calls: z.number(),
        anon_tokens: z.number(),
        ...costFieldsSchema,
        anon_cost_micro_yuan: z.number(),
        // 未计价行(cost=0 但有 token)。缺了它,一段全是历史行的窗口会显示「0 算力点」,
        // 与「没花钱」在页面上不可区分 —— 这两个字段是那条区分线的唯一数据来源。
        unpriced_calls: z.number(),
        unpriced_tokens: z.number(),
      })
      .passthrough(),
    daily: z.array(z.object({ date: z.string(), ...tokenFieldsSchema, ...costFieldsSchema }).passthrough()),
    by_model: z.array(
      z.object({ key: z.string(), label: z.string(), ...tokenFieldsSchema, ...costFieldsSchema, unpriced_calls: z.number() }).passthrough(),
    ),
    by_feature: z.array(
      z.object({ key: z.string(), label: z.string(), ...tokenFieldsSchema, ...costFieldsSchema, unpriced_calls: z.number() }).passthrough(),
    ),
    // by_source(项目/Agent)与 by_provider:形状同 by_model/by_feature(BreakdownItem)。
    // fixture 里有实录数据 —— 此前只是漏钉,不是后端没下发。
    by_source: z.array(
      z.object({ key: z.string(), label: z.string(), ...tokenFieldsSchema, ...costFieldsSchema, unpriced_calls: z.number() }).passthrough(),
    ),
    by_provider: z.array(
      z.object({ key: z.string(), label: z.string(), ...tokenFieldsSchema, ...costFieldsSchema, unpriced_calls: z.number() }).passthrough(),
    ),
    top_users: z.array(
      z
        .object({
          user_id: z.number().nullable(),
          ...tokenFieldsSchema,
          ...costFieldsSchema,
          unpriced_calls: z.number(),
        })
        .passthrough(),
    ),
    daily_by_model: z.array(
      z.object({ date: z.string(), key: z.string(), ...tokenFieldsSchema, ...costFieldsSchema }).passthrough(),
    ),
    // 主图「按功能」分段堆叠柱的数据源(TokenDayDimPoint)。label 是图例中文名
    // (后端 FeatureLabel),interface 与 fixture 均有 —— 一并钉住。
    daily_by_feature: z.array(
      z.object({ date: z.string(), key: z.string(), label: z.string(), ...tokenFieldsSchema, ...costFieldsSchema }).passthrough(),
    ),
  })
  .passthrough();

// ── 错误码规范真源 ──────────────────────────────────────────────────────────
// **必须**与 backend/internal/common/errcode/codes.go 对齐。FE BizCode 是它的手写镜像,
// 驱动鉴权/额度 UI 分支;任一侧改号、另一侧没跟 = 静默 mis-route。本表把期望值钉死,
// contract.test.ts 校验 FE BizCode 不偏离它。改后端码时,改这里 + codes.go + http.ts 三处。
export const CANONICAL_BIZ_CODES = {
  Unauthorized: 401,
  Forbidden: 403,
  NotFound: 404,
  TooManyRequests: 429,
  InternalServerError: 500,
  TokenRevoked: 2030,
  TokenExpired: 2031,
  SessionTakenByOtherLogin: 2019,
  TurnstileFailed: 4001,
  PaymentRequired: 4020,
  AgentUnreachable: 6001,
  AgentQuotaExceeded: 6010,
  AgentSessionExpired: 6020,
  UploadTooLarge: 7001,
  UploadInvalidType: 7002,
  UploadStorageFailed: 7003,
} as const;

/** 额度信号的 WS 字符串形态(HTTP 是数字 6010 = AgentQuotaExceeded)。 */
export const AGENT_QUOTA_WS_CODE = 'quota_exceeded';
