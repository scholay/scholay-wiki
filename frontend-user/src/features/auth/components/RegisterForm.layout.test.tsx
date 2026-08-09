// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverStub);

vi.mock('../api/auth', () => ({
  useRegisterEmail: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useRegisterPhone: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useSendEmailCode: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useSendPhoneCode: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));

vi.mock('../api/public-config', () => ({
  usePublicConfig: () => ({
    data: {
      require_email_verification: true,
      enable_turnstile: false,
      turnstile_site_key: '',
    },
    isLoading: false,
  }),
}));

vi.mock('@/stores/auth-dialog.store', () => ({
  useAuthDialog: (selector: (state: { close: () => void }) => unknown) =>
    selector({ close: vi.fn() }),
}));

vi.mock('@/shared/hooks', () => ({
  useApiToast: () => ({ show: vi.fn() }),
}));

vi.mock('@/shared/lib/track', () => ({ trackEvent: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { RegisterForm } from './RegisterForm';

afterEach(cleanup);

describe('RegisterForm 验证码行布局', () => {
  it('输入框可收缩，与固定宽度的发送按钮共存时不撑宽弹窗', () => {
    render(<RegisterForm initialAccountType="email" onSwitchMode={vi.fn()} />);

    const codeInput = screen.getByPlaceholderText('6 位数字');
    expect(codeInput.classList.contains('min-w-0')).toBe(true);
    expect(codeInput.classList.contains('flex-1')).toBe(true);
    expect(codeInput.parentElement?.classList.contains('min-w-0')).toBe(true);
  });
});
