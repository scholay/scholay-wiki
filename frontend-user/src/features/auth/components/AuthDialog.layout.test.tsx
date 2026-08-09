// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('@/stores/auth-dialog.store', () => ({
  useAuthDialog: () => ({
    open: true,
    mode: 'register',
    initialAccountType: 'email',
    setMode: vi.fn(),
    close: vi.fn(),
  }),
}));

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: { getState: () => ({ token: null }) },
}));

vi.mock('@/stores/pending-action.store', () => ({
  usePendingAction: { getState: () => ({ clear: vi.fn() }) },
}));

vi.mock('@/shared/components/BrandLogo', () => ({
  BrandLogo: () => <div data-testid="brand-logo" />,
}));

vi.mock('./LoginForm', () => ({ LoginForm: () => null }));
vi.mock('./RegisterForm', () => ({
  RegisterForm: () => <div data-testid="register-form" />,
}));
vi.mock('./ForgotPasswordForm', () => ({ ForgotPasswordForm: () => null }));
vi.mock('./OAuthRow', () => ({ OAuthRow: () => <div data-testid="oauth-row" /> }));
vi.mock('./WeChatQRPanel', () => ({ WeChatQRPanel: () => null }));
vi.mock('./InviteAuthNotice', () => ({
  InviteAuthNotice: ({ className }: { className?: string }) => (
    <div data-testid="invite-notice" className={className} />
  ),
}));

import { AuthDialog } from './AuthDialog';

afterEach(cleanup);

function expectClasses(element: Element, classes: string[]) {
  for (const className of classes) {
    expect(element.classList.contains(className), `缺少布局 class: ${className}`).toBe(true);
  }
}

describe('AuthDialog 横向收缩契约', () => {
  it('限制横向滚动，并允许注册表单与邀请卡所在的 grid item 收缩', () => {
    render(<AuthDialog />);

    expectClasses(screen.getByRole('dialog'), [
      'min-w-0',
      'grid-cols-[minmax(0,1fr)]',
      'overflow-x-hidden',
    ]);
    expectClasses(screen.getByTestId('register-form').parentElement!, ['min-w-0']);
    expectClasses(screen.getByTestId('invite-notice').parentElement!, ['min-w-0']);
    expectClasses(screen.getByTestId('invite-notice'), ['mx-0', 'mt-0']);
  });
});
