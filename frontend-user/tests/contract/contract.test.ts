// @vitest-environment node
/**
 * FE↔BE 契约漂移守卫。两类断言:
 *   1) FE BizCode 常量 == 后端 errcode/codes.go 的规范数值(无需后端,纯常量)。
 *   2) 录制的真实后端响应满足 FE 依赖的 zod schema(fixtures/ 用 record.mjs 刷新)。
 *
 * 跑:`npm run test:contract`。CI 接上后,后端改字段忘了同步前端 → 这里 fail。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { BizCode } from '@/shared/lib/http';
import { isQuotaSignal } from '@/shared/lib/quota-events';
import {
  envelopeSchema,
  vipOverviewSchema,
  llmUsageOverviewSchema,
  publicPlansNoAbsoluteQuotaSchema,
  usageCalendarNoAbsoluteQuotaSchema,
  agentErrorFrameSchema,
  CANONICAL_BIZ_CODES,
  AGENT_QUOTA_WS_CODE,
} from './schemas';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): any =>
  JSON.parse(readFileSync(path.join(here, 'fixtures', name), 'utf-8'));

describe('error-code contract: FE BizCode ↔ backend errcode/codes.go', () => {
  it('每个 BizCode 常量都等于规范数值(任一侧改号即 fail)', () => {
    for (const [key, expected] of Object.entries(CANONICAL_BIZ_CODES)) {
      expect(
        BizCode[key as keyof typeof BizCode],
        `BizCode.${key} 偏离了后端 errcode/codes.go(期望 ${expected})`,
      ).toBe(expected);
    }
  });

  it('BizCode 没有规范表之外的、未登记的数字码', () => {
    for (const key of Object.keys(BizCode)) {
      expect(
        key in CANONICAL_BIZ_CODES,
        `BizCode.${key} 未登记进 CANONICAL_BIZ_CODES —— 新码要三处同步(codes.go / schemas.ts / http.ts)`,
      ).toBe(true);
    }
  });
});

describe('quota signal: 一个谓词跨 HTTP/SSE/WS', () => {
  it('数字 6010 与 WS 字符串 quota_exceeded 都被 isQuotaSignal 命中', () => {
    expect(isQuotaSignal({ code: BizCode.AgentQuotaExceeded })).toBe(true);
    expect(isQuotaSignal({ code: 6010 })).toBe(true);
    expect(isQuotaSignal({ code: AGENT_QUOTA_WS_CODE })).toBe(true);
    expect(isQuotaSignal({ code: 'quota_exceeded' })).toBe(true);
    expect(isQuotaSignal({ code: 401 })).toBe(false);
    expect(isQuotaSignal({ code: 'other' })).toBe(false);
    expect(isQuotaSignal({})).toBe(false);
  });
});

describe('response shapes: 录制的后端 fixture 满足 FE 依赖的契约', () => {
  it('GET /user/membership —— 信封 + Overview 形态', () => {
    const body = fixture('vip-overview.json');
    envelopeSchema.parse(body); // 不变量:所有响应带 code
    vipOverviewSchema.parse(body.data); // tier/token/credit/... 是 FE 计费 UI 的命脉
  });

  it('GET /admin/llm-token-usage/summary —— 算力点(cost_micro_yuan)在每一层都在', () => {
    const body = fixture('admin-llm-usage-summary.json');
    envelopeSchema.parse(body);
    // 后端返回了 cost 而前端 interface 漏声明,曾经悄悄发生过整整两个结构体 —— 这条就是为它加的。
    llmUsageOverviewSchema.parse(body.data);
  });

  it('算力点换算常数没漂:1 算力点 = 1000 微元(改它 = 改全站计费单位)', async () => {
    const { MICRO_YUAN_PER_POINT, toPoints } = await import('@/features/admin/api/token-usage');
    expect(MICRO_YUAN_PER_POINT).toBe(1000);
    expect(toPoints(2_699_526)).toBeCloseTo(2699.526, 3);
    // 后端 CSV 直出走 llmusage/handler_admin.go 的 microYuanPerPoint,必须是同一个数;
    // 两侧不一致 = 页面与导出的 Excel 对不上账,且没有任何报错。
  });

  it('GET /billing/plans(免登录)—— 不含额度基数,只有相对倍率', () => {
    const body = fixture('billing-plans.json');
    envelopeSchema.parse(body);
    // 基数 × multiplier = 三档绝对上限。这是个匿名可打的端点,基数出现即等于公开额度真值。
    publicPlansNoAbsoluteQuotaSchema.parse(body.data);
    expect(body.data.plans.some((p: any) => p.multiplier > 1), 'multiplier 是产品要讲的相对故事,不该被一起删掉').toBe(true);
  });

  it('GET /user/billing/usage-calendar —— 只有相对强度 pct,没有每日绝对成本', () => {
    const body = fixture('usage-calendar.json');
    envelopeSchema.parse(body);
    usageCalendarNoAbsoluteQuotaSchema.parse(body.data);
  });

  it('agent WS error/quota 帧 —— 额度信号契约', () => {
    const frame = fixture('ws-error-quota.json');
    agentErrorFrameSchema.parse(frame);
    expect(frame.code, 'WS 额度帧的 code 必须是 quota_exceeded(改它要同步 useAgentSocket)').toBe(
      AGENT_QUOTA_WS_CODE,
    );
    expect(isQuotaSignal(frame)).toBe(true);
  });
});
