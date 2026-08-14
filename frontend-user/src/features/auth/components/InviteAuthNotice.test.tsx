// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

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

const mocks = vi.hoisted(() => ({
  campaign: {
    enabled: true,
    inviter_registration_credits: 100,
    invitee_registration_credits: 50,
    registration_daily_cap: 10,
    bind_window_days: 7,
    first_purchase_window_days: 30,
    first_purchase_rebate_bps: 1250,
    code_help_url: '',
  } as CampaignFixture | undefined,
  preview: vi.fn(),
  capture: vi.fn(),
  confirm: vi.fn(),
  clear: vi.fn(),
  candidate: null as null | {
    code: string;
    ts: number;
    expiresAt: number;
    inviterName?: string;
    valid?: true;
  },
}));

vi.mock('@/shared/api/invite-campaign', () => ({
  useInviteCampaign: () => ({ data: mocks.campaign }),
  useInvitePreview: () => ({
    mutateAsync: mocks.preview,
    isPending: false,
  }),
  inviteRegistrationSummary: () => '邀请人 +100 经费、新用户 +50 经费',
  invitePurchaseSummary: () => '首次付费后返 12.5% 经费（30 天内）',
}));

vi.mock('@/stores/invite.store', () => ({
  useInviteCandidate: (selector: (state: unknown) => unknown) =>
    selector({
      candidate: mocks.candidate,
      capture: mocks.capture,
      confirm: mocks.confirm,
      clear: mocks.clear,
    }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { InviteAuthNotice } from './InviteAuthNotice';

beforeEach(() => {
  mocks.campaign = {
    enabled: true,
    inviter_registration_credits: 100,
    invitee_registration_credits: 50,
    registration_daily_cap: 10,
    bind_window_days: 7,
    first_purchase_window_days: 30,
    first_purchase_rebate_bps: 1250,
    code_help_url: '',
  };
  mocks.candidate = null;
  mocks.preview.mockReset();
  mocks.capture.mockReset();
  mocks.confirm.mockReset();
  mocks.clear.mockReset();
});

afterEach(() => cleanup());

function expectGreenInviteCard(element: HTMLElement) {
  const card = element.closest('.rounded-12');
  expect(card).not.toBeNull();
  expect(card).toHaveClass(
    'min-w-0',
    'overflow-hidden',
    'border-brand-green/30',
    'bg-brand-green/5',
  );
  return card as HTMLElement;
}

describe('InviteAuthNotice', () => {
  it.each([
    ['活动配置未加载', undefined],
    ['活动已关闭', { ...mocks.campaign!, enabled: false }],
  ])('%s时不渲染邀请码交互，也不发起 preview', (_label, campaign) => {
    mocks.campaign = campaign;

    const { container } = render(<InviteAuthNotice />);

    expect(container.textContent).toBe('');
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it('无候选码时用紧凑卡片突出当前用户可获得的经费', () => {
    mocks.campaign = {
      ...mocks.campaign!,
      code_help_url: 'https://help.example.com/invite',
    };

    render(<InviteAuthNotice />);

    const reward = screen.getByText('获得 50 经费');
    const card = expectGreenInviteCard(reward);
    expect(reward).toHaveClass('font-medium');
    expect(card).not.toHaveTextContent('双方');
    expect(card).not.toHaveTextContent('好友得 100 经费');
    expect(card).not.toHaveTextContent('注册后 7 天内补填');

    const fillButton = screen.getByRole('button', { name: '填写邀请码' });
    expect(fillButton).toHaveClass('h-9', 'shrink-0');
    expect(card).toContainElement(fillButton);
    expect(fillButton.parentElement).toHaveClass('min-w-0', 'flex-wrap');

    const helpLink = screen.getByRole('link', { name: '查看邀请码帮助' });
    expect(helpLink).toHaveTextContent('获取邀请码');
    expect(helpLink).toHaveAttribute('href', 'https://help.example.com/invite');
    expect(helpLink).toHaveAttribute('target', '_blank');
    expect(helpLink).toHaveAttribute('rel', 'noopener noreferrer');
    expect(card).toContainElement(helpLink);
  });

  it('后台未配置寻码 URL 时不渲染次链接，主填写入口仍可用', () => {
    render(<InviteAuthNotice />);

    expect(
      screen.queryByRole('link', { name: '查看邀请码帮助' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '填写邀请码' }),
    ).toBeEnabled();
  });

  it('已确认邀请码用绿色状态卡展示邀请人、奖励与明确操作', () => {
    mocks.candidate = {
      code: 'ABC234',
      ts: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      inviterName: '张**',
      valid: true,
    };

    render(<InviteAuthNotice />);

    const status = screen.getByText('已接受 张** 的邀请');
    const card = expectGreenInviteCard(status);
    expect(card).toContainElement(screen.getByText('获得 50 经费'));
    expect(screen.getByRole('button', { name: '编辑邀请码' })).toHaveClass(
      'shrink-0',
    );
    expect(
      screen.getByRole('button', { name: '取消使用邀请码' }),
    ).toHaveClass('shrink-0');
  });

  it('支持修改已预览的邀请码并重新 preview，不在编辑时直接绑定', async () => {
    mocks.candidate = {
      code: 'OLD123',
      ts: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      inviterName: '张**',
      valid: true,
    };
    mocks.preview.mockResolvedValue({
      valid: true,
      code: 'NEW456',
      inviter_name: '李**',
    });
    render(<InviteAuthNotice />);

    fireEvent.click(screen.getByRole('button', { name: '编辑邀请码' }));
    const input = screen.getByRole('textbox', { name: '邀请码' });
    fireEvent.change(input, { target: { value: 'new456' } });
    fireEvent.click(screen.getByRole('button', { name: '确认' }));

    await waitFor(() => {
      expect(mocks.preview).toHaveBeenCalledTimes(1);
      expect(mocks.preview).toHaveBeenCalledWith('NEW456');
      expect(mocks.capture).not.toHaveBeenCalled();
      expect(mocks.confirm).toHaveBeenCalledWith('NEW456', '李**', 7);
    });
    expect(mocks.clear).toHaveBeenCalledTimes(1);
  });

  it('看似有效的草稿未点确认时不 preview、不写候选，不能进入 header 或自动归因链路', () => {
    render(<InviteAuthNotice />);

    fireEvent.click(screen.getByRole('button', { name: '填写邀请码' }));
    fireEvent.change(screen.getByRole('textbox', { name: '邀请码' }), {
      target: { value: 'ABCD2345' },
    });

    expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(mocks.candidate).toBeNull();
  });

  it('服务端判定邀请码无效时在编辑卡内显示错误，不确认候选码', async () => {
    mocks.preview.mockResolvedValue({ valid: false });
    render(<InviteAuthNotice />);

    fireEvent.click(screen.getByRole('button', { name: '填写邀请码' }));
    const input = screen.getByRole('textbox', { name: '邀请码' });
    fireEvent.change(input, { target: { value: 'invalid1' } });
    fireEvent.click(screen.getByRole('button', { name: '确认' }));

    const error = await screen.findByText('邀请码无效或已过期');
    expect(error.closest('.rounded-12')).toBe(input.closest('.rounded-12'));
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it('邀请码验证请求失败时保留草稿并提示稍后重试', async () => {
    mocks.preview.mockRejectedValue(new Error('network'));
    render(<InviteAuthNotice />);

    fireEvent.click(screen.getByRole('button', { name: '填写邀请码' }));
    const input = screen.getByRole('textbox', { name: '邀请码' });
    fireEvent.change(input, { target: { value: 'keep2345' } });
    fireEvent.click(screen.getByRole('button', { name: '确认' }));

    expect(
      await screen.findByText('暂时无法验证，请稍后重试'),
    ).toBeInTheDocument();
    expect(input).toHaveValue('KEEP2345');
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it('编辑卡在窄屏下允许输入区收缩，确认按钮保持可点', () => {
    render(<InviteAuthNotice />);
    fireEvent.click(screen.getByRole('button', { name: '填写邀请码' }));

    const input = screen.getByRole('textbox', { name: '邀请码' });
    const confirmButton = screen.getByRole('button', { name: '确认' });
    const card = expectGreenInviteCard(input);

    expect(input).toHaveClass('min-w-0', 'flex-1', '!h-11', 'sm:!h-9');
    expect(confirmButton).toHaveClass('h-11', 'shrink-0', 'sm:h-9');
    expect(card).toContainElement(confirmButton);
  });

  it('移动认证壳的窄屏边距覆盖不会被默认外边距撑宽', () => {
    render(<InviteAuthNotice className="mx-0 mt-5" />);

    const card = expectGreenInviteCard(
      screen.getByText('获得 50 经费'),
    );
    expect(card).toHaveClass('mx-0', 'mt-5');
    expect(card).not.toHaveClass('mx-6', 'mt-3');
    expect(
      screen.getByRole('button', { name: '填写邀请码' }).parentElement,
    ).toHaveClass('min-w-0', 'flex-wrap');
  });

  it('取消候选邀请码只清理本地候选，不发起 preview', () => {
    mocks.candidate = {
      code: 'ABC234',
      ts: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      valid: true,
    };
    render(<InviteAuthNotice />);

    fireEvent.click(screen.getByRole('button', { name: '取消使用邀请码' }));

    expect(mocks.clear).toHaveBeenCalledTimes(1);
    expect(mocks.preview).not.toHaveBeenCalled();
  });
});
