// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/shared/components/BrandLogo', () => ({
  BrandLogo: ({
    variant,
    className,
  }: {
    variant?: 'full' | 'mark';
    className?: string;
  }) => (
    <span
      data-testid="brand-logo"
      data-variant={variant ?? 'full'}
      className={className}
    />
  ),
}));

vi.mock('@/stores/auth.store', () => ({
  useIsAuthenticated: () => false,
}));

vi.mock('@/stores/auth-dialog.store', () => ({
  useAuthDialog: (
    selector: (state: { openDialog: ReturnType<typeof vi.fn> }) => unknown,
  ) => selector({ openDialog: vi.fn() }),
}));

vi.mock('@/shared/components/InviteNavButton', () => ({
  InviteNavButton: () => <button type="button">邀请有礼</button>,
}));

import { LandingNav } from './LandingNav';

afterEach(() => cleanup());

describe('LandingNav', () => {
  it('窄屏只显示 mark，sm 起切换为完整字标', () => {
    render(
      <MemoryRouter>
        <LandingNav />
      </MemoryRouter>,
    );

    const logos = screen.getAllByTestId('brand-logo');
    const mark = logos.find((logo) => logo.dataset.variant === 'mark');
    const full = logos.find((logo) => logo.dataset.variant === 'full');

    expect(mark?.className.split(' ')).toEqual(
      expect.arrayContaining(['sm:hidden']),
    );
    expect(full?.className.split(' ')).toEqual(
      expect.arrayContaining(['hidden', 'sm:inline-flex']),
    );
  });
});
