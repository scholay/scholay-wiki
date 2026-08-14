import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InviteCampaign } from '@/shared/api/invite-campaign';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  queryOptions: null as null | { queryFn: () => Promise<InviteCampaign> },
  mutationOptions: null as null | {
    mutationFn: (campaign: InviteCampaign) => Promise<InviteCampaign>;
    onSuccess: (campaign: InviteCampaign) => void;
  },
  setQueryData: vi.fn(),
  invalidateQueries: vi.fn(),
}));

vi.mock('@/shared/lib/http', () => ({
  http: { get: mocks.get, put: mocks.put },
  toApiError: (error: unknown) => error,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: typeof mocks.queryOptions) => {
    mocks.queryOptions = options;
    return { data: undefined };
  },
  useMutation: (options: typeof mocks.mutationOptions) => {
    mocks.mutationOptions = options;
    return { mutateAsync: vi.fn(), isPending: false };
  },
  useQueryClient: () => ({
    setQueryData: mocks.setQueryData,
    invalidateQueries: mocks.invalidateQueries,
  }),
}));

import {
  useAdminInviteCampaign,
  useUpdateAdminInviteCampaign,
} from './invite-campaign';

const campaign = (): InviteCampaign => ({
  enabled: true,
  inviter_registration_credits: 100,
  invitee_registration_credits: 50,
  registration_daily_cap: 10,
  bind_window_days: 30,
  first_purchase_window_days: 30,
  first_purchase_rebate_bps: 1250,
  code_help_url: 'https://docs.scholay.com/invite',
});

beforeEach(() => {
  mocks.get.mockReset();
  mocks.put.mockReset();
  mocks.queryOptions = null;
  mocks.mutationOptions = null;
  mocks.setQueryData.mockReset();
  mocks.invalidateQueries.mockReset();
});

describe('admin invite campaign API contract', () => {
  it('GET 使用复数 /admin/invites/campaign，并解包 flat data', async () => {
    const payload = campaign();
    mocks.get.mockResolvedValue({ data: { data: payload } });

    useAdminInviteCampaign();
    const result = await mocks.queryOptions!.queryFn();

    expect(mocks.get).toHaveBeenCalledWith('/admin/invites/campaign');
    expect(result).toEqual(payload);
  });

  it('PUT 使用同一复数路径、原样提交 InviteCampaign，并解包 flat data', async () => {
    const input = campaign();
    const response = { ...input, updated_at: '2026-08-09T00:00:00Z' };
    mocks.put.mockResolvedValue({ data: { data: response } });

    useUpdateAdminInviteCampaign();
    const result = await mocks.mutationOptions!.mutationFn(input);

    expect(mocks.put).toHaveBeenCalledWith('/admin/invites/campaign', input);
    expect(result).toEqual(response);
  });
});
