// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  shareMethods: vi.fn(),
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
}));

const invite = {
  code: "DESKTOP88",
  url: "https://www.scholay.com/register?invite=DESKTOP88",
  open_count: 31,
  registered_count: 9,
  reward_total: 220,
  created_at: "2026-08-09T10:00:00Z",
};

vi.mock("../api/invite", () => ({
  INVITE_METHOD_LABEL: {},
  INVITE_SOURCE_LABEL: {},
  useInvite: () => ({ data: invite, isLoading: false }),
  useInvitedUsers: () => ({ data: undefined, isLoading: false }),
}));

vi.mock("@/shared/api/invite-campaign", () => ({
  useInviteCampaign: () => ({
    data: mocks.campaign,
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("@/shared/components/invite/InviteShareMethods", () => ({
  InviteShareMethods: (props: { code: string; url: string }) => {
    mocks.shareMethods(props);
    return <div data-testid="invite-share-methods">share methods</div>;
  },
}));

vi.mock("../components/InviteBindingCard", () => ({
  InviteBindingCard: () => <div>关联我的邀请人</div>,
}));

import { InvitePage } from "./InvitePage";

afterEach(() => {
  cleanup();
  mocks.campaign.code_help_url = "";
  mocks.shareMethods.mockReset();
});

describe("InvitePage", () => {
  it("成功态先展示活动海报，再复用三种分享方式", () => {
    const { container } = render(<InvitePage />);

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
      className: "mt-4",
    });
    expect(container.textContent).not.toContain(invite.url);
    expect(screen.queryByRole("link", { name: /了解更多/ })).toBeNull();
  });

  it("后台配置帮助地址时展示安全新窗口的“了解更多”", () => {
    mocks.campaign.code_help_url = "https://help.example.com/invite";

    render(<InvitePage />);

    const link = screen.getByRole("link", { name: /了解更多/ });
    expect(link.getAttribute("href")).toBe(mocks.campaign.code_help_url);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("主内容按分享、统计、邀请记录排列，不重复展示长规则", () => {
    const { container } = render(<InvitePage />);

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
    expect(screen.getByText("累计邀请奖励")).toBeTruthy();
    expect(screen.queryByText("成功注册")).toBeNull();
    expect(screen.queryByText("我邀请的用户")).toBeNull();
    expect(screen.queryByText("如何参与")).toBeNull();
    expect(screen.queryByLabelText("邀请奖励摘要")).toBeNull();
    expect(container.textContent).not.toContain("每日最多计入");
    expect(container.textContent).not.toContain("注册礼");
    expect(container.textContent).not.toContain("首单返利");
  });
});
