// Mock 计费组合状态 —— 供「经费不足提醒充值」等场景在 Mock 面板上自由组合:
// 会员档位(free/pro/max)× 是否有经费 × 是否有刷新券(恢复次数)。
// /user/billing/overview 的 mock 应答从这里派生,全站真实消费链路
// (QuotaComposerStrip / 会员页 / 犀牛菜单)都会随之变化。
const KEY = "scholay.mock.billing.v1";

export type MockBillingTier = "free" | "pro" | "max";

export interface MockBillingState {
  tier: MockBillingTier;
  /** 账户是否有经费(true → ¥688,false → ¥0)。 */
  credit: boolean;
  /** 是否有刷新券/恢复次数(true → 2 次,false → 0)。 */
  passes: boolean;
  /** 「用经费继续」开关(PUT /user/billing/autopay 会写它)。 */
  autopay: boolean;
}

const DEFAULTS: MockBillingState = {
  tier: "pro",
  credit: true,
  passes: true,
  autopay: false,
};

export function getMockBilling(): MockBillingState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const value = JSON.parse(raw) as Partial<MockBillingState>;
    return {
      tier: value.tier === "free" || value.tier === "max" ? value.tier : value.tier === "pro" ? "pro" : DEFAULTS.tier,
      credit: typeof value.credit === "boolean" ? value.credit : DEFAULTS.credit,
      passes: typeof value.passes === "boolean" ? value.passes : DEFAULTS.passes,
      autopay: typeof value.autopay === "boolean" ? value.autopay : DEFAULTS.autopay,
    };
  } catch {
    return DEFAULTS;
  }
}

export function setMockBilling(patch: Partial<MockBillingState>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...getMockBilling(), ...patch }));
  } catch {
    // 隐私模式等写入失败:仅当次会话生效。
  }
}

export const MOCK_BILLING_STORAGE_KEY = KEY;
