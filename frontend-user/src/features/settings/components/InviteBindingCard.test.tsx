// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { InviteStatus } from "@/shared/api/invite-campaign";

const mocks = vi.hoisted(() => ({
  campaign: {
    enabled: true,
    inviter_registration_credits: 100,
    invitee_registration_credits: 50,
    registration_daily_cap: 10,
    bind_window_days: 7,
    first_purchase_window_days: 30,
    first_purchase_rebate_bps: 1250,
    code_help_url: "",
  },
  statusEnabled: vi.fn(),
  statusQ: {
    data: {
      enabled: true,
      bound: false,
      eligible: true,
      bind_deadline: "2026-08-16T00:00:00Z",
    } as InviteStatus | undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  bind: vi.fn(),
  capture: vi.fn(),
  clear: vi.fn(),
  candidate: null as null | {
    code: string;
    ts: number;
    expiresAt: number;
    valid?: true;
  },
  params: null as URLSearchParams | null,
  setParams: vi.fn(),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useSearchParams: () => [mocks.params!, mocks.setParams],
  };
});

vi.mock("@/shared/api/invite-campaign", () => ({
  useInviteCampaign: () => ({ data: mocks.campaign }),
  useInviteStatus: (enabled: boolean) => {
    mocks.statusEnabled(enabled);
    return mocks.statusQ;
  },
  useBindInvite: () => ({ mutateAsync: mocks.bind, isPending: false }),
  inviteRegistrationSummary: () => "邀请人 +100 经费、新用户 +50 经费",
  invitePurchaseSummary: () => "首次付费后返 12.5% 经费（30 天内）",
}));

vi.mock("@/stores/invite.store", () => ({
  useInviteCandidate: (selector: (state: unknown) => unknown) =>
    selector({
      candidate: mocks.candidate,
      capture: mocks.capture,
      clear: mocks.clear,
    }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { InviteBindingCard } from "./InviteBindingCard";

beforeEach(() => {
  mocks.campaign.enabled = true;
  mocks.statusQ.data = {
    enabled: true,
    bound: false,
    eligible: true,
    bind_deadline: "2026-08-16T00:00:00Z",
  };
  mocks.statusQ.isLoading = false;
  mocks.statusQ.isError = false;
  mocks.candidate = null;
  mocks.params = new URLSearchParams();
  mocks.statusEnabled.mockReset();
  mocks.statusQ.refetch.mockReset();
  mocks.bind.mockReset();
  mocks.capture.mockReset();
  mocks.clear.mockReset();
  mocks.setParams.mockReset();
});

afterEach(() => cleanup());

describe("InviteBindingCard", () => {
  it("活动关闭时不渲染，不启用 status 查询，也不发 bind", () => {
    mocks.campaign.enabled = false;

    const { container } = render(<InviteBindingCard />);

    expect(container.textContent).toBe("");
    expect(mocks.statusEnabled).toHaveBeenCalledWith(false);
    expect(mocks.bind).not.toHaveBeenCalled();
  });

  it("符合资格时只在点击确认后显式 bind，大写草稿不写入候选/header", async () => {
    mocks.bind.mockResolvedValue({
      status: { enabled: true, bound: true, eligible: false },
      rewards: { invitee_registration_credits: 50 },
    });
    render(<InviteBindingCard />);

    fireEvent.change(screen.getByPlaceholderText("输入邀请码"), {
      target: { value: "ab0l2z" },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认关联" }));

    await waitFor(() => {
      expect(mocks.capture).not.toHaveBeenCalled();
      expect(mocks.bind).toHaveBeenCalledTimes(1);
      expect(mocks.bind).toHaveBeenCalledWith("AB0L2Z");
      expect(mocks.clear).not.toHaveBeenCalled();
    });
  });

  it("符合资格时使用紧凑标题，只突出当前用户可领取的邀请礼", () => {
    const { container } = render(<InviteBindingCard />);

    const title = screen.getByText("填写邀请码，领取邀请礼");
    expect(title).toBeTruthy();
    expect(screen.getByText("+50 经费").className.split(" ")).toContain(
      "text-brand-green",
    );
    expect(title.closest("section")?.className.split(" ")).toContain("p-3");
    expect(container.textContent).not.toContain("我的邀请关系");
    expect(container.textContent).not.toContain("邀请人 +100 经费");
    expect(container.textContent).not.toContain("新用户 +50 经费");
    expect(container.textContent).not.toContain("首次付费后返");
    expect(container.textContent).not.toContain("12.5%");
  });

  it("已有持久化候选开始编辑时立即清除；草稿未提交不触发 bind", () => {
    mocks.candidate = {
      code: "OLD234",
      ts: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      valid: true,
    };
    render(<InviteBindingCard />);

    fireEvent.change(screen.getByPlaceholderText("输入邀请码"), {
      target: { value: "NEW234" },
    });

    expect(mocks.clear).toHaveBeenCalledTimes(1);
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(mocks.bind).not.toHaveBeenCalled();
  });

  it("已绑定且奖励已入账时，使用绿色“已领取”状态且不再提供改绑", () => {
    mocks.statusQ.data = {
      enabled: true,
      bound: true,
      eligible: false,
      inviter_name: "张**",
      code: "AB0L2Z",
      bound_at: "2026-08-09T10:00:00Z",
      invitee_rewarded_credits: 50,
      bind_deadline: undefined,
    };

    render(<InviteBindingCard />);

    expect(screen.getByText("邀请礼已领取").className.split(" ")).toContain(
      "text-brand-green",
    );
    expect(screen.getByText("已领取").className.split(" ")).toContain(
      "text-brand-green",
    );
    expect(screen.getByText(/已关联 张\*\* · \+50 经费/)).toBeTruthy();
    expect(screen.queryByPlaceholderText("输入邀请码")).toBeNull();
    expect(screen.queryByRole("button", { name: "确认关联" })).toBeNull();
  });

  it("已建立关系但未有奖励入账时，不误报“已领取”", () => {
    mocks.statusQ.data = {
      enabled: true,
      bound: true,
      eligible: false,
      inviter_name: "张**",
      invitee_rewarded_credits: 0,
    };

    render(<InviteBindingCard />);

    expect(screen.getByText("邀请关系已建立")).toBeTruthy();
    expect(screen.getByText("已关联")).toBeTruthy();
    expect(screen.queryByText("已领取")).toBeNull();
  });
});
