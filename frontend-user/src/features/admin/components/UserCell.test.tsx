// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { UserLoginMethods } from '../api/users';

const mocks = vi.hoisted(() => ({
  permissions: new Set<string>(),
  refetchDetail: vi.fn(),
  useUserDetail: vi.fn(),
  useUserVipStatus: vi.fn(),
}));

vi.mock('../api/users', () => ({
  useUserDetail: (...args: unknown[]) => mocks.useUserDetail(...args),
  useUserVipStatus: (...args: unknown[]) => mocks.useUserVipStatus(...args),
}));

vi.mock('../permissions', () => ({
  PERM: {
    usersView: 'users.view',
    usersManage: 'users.manage',
    analyticsView: 'analytics.view',
  },
  useHasPermission: (permission: string) => mocks.permissions.has(permission),
  roleLabel: (role?: string) =>
    ({
      user: '用户',
      operations: '运营',
      admin: '管理员',
      super_admin: '超级管理员',
    })[role ?? ''] ??
    role ??
    '用户',
  roleBadgeVariant: () => 'muted',
}));

// 这两块有各自的远程查询，此处只验证用户详情推屏的路由与结构，
// 用空壳隔离子面板请求，避免把本测试变成财务/用量面板的集成测试。
vi.mock('./UserBillingPanels', () => ({ UserBillingSections: () => null }));
vi.mock('./UserUsageOverviewPanel', () => ({
  UserUsageOverviewPanel: () => null,
}));

import { AdminUserDetailProvider } from './AdminUserDetailProvider';
import { LAST_ACTIVE_LEGACY_HINT } from './TimeCell';
import { UserCell } from './UserCell';

const fullDetail: UserLoginMethods = {
  id: 42,
  username: 'Alice',
  email: 'alice@example.com',
  phone: null,
  avatar_url: null,
  bio: null,
  role: 'admin',
  status: 1,
  email_verified: true,
  phone_verified: false,
  last_login_at: null,
  last_login_ip: null,
  last_active_at: null,
  vip_tier: 'free',
  vip_expires_at: null,
  register_source: 'email',
  created_at: '2026-08-01T10:00:00Z',
  updated_at: '2026-08-02T10:00:00Z',
  auth_providers: [],
};

function detailQuery(overrides: Record<string, unknown> = {}) {
  return {
    data: fullDetail,
    error: null,
    isError: false,
    isLoading: false,
    refetch: mocks.refetchDetail,
    ...overrides,
  };
}

function renderCell(props: React.ComponentProps<typeof UserCell>) {
  return render(
    <AdminUserDetailProvider>
      <UserCell {...props} />
    </AdminUserDetailProvider>,
  );
}

beforeEach(() => {
  mocks.permissions.clear();
  mocks.permissions.add('users.view');
  mocks.refetchDetail.mockReset();
  mocks.useUserDetail.mockReset();
  mocks.useUserVipStatus.mockReset();
  mocks.useUserDetail.mockReturnValue(detailQuery());
  mocks.useUserVipStatus.mockReturnValue({
    data: undefined,
    error: null,
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  document.body.style.removeProperty('pointer-events');
  document.body.removeAttribute('data-scroll-locked');
});

describe('UserCell → 全局用户详情推屏', () => {
  it('有 user id 时点击 UserCell，通过 AdminUserDetailProvider 打开同一份 Sheet', () => {
    renderCell({ id: 42, name: 'Alice', email: 'alice@example.com' });

    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Alice\s*#42/ }));

    expect(mocks.useUserDetail).toHaveBeenCalledWith(42);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain(
      'Alice',
    );
    expect(screen.getByRole('heading', { name: '固定信息' })).toBeTruthy();
  });

  it('user id 为 null 时只显示匿名文案，不可点击也不会打开详情', () => {
    renderCell({ id: null, anonymousLabel: '未登录用户' });

    expect(screen.getByText('未登录用户')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(
      mocks.useUserDetail.mock.calls.every(([id]) => id === undefined),
    ).toBe(true);
  });

  it('详情加载失败时不伪造正常状态或角色，并可手动重试', () => {
    const failure = new Error('详情接口故障');
    mocks.useUserDetail.mockReturnValue(
      detailQuery({
        data: undefined,
        error: failure,
        isError: true,
        isLoading: false,
      }),
    );

    renderCell({ id: 77, name: '受影响账号' });
    fireEvent.click(screen.getByRole('button', { name: /受影响账号\s*#77/ }));

    // 加载失败时标题只能使用列表已知的身份种子；角色/状态必须等服务端事实。
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(
      '受影响账号',
    );
    expect(screen.queryByText('正常')).toBeNull();
    expect(screen.queryByText('管理员')).toBeNull();
    expect(screen.queryByText('超级管理员')).toBeNull();
    expect(screen.queryByText('运营')).toBeNull();
    expect(screen.queryByRole('heading', { name: '固定信息' })).toBeNull();
    expect(screen.getByText('加载失败：详情接口故障')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(mocks.refetchDetail).toHaveBeenCalledTimes(1);
  });

  it('管理员视图中财务区块紧跟固定信息，且位于账号状态之前', () => {
    mocks.permissions.add('users.manage');
    renderCell({ id: 42, name: 'Alice' });
    fireEvent.click(screen.getByRole('button', { name: /Alice\s*#42/ }));

    const sectionTitles = screen
      .getAllByRole('heading', { level: 4 })
      .map((heading) => heading.textContent);
    expect(sectionTitles.slice(0, 3)).toEqual([
      '固定信息',
      '账户与财务记录',
      '账号状态与登录',
    ]);
  });

  it('最后活跃会提示存量时间可能沿用旧口径', () => {
    mocks.permissions.add('analytics.view');
    renderCell({ id: 42, name: 'Alice' });
    fireEvent.click(screen.getByRole('button', { name: /Alice\s*#42/ }));

    expect(screen.getByText('账号最后活跃').getAttribute('title')).toBe(
      LAST_ACTIVE_LEGACY_HINT,
    );
  });
});
