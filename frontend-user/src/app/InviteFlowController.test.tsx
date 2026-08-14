// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  campaignQ: {
    data: {
      enabled: true,
      inviter_registration_credits: 100,
      invitee_registration_credits: 50,
      registration_daily_cap: 10,
      bind_window_days: 7,
      first_purchase_window_days: 30,
      first_purchase_rebate_bps: 1250,
      code_help_url: "",
    } as
      | {
          enabled: boolean;
          inviter_registration_credits: number;
          invitee_registration_credits: number;
          registration_daily_cap: number;
          bind_window_days: number;
          first_purchase_window_days: number;
          first_purchase_rebate_bps: number;
          code_help_url: string;
        }
      | undefined,
    isError: false,
  },
  location: { pathname: "/", search: "" },
  navigate: vi.fn(),
  subscribe: vi.fn(),
  bind: vi.fn(),
  clear: vi.fn(),
  openAuth: vi.fn(),
  toastSuccess: vi.fn(),
  toastInfo: vi.fn(),
  invalidate: vi.fn(),
  authToken: null as string | null,
  currentUserId: 42 as number | null,
  candidate: null as null | { code: string; ts: number; valid?: true },
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}));

vi.mock("./router", () => ({
  router: {
    get state() {
      return { location: mocks.location };
    },
    navigate: (...args: unknown[]) => mocks.navigate(...args),
    subscribe: (...args: unknown[]) => mocks.subscribe(...args),
  },
}));

vi.mock("@/shared/api/invite-campaign", () => ({
  useInviteCampaign: () => mocks.campaignQ,
  bindInviteCode: (...args: unknown[]) => mocks.bind(...args),
  INVITE_STATUS_QUERY_KEY: ["invite", "status"],
  inviteReasonText: (
    reason?: string,
    fallback = "当前账号暂不能关联邀请人。",
  ) => (reason === "window_expired" ? "邀请码关联期已过" : fallback),
}));

vi.mock("@/shared/lib/auth-token", () => ({
  getAuthToken: () => mocks.authToken,
}));

vi.mock("@/stores/invite.store", () => ({
  useInviteCandidate: Object.assign(vi.fn(), {
    getState: () => ({ candidate: mocks.candidate, clear: mocks.clear }),
  }),
}));

vi.mock("@/stores/auth-dialog.store", () => ({
  useAuthDialog: Object.assign(vi.fn(), {
    getState: () => ({ openDialog: mocks.openAuth }),
  }),
}));

vi.mock("@/stores/auth.store", () => ({
  useAuthStore: Object.assign(vi.fn(), {
    getState: () => ({
      user: mocks.currentUserId == null ? null : { id: mocks.currentUserId },
    }),
  }),
}));

vi.mock("@/features/auth/components/PostRegisterInviteDialog", () => ({
  PostRegisterInviteDialog: ({ open }: { open: boolean }) =>
    open ? <div>post-register-invite-prompt</div> : null,
}));

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, info: mocks.toastInfo },
}));

import { InviteFlowController } from "./InviteFlowController";
import { AUTH_SUCCESS_EVENT } from "@/shared/lib/auth-events";

function dispatchAuthSuccess(
  isNewUser: boolean,
  userId = 42,
  suppressInviteFlow = false,
) {
  act(() => {
    window.dispatchEvent(
      new CustomEvent(AUTH_SUCCESS_EVENT, {
        detail: {
          isNewUser,
          userId,
          ...(suppressInviteFlow ? { suppressInviteFlow: true } : {}),
        },
      }),
    );
  });
}

beforeEach(() => {
  mocks.campaignQ.data = {
    enabled: true,
    inviter_registration_credits: 100,
    invitee_registration_credits: 50,
    registration_daily_cap: 10,
    bind_window_days: 7,
    first_purchase_window_days: 30,
    first_purchase_rebate_bps: 1250,
    code_help_url: "",
  };
  mocks.campaignQ.isError = false;
  mocks.location = { pathname: "/", search: "" };
  mocks.authToken = null;
  mocks.currentUserId = 42;
  mocks.candidate = null;
  mocks.navigate.mockReset().mockResolvedValue(undefined);
  mocks.subscribe.mockReset().mockReturnValue(() => undefined);
  mocks.bind.mockReset();
  mocks.clear.mockReset();
  mocks.openAuth.mockReset();
  mocks.toastSuccess.mockReset();
  mocks.toastInfo.mockReset();
  mocks.invalidate.mockReset();
});

afterEach(() => cleanup());

describe("InviteFlowController", () => {
  it("活动关闭时消费 /i 带回的 query，但不打开注册、不绑定、不渲染 prompt", async () => {
    mocks.campaignQ.data!.enabled = false;
    mocks.location = { pathname: "/", search: "?invite=register" };
    mocks.candidate = { code: "ABC234", ts: Date.now(), valid: true };
    render(<InviteFlowController />);
    dispatchAuthSuccess(true);

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith(
        { pathname: "/", search: "" },
        { replace: true },
      );
    });
    expect(mocks.openAuth).not.toHaveBeenCalled();
    expect(mocks.bind).not.toHaveBeenCalled();
    expect(screen.queryByText("post-register-invite-prompt")).toBeNull();
  });

  it("活动查询失败时仍消费 query 并打开注册，不让归因故障阻断注册", async () => {
    mocks.campaignQ.data = undefined;
    mocks.campaignQ.isError = true;
    mocks.location = { pathname: "/", search: "?invite=register" };

    render(<InviteFlowController />);

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith(
        { pathname: "/", search: "" },
        { replace: true },
      );
      expect(mocks.openAuth).toHaveBeenCalledWith("register");
    });
    expect(mocks.bind).not.toHaveBeenCalled();
  });

  it("只对 is_new_user=true 的登录成功自动绑定候选码，成功后清理候选", async () => {
    mocks.candidate = { code: "ABC234", ts: Date.now(), valid: true };
    mocks.bind.mockResolvedValue({
      status: { enabled: true, bound: true, eligible: false },
      rewards: { invitee_registration_credits: 50 },
    });
    render(<InviteFlowController />);

    dispatchAuthSuccess(false);
    expect(mocks.bind).not.toHaveBeenCalled();
    dispatchAuthSuccess(true);

    await waitFor(() => {
      expect(mocks.bind).toHaveBeenCalledTimes(1);
      expect(mocks.bind).toHaveBeenCalledWith("ABC234");
      expect(mocks.clear).toHaveBeenCalledTimes(1);
    });
    expect(
      mocks.invalidate.mock.calls.map(([options]) => options.queryKey),
    ).toEqual([
      ["invite", "status"],
      ["settings", "invite"],
      ["settings", "billing"],
      ["settings", "billing", "txns"],
    ]);
  });

  it("服务端返回 window_expired 时只展示中文原因，不泄漏枚举值", async () => {
    mocks.candidate = { code: "EXPR234", ts: Date.now(), valid: true };
    mocks.currentUserId = 314;
    mocks.bind.mockResolvedValue({
      status: {
        enabled: true,
        bound: false,
        eligible: false,
        reason: "window_expired",
      },
    });
    render(<InviteFlowController />);

    dispatchAuthSuccess(true, 314);

    await waitFor(() => {
      expect(mocks.toastInfo).toHaveBeenCalledWith("邀请码关联期已过");
    });
    expect(mocks.toastInfo).not.toHaveBeenCalledWith("window_expired");
  });

  it("新用户无候选码时显示一次注册后补录提示", async () => {
    render(<InviteFlowController />);

    dispatchAuthSuccess(true);

    expect(await screen.findByText("post-register-invite-prompt")).toBeTruthy();
    expect(mocks.bind).not.toHaveBeenCalled();
  });

  it("新用户本人无受邀注册礼时不弹奖励提示", async () => {
    mocks.campaignQ.data!.invitee_registration_credits = 0;
    // 即使邀请人有注册奖励和首付返利，也不能以别人的收益打扰新用户。
    mocks.campaignQ.data!.inviter_registration_credits = 999;
    mocks.campaignQ.data!.first_purchase_rebate_bps = 2000;
    mocks.currentUserId = 31415;
    render(<InviteFlowController />);

    dispatchAuthSuccess(true, 31415);

    await waitFor(() => {
      expect(
        screen.queryByText("post-register-invite-prompt"),
      ).toBeNull();
    });
    expect(mocks.bind).not.toHaveBeenCalled();
  });

  it("同一新用户与候选码在首次 bind 未完成时重复报成功，仍只请求一次", async () => {
    mocks.candidate = { code: "DUP234", ts: Date.now(), valid: true };
    mocks.currentUserId = 99;
    let resolveBind!: (value: {
      status: { enabled: boolean; bound: boolean; eligible: boolean };
    }) => void;
    mocks.bind.mockReturnValue(
      new Promise((resolve) => {
        resolveBind = resolve;
      }),
    );
    render(<InviteFlowController />);

    dispatchAuthSuccess(true, 99);
    await waitFor(() => expect(mocks.bind).toHaveBeenCalledTimes(1));
    dispatchAuthSuccess(true, 99);
    await Promise.resolve();
    expect(mocks.bind).toHaveBeenCalledTimes(1);

    resolveBind({ status: { enabled: true, bound: true, eligible: false } });
    await waitFor(() => expect(mocks.clear).toHaveBeenCalledTimes(1));
  });

  it("老用户带候选码登录时只引导到设置页，不静默绑定或清码", async () => {
    mocks.candidate = { code: "OLD234", ts: Date.now(), valid: true };
    mocks.currentUserId = 77;
    render(<InviteFlowController />);

    dispatchAuthSuccess(false, 77);

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith("/settings/invite?bind=1");
    });
    expect(mocks.bind).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();
  });

  it("OAuth merge 目标账号登录不离开 callback，合并完成后旧账号才去设置显式确认", async () => {
    mocks.candidate = { code: "MERGE234", ts: Date.now(), valid: true };
    mocks.currentUserId = 808;
    render(<InviteFlowController />);

    // 第一次成功仅是 OAuth merge 弹层内的目标账号身份校验。
    dispatchAuthSuccess(false, 808, true);
    await act(async () => Promise.resolve());
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.bind).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();

    // confirm-merge 成功后再发普通 old-account 事件：仍不自动 bind，
    // 只将保留的 candidate 带到设置页让用户点确认。
    dispatchAuthSuccess(false, 808);
    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith("/settings/invite?bind=1");
    });
    expect(mocks.bind).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();
  });

  it("A 的绑定未完成便切到 B 时，不清理 B 的候选码也不向 B 弹 A 的结果", async () => {
    mocks.candidate = { code: "SWITCHA", ts: Date.now(), valid: true };
    mocks.currentUserId = 701;
    let resolveBind!: (value: {
      status: { enabled: boolean; bound: boolean; eligible: boolean };
      rewards: { invitee_registration_credits: number };
    }) => void;
    mocks.bind.mockReturnValue(
      new Promise((resolve) => {
        resolveBind = resolve;
      }),
    );
    render(<InviteFlowController />);

    dispatchAuthSuccess(true, 701);
    await waitFor(() => expect(mocks.bind).toHaveBeenCalledWith("SWITCHA"));

    mocks.currentUserId = 702;
    mocks.candidate = { code: "SWITCHB", ts: Date.now(), valid: true };
    await act(async () => {
      resolveBind({
        status: { enabled: true, bound: true, eligible: false },
        rewards: { invitee_registration_credits: 50 },
      });
      await Promise.resolve();
    });

    expect(mocks.clear).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.toastInfo).not.toHaveBeenCalled();
  });

  it("/i 带回的匿名访问自动打开 register，老账号则只转设置页不静默绑定", async () => {
    mocks.location = { pathname: "/", search: "?invite=register" };
    const first = render(<InviteFlowController />);

    await waitFor(() => {
      expect(mocks.openAuth).toHaveBeenCalledWith("register");
    });
    expect(mocks.bind).not.toHaveBeenCalled();
    first.unmount();

    mocks.navigate.mockClear();
    mocks.openAuth.mockClear();
    mocks.authToken = "existing-user-token";
    render(<InviteFlowController />);

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith("/settings/invite?bind=1", {
        replace: true,
      });
    });
    expect(mocks.openAuth).not.toHaveBeenCalled();
    expect(mocks.bind).not.toHaveBeenCalled();
  });
});
