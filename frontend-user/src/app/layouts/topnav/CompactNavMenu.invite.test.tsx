// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  campaignEnabled: true,
  openInvite: vi.fn(),
  navigate: vi.fn(),
  openPromo: vi.fn(),
  refreshReturnTo: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mocks.navigate,
  useLocation: () => ({ pathname: "/", search: "" }),
}));

vi.mock("@/shared/components/IconButton", () => ({
  IconButton: (props: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props} />
  ),
}));

vi.mock("@/shared/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onSelect,
    className,
  }: {
    children: ReactNode;
    onSelect?: () => void;
    className?: string;
  }) => (
    <button type="button" className={className} onClick={onSelect}>
      {children}
    </button>
  ),
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
}));

vi.mock("@/shared/api/invite-campaign", () => ({
  useInviteCampaign: () => ({ data: { enabled: mocks.campaignEnabled } }),
}));

vi.mock("@/shared/api/promo", () => ({
  usePromoEligible: () => ({ visible: false }),
}));

vi.mock("@/stores/promo.store", () => ({
  usePromoStore: (
    selector: (state: { openPromo: typeof mocks.openPromo }) => unknown,
  ) => selector({ openPromo: mocks.openPromo }),
}));

vi.mock("@/stores/invite-entry.store", () => ({
  useInviteEntry: (
    selector: (state: { openInvite: typeof mocks.openInvite }) => unknown,
  ) => selector({ openInvite: mocks.openInvite }),
}));

vi.mock("@/stores/browser-tabs.store", () => ({
  browserTabUrl: vi.fn(),
  useBrowserTabs: (
    selector: (state: {
      tabs: never[];
      activeTabId: null;
      refreshReturnTo: typeof mocks.refreshReturnTo;
    }) => unknown,
  ) =>
    selector({
      tabs: [],
      activeTabId: null,
      refreshReturnTo: mocks.refreshReturnTo,
    }),
}));

vi.mock("@/app/menus", () => ({
  groupMenusByCategory: () => [],
}));

import { CompactNavMenu } from "./CompactNavMenu";

beforeEach(() => {
  mocks.campaignEnabled = true;
  mocks.openInvite.mockReset();
  mocks.navigate.mockReset();
  mocks.openPromo.mockReset();
  mocks.refreshReturnTo.mockReset();
});

afterEach(() => cleanup());

describe("CompactNavMenu invite entry", () => {
  it("活动开启时收纳同一个邀请入口，点击只打开全局弹窗", () => {
    render(<CompactNavMenu />);

    fireEvent.click(screen.getByRole("button", { name: "邀请有礼" }));

    expect(mocks.openInvite).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("活动关闭时不在收纳菜单中展示邀请入口", () => {
    mocks.campaignEnabled = false;

    render(<CompactNavMenu />);

    expect(
      screen.queryByRole("button", { name: "邀请有礼" }),
    ).not.toBeInTheDocument();
  });
});
