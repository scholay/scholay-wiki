// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  inviteEnabled: vi.fn(),
  inviteRefetch: vi.fn(),
  campaignRefetch: vi.fn(),
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
  inviteData: undefined as
    | undefined
    | {
        code: string;
        url: string;
        open_count: number;
        registered_count: number;
        reward_total: number;
        created_at: string;
      },
  shareMethods: vi.fn(),
}));

vi.mock("../../api/invite", () => ({
  INVITE_METHOD_LABEL: {},
  INVITE_SOURCE_LABEL: {},
  useInvite: (enabled: boolean) => {
    mocks.inviteEnabled(enabled);
    return {
      data: mocks.inviteData,
      isLoading: false,
      refetch: mocks.inviteRefetch,
    };
  },
  useInvitedUsers: () => ({ data: undefined, isLoading: false }),
}));

vi.mock("@/shared/components/invite/InviteShareMethods", () => ({
  InviteShareMethods: (props: {
    code: string;
    url: string;
    className?: string;
  }) => {
    mocks.shareMethods(props);
    return <div data-testid="invite-share-methods">share methods</div>;
  },
}));

vi.mock("@/shared/api/invite-campaign", () => ({
  useInviteCampaign: () => ({
    data: mocks.campaign,
    isLoading: false,
    isError: false,
    refetch: mocks.campaignRefetch,
  }),
}));

vi.mock("../../components/InviteBindingCard", () => ({
  InviteBindingCard: () => <div>关联我的邀请人</div>,
}));

vi.mock("../../components/mobile/MeSubpageShell", () => ({
  MeSubpageShell: ({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) => <main aria-label={title}>{children}</main>,
}));

vi.mock("@/shared/lib/clipboard", () => ({ copyToClipboard: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { MobileInvitePage } from "./MobileInvitePage";

afterEach(() => {
  cleanup();
  mocks.campaign.code_help_url = "";
  mocks.inviteData = undefined;
  mocks.inviteEnabled.mockReset();
  mocks.inviteRefetch.mockReset();
  mocks.campaignRefetch.mockReset();
  mocks.shareMethods.mockReset();
});

describe("MobileInvitePage", () => {
  it("邀请链接 API 无数据时仍在顶部渲染关联卡，失败卡独立重试", () => {
    render(<MobileInvitePage />);

    expect(screen.getByText("关联我的邀请人")).toBeTruthy();
    expect(screen.getByText("邀请好友信息加载失败")).toBeTruthy();
    expect(screen.getByRole("button", { name: "重试" })).toBeTruthy();
    expect(mocks.inviteEnabled).toHaveBeenCalledWith(true);
  });

  it("成功态先展示活动海报，再复用三种分享方式", () => {
    const invite = {
      code: "MOBILE88",
      url: "https://www.scholay.com/register?invite=MOBILE88",
      open_count: 23,
      registered_count: 7,
      reward_total: 168,
      created_at: "2026-08-09T10:00:00Z",
    };
    mocks.inviteData = invite;

    const { container } = render(<MobileInvitePage />);

    const poster = screen.getByRole("img", {
      name: "邀请有礼活动海报",
    });
    const share = screen.getByTestId("invite-share-methods");

    expect(poster.getAttribute("src")).toBe("/images/invite-reward-poster.png");
    expect(poster.compareDocumentPosition(share)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.getByTestId("invite-share-methods")).toBeTruthy();
    expect(mocks.shareMethods).toHaveBeenCalledWith({
      code: invite.code,
      url: invite.url,
      className: "mt-3",
    });
    expect(container.textContent).not.toContain(invite.url);
    expect(screen.queryByRole("link", { name: /了解更多/ })).toBeNull();
  });

  it("后台配置帮助地址时展示安全新窗口的“了解更多”", () => {
    mocks.campaign.code_help_url = "https://help.example.com/invite";
    mocks.inviteData = {
      code: "MOBILE88",
      url: "https://www.scholay.com/register?invite=MOBILE88",
      open_count: 23,
      registered_count: 7,
      reward_total: 168,
      created_at: "2026-08-09T10:00:00Z",
    };

    render(<MobileInvitePage />);

    const link = screen.getByRole("link", { name: /了解更多/ });
    expect(link.getAttribute("href")).toBe(mocks.campaign.code_help_url);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("主内容按分享、统计、邀请记录排列，不重复展示长规则", () => {
    mocks.inviteData = {
      code: "MOBILE88",
      url: "https://www.scholay.com/register?invite=MOBILE88",
      open_count: 23,
      registered_count: 7,
      reward_total: 168,
      created_at: "2026-08-09T10:00:00Z",
    };

    const { container } = render(<MobileInvitePage />);

    const share = screen.getByTestId("invite-share-methods");
    const stats = screen.getByText("邀请链接访问").parentElement!;
    const history = screen.getByText("邀请记录");

    expect(share.compareDocumentPosition(stats)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(stats.compareDocumentPosition(history)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.getByText("已关联好友")).toBeTruthy();
    expect(screen.queryByText("成功注册")).toBeNull();
    expect(screen.queryByText("我邀请的用户")).toBeNull();
    expect(screen.queryByText("如何参与")).toBeNull();
    expect(screen.queryByLabelText("邀请奖励摘要")).toBeNull();
    expect(container.textContent).not.toContain("每日最多计入");
    expect(container.textContent).not.toContain("注册礼");
    expect(container.textContent).not.toContain("首单返利");
  });

  it("移动端统计固定两列，累计邀请奖励卡跨两列", () => {
    mocks.inviteData = {
      code: "MOBILE88",
      url: "https://www.scholay.com/register?invite=MOBILE88",
      open_count: 23,
      registered_count: 7,
      reward_total: 168,
      created_at: "2026-08-09T10:00:00Z",
    };

    render(<MobileInvitePage />);

    const openedCard = screen.getByText("邀请链接访问").parentElement;
    const registeredCard = screen.getByText("已关联好友").parentElement;
    const rewardCard = screen.getByText("累计邀请奖励").parentElement;
    const statsGrid = openedCard?.parentElement;

    expect(statsGrid?.className.split(" ")).toContain("grid-cols-2");
    expect(registeredCard?.parentElement).toBe(statsGrid);
    expect(rewardCard?.parentElement).toBe(statsGrid);
    expect(rewardCard?.className.split(" ")).toContain("col-span-2");
  });
});
