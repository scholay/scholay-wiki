// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useClaimInvite } from '@/stores/claim-invite.store';

const mocks = vi.hoisted(() => ({
  filled: false,
  authenticated: false,
  campaign: {
    enabled: true,
    inviter_registration_credits: 20,
    invitee_registration_credits: 50,
    bind_window_days: 7,
    first_purchase_rebate_bps: 0,
    code_help_url: 'https://community.example/invites',
  },
  campaignLoading: false,
  userInvite: { code: 'ABC12345', url: 'https://www.scholay.com/i/ABC12345' },
}));

vi.mock('../hooks/useInviteFilled', () => ({
  useInviteFilled: () => ({
    campaignEnabled: true,
    ready: true,
    filled: mocks.filled,
  }),
}));

vi.mock('@/shared/api/invite-campaign', () => ({
  useInviteCampaign: () => ({
    data: mocks.campaign,
    isLoading: mocks.campaignLoading,
  }),
  useBindInvite: () => ({ isPending: false, mutateAsync: vi.fn() }),
  previewInviteCode: vi.fn(),
  inviteReasonText: (reason?: string) => reason ?? '',
}));

vi.mock('@/shared/api/user-invite', () => ({
  useUserInvite: () => ({
    data: mocks.userInvite,
    isLoading: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/shared/api/public-config', () => ({
  usePublicConfig: () => ({
    data: { discourse_site_url: 'https://community.example' },
  }),
}));

vi.mock('@/shared/api/promo', () => ({
  usePromoConfig: () => ({ data: { wechat_qr_url: '' } }),
}));

vi.mock('@/shared/components/invite/InviteShareMethods', () => ({
  InviteShareMethods: () => <section aria-label="邀请分享方式">分享方式</section>,
}));

vi.mock('@/stores/auth.store', () => ({
  useIsAuthenticated: () => mocks.authenticated,
}));

vi.mock('@/stores/auth-dialog.store', () => ({
  useAuthDialog: (
    selector: (state: {
      openDialog: () => void;
      setInvitationCode: () => void;
    }) => unknown,
  ) => selector({ openDialog: vi.fn(), setInvitationCode: vi.fn() }),
}));

vi.mock('qrcode.react', () => ({
  QRCodeCanvas: () => <canvas aria-label="邀请客服二维码" />,
}));

import { ClaimInviteDialog } from './ClaimInviteDialog';

beforeEach(() => {
  mocks.filled = false;
  mocks.authenticated = false;
  mocks.campaignLoading = false;
  useClaimInvite.setState({ open: true, scene: 'fill' });
});

afterEach(() => {
  useClaimInvite.getState().closeClaim();
  cleanup();
});

describe('ClaimInviteDialog', () => {
  it('填写场景可当场填码，也能前往推广邀请中心', () => {
    render(<ClaimInviteDialog />);

    expect(screen.getByRole('heading', { name: '填写邀请码可获得奖励' })).toBeInTheDocument();
    expect(screen.getByLabelText('邀请码')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: '前往推广邀请中心查看规则详情' }),
    ).toHaveAttribute('href', '/settings/invite');
    expect(screen.getByText('或者扫码添加微信客服获取邀请码')).toBeInTheDocument();
  });

  it('未填码时可在三种场景之间切换', () => {
    render(<ClaimInviteDialog />);

    fireEvent.click(screen.getByRole('tab', { name: '推广有好礼' }));
    expect(screen.getByRole('heading', { name: '推广有好礼' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '邀请有礼活动海报' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '直接注册' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '获取邀请码' }));
    expect(screen.getByRole('heading', { name: '获取邀请码' })).toBeInTheDocument();
    expect(screen.getByText('扫码添加微信客服获取邀请码')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '去社区找二维码' })).toBeInTheDocument();
  });

  it('已填码只展示推广有好礼，不再出现填写 / 获取', () => {
    mocks.filled = true;
    mocks.authenticated = true;
    useClaimInvite.setState({ open: true, scene: 'fill' });
    render(<ClaimInviteDialog />);

    expect(screen.getByRole('heading', { name: '推广有好礼' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '填写邀请码' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('邀请码')).not.toBeInTheDocument();
    expect(screen.getByLabelText('邀请分享方式')).toBeInTheDocument();
  });
});
