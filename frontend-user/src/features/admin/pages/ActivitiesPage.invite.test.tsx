// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { InviteCampaign } from '@/shared/api/invite-campaign';

const mocks = vi.hoisted(() => ({
  query: {
    data: undefined as InviteCampaign | undefined,
    isLoading: false,
    isError: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  mutate: vi.fn(),
  apiToast: vi.fn(),
  confirm: vi.fn(),
  toast: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useIsFetching: () => 0,
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}));

vi.mock('../api/invite-campaign', () => ({
  ADMIN_INVITE_CAMPAIGN_QUERY_KEY: ['admin', 'invite-campaign'],
  useAdminInviteCampaign: () => mocks.query,
  useUpdateAdminInviteCampaign: () => ({
    mutateAsync: mocks.mutate,
    isPending: false,
  }),
}));

vi.mock('../api/invites', () => ({
  useInviteSummary: () => ({
    data: { total_reward_credits: 12_500, total_registrations: 25 },
  }),
}));

vi.mock('../hooks/useApiToast', () => ({
  useApiToast: () => mocks.apiToast,
}));

vi.mock('@/shared/components', () => ({
  useConfirm: () => mocks.confirm,
}));

vi.mock('sonner', () => ({ toast: mocks.toast }));

vi.mock('../permissions', () => ({
  PERM: { configManage: 'config.manage' },
  useHasPermission: () => true,
}));

vi.mock('../components/ConfigPageGuard', () => ({
  ConfigPageGuard: ({ query, children }: {
    query: { data?: InviteCampaign };
    children: (data: InviteCampaign) => React.ReactNode;
  }) => query.data ? <>{children(query.data)}</> : null,
}));

vi.mock('../components/AdminPageLayout', () => ({
  AdminPageLayout: ({ tabs, children }: {
    tabs?: React.ReactNode;
    children: React.ReactNode;
  }) => <div>{tabs}{children}</div>,
}));

vi.mock('./PromoConfigPage', () => ({ PromoConfigPanel: () => null }));

vi.mock('@/shared/ui/tabs', () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));

vi.mock('react-router-dom', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/admin/invites">{children}</a>,
}));

import { ActivitiesPage } from './ActivitiesPage';

const defaultCampaign = (): InviteCampaign => ({
  enabled: true,
  inviter_registration_credits: 100,
  invitee_registration_credits: 50,
  registration_daily_cap: 10,
  bind_window_days: 7,
  first_purchase_window_days: 30,
  first_purchase_rebate_bps: 1250,
  code_help_url: '',
});

function inviteInputs(): HTMLInputElement[] {
  return screen.getAllByRole('spinbutton') as HTMLInputElement[];
}

beforeEach(() => {
  mocks.query.data = defaultCampaign();
  mocks.query.isLoading = false;
  mocks.query.isError = false;
  mocks.query.error = null;
  mocks.query.refetch.mockReset();
  mocks.mutate.mockReset().mockResolvedValue(defaultCampaign());
  mocks.apiToast.mockReset().mockImplementation(async (promise: Promise<unknown>) => promise);
  mocks.confirm.mockReset().mockResolvedValue(true);
  mocks.toast.mockReset();
  mocks.invalidate.mockReset();
});

afterEach(() => cleanup());

describe('ActivitiesPage invite campaign form', () => {
  it('按百分数展示 bps，并把两位小数百分比准确换算回提交 bps', async () => {
    render(<ActivitiesPage />);

    const rebate = inviteInputs()[4];
    expect(rebate.value).toBe('12.5');
    fireEvent.change(rebate, { target: { value: '12.34' } });
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }));

    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledTimes(1));
    expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({
      first_purchase_rebate_bps: 1234,
    }));
  });

  it('拒绝超出 0% 到 100% 的返利比例', () => {
    render(<ActivitiesPage />);

    fireEvent.change(inviteInputs()[4], { target: { value: '100.01' } });

    expect(screen.getByText(/首单返利必须在 0% 到 100% 之间/)).toBeTruthy();
    expect((screen.getByRole('button', { name: '保存配置' }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it('绑定与首单时窗必须位于 1 到 3650 天', () => {
    render(<ActivitiesPage />);
    const inputs = inviteInputs();

    fireEvent.change(inputs[3], { target: { value: '0' } });
    fireEvent.change(inputs[5], { target: { value: '3651' } });

    expect(screen.getByText(/绑定时窗必须在 1 到 3650 天之间/)).toBeTruthy();
    expect(screen.getByText(/首单时窗必须在 1 到 3650 天之间/)).toBeTruthy();
    expect((screen.getByRole('button', { name: '保存配置' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('帮助链接只接受完整 http(s) 地址，修正后可以提交', async () => {
    render(<ActivitiesPage />);
    const url = screen.getByPlaceholderText('https://www.scholay.com/help/invite');

    fireEvent.change(url, { target: { value: 'javascript:alert(1)' } });
    expect(screen.getByText(/邀请码帮助链接必须是完整的 http\(s\) 地址/)).toBeTruthy();
    expect((screen.getByRole('button', { name: '保存配置' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(url, { target: { value: 'https://docs.scholay.com/invite' } });
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }));

    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledTimes(1));
    expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({
      code_help_url: 'https://docs.scholay.com/invite',
    }));
  });

  it('没有任何改动时只提示，不弹确认也不提交', () => {
    render(<ActivitiesPage />);

    fireEvent.click(screen.getByRole('button', { name: '保存配置' }));

    expect(mocks.toast).toHaveBeenCalledWith('当前没有任何改动');
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it('开启活动时明确列出开关变化和成本风险，再经确认提交', async () => {
    mocks.query.data = { ...defaultCampaign(), enabled: false };
    render(<ActivitiesPage />);

    fireEvent.click(screen.getByRole('switch', { name: '开启邀请活动' }));
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }));

    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledTimes(1));
    const options = mocks.confirm.mock.calls[0][0] as {
      title: string;
      description: React.ReactNode;
      confirmText: string;
      danger: boolean;
    };
    expect(options.title).toBe('确认调整邀请有礼发放规则？');
    expect(options.confirmText).toBe('确认规则并保存');
    expect(options.danger).toBe(true);
    const description = render(<>{options.description}</>);
    expect(description.container.textContent).toContain('活动开关：关闭 → 开启');
    expect(description.container.textContent).toContain('可能直接增加经费成本');
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true }),
    ));
  });

  it('奖励上调时在确认内容中展示旧值、新值及成本警告', async () => {
    render(<ActivitiesPage />);

    fireEvent.change(inviteInputs()[0], { target: { value: '200' } });
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }));

    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledTimes(1));
    const options = mocks.confirm.mock.calls[0][0] as {
      description: React.ReactNode;
      danger: boolean;
    };
    const description = render(<>{options.description}</>);
    expect(description.container.textContent).toContain(
      '邀请人注册礼：100 经费 → 200 经费',
    );
    expect(description.container.textContent).toContain('可能直接增加经费成本');
    expect(options.danger).toBe(true);
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ inviter_registration_credits: 200 }),
    ));
  });

  it('拒绝小数注册礼、小数每日上限和超过两位小数的返利比例', () => {
    render(<ActivitiesPage />);

    fireEvent.change(inviteInputs()[0], { target: { value: '123.9' } });
    fireEvent.change(inviteInputs()[2], { target: { value: '8.8' } });
    fireEvent.change(inviteInputs()[4], { target: { value: '12.345' } });

    expect(screen.getByText(/邀请人注册礼必须是非负整数/)).toBeTruthy();
    expect(screen.getByText(/每日奖励上限必须是非负整数/)).toBeTruthy();
    expect(screen.getByText(/首单返利必须在 0% 到 100% 之间，且百分数最多两位小数/)).toBeTruthy();
    expect((screen.getByRole('button', { name: '保存配置' }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it('镜像后端拒绝超过注册礼与每日上限的配置', () => {
    render(<ActivitiesPage />);
    const inputs = inviteInputs();

    fireEvent.change(inputs[0], { target: { value: '1000000001' } });
    fireEvent.change(inputs[2], { target: { value: '1000001' } });

    expect(screen.getByText(/双方注册礼均不能超过 1,000,000,000 经费/)).toBeTruthy();
    expect(screen.getByText(/每日奖励上限不能超过 1,000,000 人/)).toBeTruthy();
    expect((screen.getByRole('button', { name: '保存配置' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('活动开启时不允许双方注册礼与首单返利同时为零', () => {
    render(<ActivitiesPage />);
    const inputs = inviteInputs();

    fireEvent.change(inputs[0], { target: { value: '0' } });
    fireEvent.change(inputs[1], { target: { value: '0' } });
    fireEvent.change(inputs[4], { target: { value: '0' } });

    expect(screen.getByText(/开启活动时至少配置一种注册礼或首单返利/)).toBeTruthy();
    expect((screen.getByRole('button', { name: '保存配置' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('帮助链接允许 500 字符并拒绝 501 字符', async () => {
    render(<ActivitiesPage />);
    const input = screen.getByPlaceholderText('https://www.scholay.com/help/invite');
    const prefix = 'https://docs.scholay.com/';
    const url500 = prefix + 'a'.repeat(500 - prefix.length);
    const url501 = `${url500}b`;

    fireEvent.change(input, { target: { value: url501 } });
    expect(screen.getByText(/邀请码帮助链接不能超过 500 个字符/)).toBeTruthy();
    expect((screen.getByRole('button', { name: '保存配置' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(input, { target: { value: url500 } });
    expect(screen.queryByText(/邀请码帮助链接不能超过 500 个字符/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }));
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ code_help_url: url500 }),
    ));
  });
});
