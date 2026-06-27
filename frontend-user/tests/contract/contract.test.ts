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

  it('agent WS error/quota 帧 —— 额度信号契约', () => {
    const frame = fixture('ws-error-quota.json');
    agentErrorFrameSchema.parse(frame);
    expect(frame.code, 'WS 额度帧的 code 必须是 quota_exceeded(改它要同步 useAgentSocket)').toBe(
      AGENT_QUOTA_WS_CODE,
    );
    expect(isQuotaSignal(frame)).toBe(true);
  });
});
