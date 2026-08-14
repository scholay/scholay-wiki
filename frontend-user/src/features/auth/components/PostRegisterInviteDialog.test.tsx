// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { InviteCampaign } from "@/shared/api/invite-campaign";
import { PostRegisterInviteDialog } from "./PostRegisterInviteDialog";

const campaign: InviteCampaign = {
  enabled: true,
  inviter_registration_credits: 999,
  invitee_registration_credits: 200,
  registration_daily_cap: 10,
  bind_window_days: 7,
  first_purchase_window_days: 30,
  first_purchase_rebate_bps: 2000,
  code_help_url: "https://help.example.com/invite-code",
};

afterEach(() => cleanup());

describe("PostRegisterInviteDialog", () => {
  it("只突出当前用户可领取的注册礼，不展示邀请人收益或首付返利", () => {
    render(
      <PostRegisterInviteDialog
        open
        campaign={campaign}
        onOpenChange={vi.fn()}
        onFillCode={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "填写邀请码，领取邀请礼" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("注册后 7 天内仍可补填并完成关联。"),
    ).toBeInTheDocument();
    expect(screen.getByText("你可领取")).toHaveClass("font-medium");

    const amount = screen.getByText(
      (_content, element) =>
        element?.tagName === "STRONG" && element.textContent === "200经费",
    );
    expect(amount).toHaveClass("text-20", "font-medium", "tabular-nums");

    const dialog = screen.getByRole("dialog");
    expect(dialog).not.toHaveTextContent("邀请人");
    expect(dialog).not.toHaveTextContent("双方");
    expect(dialog).not.toHaveTextContent("首付");
    expect(dialog).not.toHaveTextContent("返利");
    expect(dialog).not.toHaveTextContent("20%");
    expect(dialog).not.toHaveTextContent("999");
    expect(dialog).not.toHaveTextContent("30 天");
  });

  it("帮助链接与填写主操作可用", () => {
    const onFillCode = vi.fn();
    render(
      <PostRegisterInviteDialog
        open
        campaign={campaign}
        onOpenChange={vi.fn()}
        onFillCode={onFillCode}
      />,
    );

    const help = screen.getByRole("link", { name: "获取邀请码" });
    expect(help).toHaveAttribute("href", campaign.code_help_url);
    expect(help).toHaveAttribute("target", "_blank");
    expect(help).toHaveAttribute("rel", "noopener noreferrer");

    fireEvent.click(screen.getByRole("button", { name: "立即填写" }));
    expect(onFillCode).toHaveBeenCalledTimes(1);
  });

  it("当前用户没有可领取的注册礼时不渲染虚假奖励，也不泄漏其他人的奖励", () => {
    render(
      <PostRegisterInviteDialog
        open
        campaign={{
          ...campaign,
          invitee_registration_credits: 0,
          code_help_url: "",
        }}
        onOpenChange={vi.fn()}
        onFillCode={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "填写好友邀请码" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("你可领取")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).not.toHaveTextContent("999");
    expect(screen.getByRole("dialog")).not.toHaveTextContent("20%");
    expect(
      screen.queryByRole("link", { name: "获取邀请码" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "立即填写" })).toBeEnabled();
  });

  it("关闭状态不渲染弹窗内容", () => {
    render(
      <PostRegisterInviteDialog
        open={false}
        campaign={campaign}
        onOpenChange={vi.fn()}
        onFillCode={vi.fn()}
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
