// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  enabled: true,
  authenticated: false,
  openInvite: vi.fn(),
  navigate: vi.fn(),
  openDialog: vi.fn(),
  setPending: vi.fn(),
}));

vi.mock("@/shared/api/invite-campaign", () => ({
  useInviteCampaign: () => ({ data: { enabled: mocks.enabled } }),
}));

vi.mock("@/stores/invite-entry.store", () => ({
  useInviteEntry: (
    selector: (state: { openInvite: typeof mocks.openInvite }) => unknown,
  ) => selector({ openInvite: mocks.openInvite }),
}));

// 这些是旧入口的直达副作用。保留探针，防止以后回退成
// “按钮内判断登录态并直接导航 / 打开注册”。
vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@/stores/auth.store", () => ({
  useIsAuthenticated: () => mocks.authenticated,
}));
vi.mock("@/stores/auth-dialog.store", () => ({
  useAuthDialog: (
    selector: (state: { openDialog: typeof mocks.openDialog }) => unknown,
  ) => selector({ openDialog: mocks.openDialog }),
}));
vi.mock("@/stores/pending-action.store", () => ({
  usePendingAction: { getState: () => ({ set: mocks.setPending }) },
}));

import { InviteNavButton } from "./InviteNavButton";

beforeEach(() => {
  mocks.enabled = true;
  mocks.authenticated = false;
  mocks.openInvite.mockReset();
  mocks.navigate.mockReset();
  mocks.openDialog.mockReset();
  mocks.setPending.mockReset();
});

afterEach(() => cleanup());

describe("InviteNavButton", () => {
  it("活动关闭时不渲染入口，也不产生任何副作用", () => {
    mocks.enabled = false;
    const { container } = render(<InviteNavButton />);

    expect(container).toBeEmptyDOMElement();
    expect(mocks.openInvite).not.toHaveBeenCalled();
    expectLegacyDirectActionsNotCalled();
  });

  it.each([
    ["未登录", false],
    ["已登录", true],
  ])("%s 用户点击后都只打开全局邀请弹窗", (_label, authenticated) => {
    mocks.authenticated = authenticated;
    render(<InviteNavButton />);

    fireEvent.click(screen.getByRole("button", { name: "邀请有礼" }));

    expect(mocks.openInvite).toHaveBeenCalledTimes(1);
    expectLegacyDirectActionsNotCalled();
  });
});

function expectLegacyDirectActionsNotCalled() {
  expect(mocks.navigate).not.toHaveBeenCalled();
  expect(mocks.openDialog).not.toHaveBeenCalled();
  expect(mocks.setPending).not.toHaveBeenCalled();
}
