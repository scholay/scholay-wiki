// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

interface CampaignFixture {
  enabled: boolean;
  inviter_registration_credits: number;
  invitee_registration_credits: number;
  registration_daily_cap: number;
  bind_window_days: number;
  first_purchase_window_days: number;
  first_purchase_rebate_bps: number;
  code_help_url: string;
}

interface UserInviteFixture {
  code: string;
  url: string;
}

const mocks = vi.hoisted(() => ({
  open: true,
  authenticated: false,
  phone: false,
  campaign: {
    enabled: true,
    inviter_registration_credits: 20,
    invitee_registration_credits: 10,
    registration_daily_cap: 100,
    bind_window_days: 7,
    first_purchase_window_days: 30,
    first_purchase_rebate_bps: 1250,
    code_help_url: "https://community.example/invites",
  } as CampaignFixture | undefined,
  campaignLoading: false,
  campaignError: false,
  userInvite: {
    code: "ABC12345",
    url: "https://www.scholay.com/i/ABC12345",
  } as UserInviteFixture | undefined,
  userInviteLoading: false,
  userInviteError: false,
  closeInvite: vi.fn(),
  openAuthDialog: vi.fn(),
  campaignRefetch: vi.fn(),
  userInviteRefetch: vi.fn(),
  useUserInviteEnabled: vi.fn(),
  renderShareMethods: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@/shared/api/invite-campaign", () => ({
  useInviteCampaign: () => ({
    data: mocks.campaign,
    isLoading: mocks.campaignLoading,
    isError: mocks.campaignError,
    refetch: mocks.campaignRefetch,
  }),
  inviteRegistrationSummary: (campaign: CampaignFixture) => {
    const parts: string[] = [];
    if (campaign.inviter_registration_credits > 0) {
      parts.push(`邀请人获得 ${campaign.inviter_registration_credits} 经费`);
    }
    if (campaign.invitee_registration_credits > 0) {
      parts.push(
        `受邀新用户获得 ${campaign.invitee_registration_credits} 经费`,
      );
    }
    return parts.join("、");
  },
  invitePurchaseSummary: (campaign: CampaignFixture) =>
    campaign.first_purchase_rebate_bps > 0
      ? `受邀用户在 ${campaign.first_purchase_window_days} 天内完成首笔付费，邀请人再获订单金额 ${campaign.first_purchase_rebate_bps / 100}% 的等值经费`
      : "",
}));

vi.mock("@/shared/api/user-invite", () => ({
  useUserInvite: (enabled: boolean) => {
    mocks.useUserInviteEnabled(enabled);
    return {
      data: mocks.userInvite,
      isLoading: mocks.userInviteLoading,
      isError: mocks.userInviteError,
      refetch: mocks.userInviteRefetch,
    };
  },
}));

vi.mock("@/shared/components/invite/InviteShareMethods", () => ({
  InviteShareMethods: (props: { code: string; url: string }) => {
    mocks.renderShareMethods(props);
    return (
      <section aria-label="邀请分享方式">
        <button type="button">复制邀请链接</button>
        <button type="button">复制邀请码 {props.code}</button>
        <button type="button">分享或下载邀请二维码</button>
      </section>
    );
  },
}));

vi.mock("@/stores/invite-entry.store", () => ({
  useInviteEntry: (
    selector: (state: {
      open: boolean;
      closeInvite: typeof mocks.closeInvite;
    }) => unknown,
  ) => selector({ open: mocks.open, closeInvite: mocks.closeInvite }),
}));

vi.mock("@/stores/auth.store", () => ({
  useIsAuthenticated: () => mocks.authenticated,
}));

vi.mock("@/stores/auth-dialog.store", () => ({
  useAuthDialog: (
    selector: (state: { openDialog: typeof mocks.openAuthDialog }) => unknown,
  ) => selector({ openDialog: mocks.openAuthDialog }),
}));

vi.mock("@/shared/lib/device", () => ({
  isPhoneDevice: () => mocks.phone,
}));

vi.mock("./router", () => ({
  router: { navigate: mocks.navigate },
}));

import { InviteEntryDialog } from "./InviteEntryDialog";

beforeEach(() => {
  mocks.open = true;
  mocks.authenticated = false;
  mocks.phone = false;
  mocks.campaign = {
    enabled: true,
    inviter_registration_credits: 20,
    invitee_registration_credits: 10,
    registration_daily_cap: 100,
    bind_window_days: 7,
    first_purchase_window_days: 30,
    first_purchase_rebate_bps: 1250,
    code_help_url: "https://community.example/invites",
  };
  mocks.campaignLoading = false;
  mocks.campaignError = false;
  mocks.userInvite = {
    code: "ABC12345",
    url: "https://www.scholay.com/i/ABC12345",
  };
  mocks.userInviteLoading = false;
  mocks.userInviteError = false;
  mocks.closeInvite.mockReset();
  mocks.openAuthDialog.mockReset();
  mocks.campaignRefetch.mockReset().mockResolvedValue(undefined);
  mocks.userInviteRefetch.mockReset().mockResolvedValue(undefined);
  mocks.useUserInviteEnabled.mockReset();
  mocks.renderShareMethods.mockReset();
  mocks.navigate.mockReset().mockResolvedValue(undefined);
});

afterEach(() => cleanup());

describe("InviteEntryDialog", () => {
  it("活动开启时未登录弹窗展示海报与两条关键信息，且不请求个人邀请", () => {
    render(<InviteEntryDialog />);

    expect(
      screen.getByRole("heading", { name: "通过邀请注册，双方都有礼" }),
    ).toBeInTheDocument();

    const poster = screen.getByRole("img", {
      name: "邀请有礼活动海报",
    });
    expect(poster).toHaveAttribute("src", "/images/invite-reward-poster.png");
    expect(
      screen.getByText("邀请人获得 20 经费，受邀好友获得 10 经费。"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("没有邀请码也可以先注册，注册后 7 天内仍可补填邀请码。"),
    ).toBeInTheDocument();

    // 匿名入口只强调核心决策信息，详细奖励规则交给后台配置的详情页。
    expect(
      screen.queryByText(/支持手机号、邮箱和第三方账号注册/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/订单金额 12.5%/)).not.toBeInTheDocument();

    const helpLink = screen.getByRole("link", {
      name: "查看活动详情与获取邀请码方式",
    });
    expect(helpLink).toHaveAttribute(
      "href",
      "https://community.example/invites",
    );
    expect(helpLink).toHaveAttribute("target", "_blank");
    expect(helpLink).toHaveAttribute("rel", "noopener noreferrer");
    expect(mocks.useUserInviteEnabled).toHaveBeenLastCalledWith(false);
    expect(mocks.renderShareMethods).not.toHaveBeenCalled();
  });

  it("详情链接仅在后台配置 URL 时出现", () => {
    mocks.campaign = { ...mocks.campaign!, code_help_url: "" };

    render(<InviteEntryDialog />);

    expect(
      screen.queryByRole("link", { name: /查看活动详情/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "邀请有礼活动海报" }),
    ).toBeInTheDocument();
  });

  it("未登录用户点击直接注册时先关邀请弹窗，再打开注册弹窗", () => {
    render(<InviteEntryDialog />);

    fireEvent.click(screen.getByRole("button", { name: "直接注册" }));

    expect(mocks.closeInvite).toHaveBeenCalledTimes(1);
    expect(mocks.openAuthDialog).toHaveBeenCalledWith("register");
    expect(mocks.closeInvite.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.openAuthDialog.mock.invocationCallOrder[0],
    );
    expect(mocks.useUserInviteEnabled).toHaveBeenLastCalledWith(false);
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("已登录用户看到同一海报与精简引导，并直接进入三种分享方式", () => {
    mocks.authenticated = true;
    mocks.open = false;
    const { rerender } = render(<InviteEntryDialog />);

    expect(mocks.useUserInviteEnabled).toHaveBeenLastCalledWith(false);
    expect(mocks.renderShareMethods).not.toHaveBeenCalled();

    mocks.open = true;
    rerender(<InviteEntryDialog />);

    expect(mocks.useUserInviteEnabled).toHaveBeenLastCalledWith(true);
    expect(
      screen.getByRole("heading", { name: "邀请好友，获得奖励" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("分享专属链接、邀请码或二维码，好友注册后自动关联。"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/完成符合活动规则的注册或首笔付费/),
    ).not.toBeInTheDocument();

    const poster = screen.getByRole("img", { name: "邀请有礼活动海报" });
    expect(poster).toHaveAttribute("src", "/images/invite-reward-poster.png");

    expect(screen.queryByLabelText("邀请奖励")).not.toBeInTheDocument();
    expect(mocks.renderShareMethods).toHaveBeenCalledWith({
      code: "ABC12345",
      url: "https://www.scholay.com/i/ABC12345",
    });
    expect(
      screen.getByRole("button", { name: "复制邀请链接" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "复制邀请码 ABC12345" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "分享或下载邀请二维码" }),
    ).toBeInTheDocument();
  });

  it("已登录弹窗限制内容列宽并裁掉横向溢出", () => {
    mocks.authenticated = true;

    render(<InviteEntryDialog />);

    expect(screen.getByRole("dialog")).toHaveClass(
      "min-w-0",
      "max-w-2xl",
      "grid-cols-[minmax(0,1fr)]",
      "overflow-x-hidden",
    );
    expect(
      screen.getByRole("region", { name: "邀请分享方式" }),
    ).toBeInTheDocument();
  });

  it("仅配置注册礼时也不在海报下重复奖励信息", () => {
    mocks.authenticated = true;
    mocks.campaign = {
      ...mocks.campaign!,
      first_purchase_rebate_bps: 0,
    };

    render(<InviteEntryDialog />);

    expect(
      screen.getByRole("heading", { name: "邀请好友，获得奖励" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("邀请奖励")).not.toBeInTheDocument();
    expect(screen.queryByText(/首笔付费/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "邀请有礼活动海报" }),
    ).toBeInTheDocument();
  });

  it("全部奖励为 0 时匿名与已登录文案都保持中性", () => {
    mocks.campaign = {
      ...mocks.campaign!,
      inviter_registration_credits: 0,
      invitee_registration_credits: 0,
      first_purchase_rebate_bps: 0,
    };
    const { unmount } = render(<InviteEntryDialog />);

    expect(
      screen.getByRole("heading", { name: "通过邀请注册，完成好友关联" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/双方都有礼/)).not.toBeInTheDocument();

    unmount();
    mocks.authenticated = true;
    render(<InviteEntryDialog />);

    expect(
      screen.getByRole("heading", { name: "邀请好友使用 Scholay" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("分享专属链接、邀请码或二维码，好友注册后自动关联。"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("邀请奖励")).not.toBeInTheDocument();
    expect(screen.queryByText(/奖励自动发放/)).not.toBeInTheDocument();
  });

  it("已登录用户的邀请信息加载失败时可重试", () => {
    mocks.authenticated = true;
    mocks.userInvite = undefined;
    mocks.userInviteError = true;

    render(<InviteEntryDialog />);

    expect(screen.getByText("邀请信息加载失败")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    expect(mocks.userInviteRefetch).toHaveBeenCalledTimes(1);
    expect(mocks.campaignRefetch).not.toHaveBeenCalled();
  });

  it("个人邀请信息 refetch 失败但已有缓存时继续展示三种分享方式", () => {
    mocks.authenticated = true;
    mocks.userInviteError = true;

    render(<InviteEntryDialog />);

    expect(mocks.renderShareMethods).toHaveBeenCalledWith({
      code: "ABC12345",
      url: "https://www.scholay.com/i/ABC12345",
    });
    expect(
      screen.getByRole("region", { name: "邀请分享方式" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("邀请信息加载失败")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "重试" }),
    ).not.toBeInTheDocument();
  });

  it("邀请活动配置加载失败时可重试", () => {
    mocks.campaign = undefined;
    mocks.campaignError = true;

    render(<InviteEntryDialog />);
    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    expect(mocks.campaignRefetch).toHaveBeenCalledTimes(1);
    expect(mocks.userInviteRefetch).not.toHaveBeenCalled();
    expect(mocks.useUserInviteEnabled).toHaveBeenLastCalledWith(false);
  });

  it("活动配置 refetch 失败但已有缓存时继续展示活动内容", () => {
    mocks.campaignError = true;

    render(<InviteEntryDialog />);

    expect(
      screen.getByRole("heading", { name: "通过邀请注册，双方都有礼" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("邀请活动加载失败")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "重试" }),
    ).not.toBeInTheDocument();
    expect(mocks.campaignRefetch).not.toHaveBeenCalled();
    expect(mocks.useUserInviteEnabled).toHaveBeenLastCalledWith(false);
  });

  it("弹窗打开期间活动被后台关闭时自动关闭", async () => {
    mocks.campaign = { ...mocks.campaign!, enabled: false };

    render(<InviteEntryDialog />);

    await waitFor(() => expect(mocks.closeInvite).toHaveBeenCalledTimes(1));
    expect(mocks.useUserInviteEnabled).toHaveBeenLastCalledWith(false);
  });
});
