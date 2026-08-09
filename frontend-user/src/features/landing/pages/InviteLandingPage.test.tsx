// @vitest-environment jsdom
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  code: 'ab0l2z',
  navigate: vi.fn(),
  capture: vi.fn(),
  confirm: vi.fn(),
  clear: vi.fn(),
  preview: vi.fn(),
  open: vi.fn(),
  authToken: null as string | null,
  currentCandidateCode: null as string | null,
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useParams: () => ({ code: mocks.code }),
    useNavigate: () => mocks.navigate,
  };
});

vi.mock('@/shared/components/BrandLogo', () => ({
  BrandLogo: () => <span>Scholay</span>,
}));

vi.mock('@/shared/api/invite-campaign', () => ({
  previewInviteCode: (...args: unknown[]) => mocks.preview(...args),
}));

vi.mock('../api/invite', () => ({
  recordInviteOpen: (...args: unknown[]) => mocks.open(...args),
}));

vi.mock('@/stores/invite.store', () => ({
  useInviteCandidate: Object.assign(
    (selector: (state: unknown) => unknown) =>
      selector({
        capture: mocks.capture,
        confirm: mocks.confirm,
        clear: mocks.clear,
      }),
    {
      getState: () => ({
        candidate: mocks.currentCandidateCode
          ? { code: mocks.currentCandidateCode, ts: Date.now() }
          : null,
        confirm: mocks.confirm,
        clear: mocks.clear,
      }),
    },
  ),
}));

vi.mock('@/shared/lib/auth-token', () => ({
  getAuthToken: () => mocks.authToken,
}));

import { InviteLandingPage } from './InviteLandingPage';

beforeEach(() => {
  mocks.code = 'ab0l2z';
  mocks.navigate.mockReset();
  mocks.authToken = null;
  mocks.currentCandidateCode = null;
  mocks.capture.mockReset().mockImplementation((code: string) => {
    mocks.currentCandidateCode = code;
  });
  mocks.confirm.mockReset();
  mocks.clear.mockReset().mockImplementation(() => {
    mocks.currentCandidateCode = null;
  });
  mocks.preview.mockReset();
  mocks.open.mockReset();
  mocks.open.mockResolvedValue({ valid: true });
});

afterEach(() => cleanup());

describe('/i/:code 邀请落地页', () => {
  it('预览有效时捕获并确认候选码，然后自动进入注册链路', async () => {
    mocks.preview.mockResolvedValue({
      valid: true,
      code: 'AB0L2Z',
      inviter_name: '张**',
    });

    render(
      <StrictMode>
        <InviteLandingPage />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(mocks.capture).toHaveBeenCalledWith('AB0L2Z');
      expect(mocks.preview).toHaveBeenCalledWith('AB0L2Z');
      expect(mocks.open).toHaveBeenCalledWith('AB0L2Z');
      expect(mocks.confirm).toHaveBeenCalledWith('AB0L2Z', '张**');
      expect(mocks.navigate).toHaveBeenCalledWith('/?invite=register', {
        replace: true,
      });
    });
    expect(mocks.preview).toHaveBeenCalledTimes(1);
    expect(mocks.open).toHaveBeenCalledTimes(1);
  });

  it('预览无效时清理候选码，不伪造邀请人信息', async () => {
    mocks.preview.mockResolvedValue({ valid: false });

    render(<InviteLandingPage />);

    await waitFor(() => {
      expect(mocks.clear).toHaveBeenCalledTimes(1);
      expect(mocks.navigate).toHaveBeenCalledWith('/?invite=register', {
        replace: true,
      });
    });
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it('旧 preview 迟到时不覆盖用户后来改填的新候选码', async () => {
    let resolvePreview!: (value: {
      valid: boolean;
      code: string;
      inviter_name: string;
    }) => void;
    mocks.preview.mockReturnValue(
      new Promise((resolve) => {
        resolvePreview = resolve;
      }),
    );
    render(<InviteLandingPage />);
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledTimes(1));

    mocks.currentCandidateCode = 'NEW999';
    resolvePreview({ valid: true, code: 'AB0L2Z', inviter_name: '张**' });
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();
  });

  it('已登录老账号转设置页主动确认，不自动打开注册', async () => {
    mocks.authToken = 'existing-user-token';
    mocks.preview.mockResolvedValue({ valid: true, code: 'AB0L2Z' });

    render(<InviteLandingPage />);

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith(
        '/settings/invite?bind=1',
        { replace: true },
      );
    });
  });
});
