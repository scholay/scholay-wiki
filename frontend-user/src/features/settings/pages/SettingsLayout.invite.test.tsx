// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ enabled: true }));

vi.mock('@/shared/api/invite-campaign', () => ({
  useInviteCampaign: () => ({ data: { enabled: mocks.enabled } }),
}));

vi.mock('react-router-dom', () => ({
  NavLink: ({ to, children, className }: {
    to: string;
    children: React.ReactNode;
    className?: string | ((state: { isActive: boolean }) => string);
  }) => (
    <a
      href={to}
      className={typeof className === 'function' ? className({ isActive: false }) : className}
    >
      {children}
    </a>
  ),
  Outlet: () => <div>settings-outlet</div>,
}));

import { SettingsLayout } from './SettingsLayout';

beforeEach(() => {
  mocks.enabled = true;
});

afterEach(() => cleanup());

describe('SettingsLayout invite section', () => {
  it('活动关闭时隐藏邀请分区，保留其他设置入口', () => {
    mocks.enabled = false;
    render(<SettingsLayout />);

    expect(screen.queryByRole('link', { name: '邀请好友' })).toBeNull();
    expect(screen.getByRole('link', { name: '账户资产' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '安全设置' })).toBeTruthy();
  });

  it('活动开启时在账户资产之后、安全设置之前展示独立邀请入口', () => {
    render(<SettingsLayout />);
    const nav = screen.getByRole('navigation');
    const labels = within(nav).getAllByRole('link').map((link) => link.textContent);

    expect(screen.getByRole('link', { name: '邀请好友' }).getAttribute('href')).toBe(
      '/settings/invite',
    );
    expect(labels).toEqual([
      '个人资料',
      '账户资产',
      '邀请好友',
      '安全设置',
      '已连接账号',
    ]);
  });
});
