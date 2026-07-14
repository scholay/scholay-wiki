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

export const balanceViewSchema = z
  .object({
    temp: z.number(),
    perm: z.number(),
    total: z.number(),
    lots: z.array(
      z
        .object({
          amount: z.number(),
          expires_at: z.string(),
          source: z.string(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export const vipOverviewSchema = z
  .object({
    tier: z.enum(['free', 'pro', 'max']),
    expires_at: z.string().nullable(),
    token: tokenStatusSchema,
    // GetOverview 保证 credit 非空(架构报告 finding L2 —— Go 是 *BalanceView 指针,
    // 但 producer 有早返回不变量)。若后端某天送 null,录制刷新会在此 fail,正好提醒。
    credit: balanceViewSchema,
    auto_reset: z.boolean(),
    reset_cost: z.number(),
  })
  .passthrough();

// ── agent WS error 帧(额度信号的 WS 形态)──────────────────────────────────
// source: agent/src/server/ws/events.ts (error 帧 = {message, code, retryable})
//       + backend/internal/agentbridge/ws.go (code='quota_exceeded' 等)
// 行为关键:FE useAgentSocket 据 code==='quota_exceeded' 弹额度重置弹窗。
export const agentErrorFrameSchema = z
  .object({
    type: z.literal('error'),
    message: z.string().optional(),
    code: z.string().optional(),
    retryable: z.boolean().optional(),
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
