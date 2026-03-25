import React from 'react';
import { render, act } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';

jest.mock('../services/api', () => ({
  userAPI: {
    getProfile: jest.fn(),
    logout: jest.fn(),
    refreshToken: jest.fn(),
    getTokenInfo: jest.fn(),
  },
}));

jest.mock('../services/adminApi', () => ({
  adminAPI: {
    getProfile: jest.fn(),
  },
}));

jest.mock('../services/websocket', () => ({
  __esModule: true,
  default: {
    connect: jest.fn(),
    disconnect: jest.fn(),
    on: jest.fn(),
    getStatus: jest.fn(),
  },
}));

const wsClient = require('../services/websocket').default;

jest.mock('./logger', () => ({
  log: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const { userAPI } = require('../services/api');
const { adminAPI } = require('../services/adminApi');

const TestConsumer = ({ onRender }) => {
  const auth = useAuth();
  onRender(auth);
  return null;
};

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    wsClient.getStatus.mockReturnValue({ isConnected: false, isConnecting: false });
    wsClient.on.mockReturnValue(jest.fn());
  });

  it('provides default unauthenticated state', async () => {
    let authState;
    await act(async () => {
      render(
        <AuthProvider>
          <TestConsumer onRender={(state) => { authState = state; }} />
        </AuthProvider>
      );
    });

    expect(authState.isAuthenticated).toBe(false);
    expect(authState.user).toBeNull();
  });

  it('login sets authenticated state and stores token', async () => {
    let authState;
    await act(async () => {
      render(
        <AuthProvider>
          <TestConsumer onRender={(state) => { authState = state; }} />
        </AuthProvider>
      );
    });

    const testUser = { id: 1, email: 'test@test.com', role: 'user' };
    await act(async () => {
      authState.login('test-token', testUser);
    });

    expect(authState.isAuthenticated).toBe(true);
    expect(authState.user).toEqual(testUser);
    expect(localStorage.getItem('user_token')).toBe('test-token');
  });

  it('logout clears auth state', async () => {
    let authState;
    localStorage.setItem('user_token', 'test-token');
    localStorage.setItem('user_data', JSON.stringify({ id: 1, role: 'user' }));
    userAPI.getProfile.mockResolvedValue({ data: { code: 0, data: { id: 1, role: 'user' } } });

    await act(async () => {
      render(
        <AuthProvider>
          <TestConsumer onRender={(state) => { authState = state; }} />
        </AuthProvider>
      );
    });

    await act(async () => {
      await authState.logout();
    });

    expect(authState.isAuthenticated).toBe(false);
    expect(authState.user).toBeNull();
    expect(localStorage.getItem('user_token')).toBeNull();
  });

  it('refreshUser uses adminAPI for admin users', async () => {
    let authState;
    const adminUser = { id: 1, username: 'admin', role: 'admin' };
    localStorage.setItem('user_token', 'admin-token');
    localStorage.setItem('user_data', JSON.stringify(adminUser));

    adminAPI.getProfile.mockResolvedValue({ data: { code: 0, data: { id: 1, username: 'admin' } } });

    await act(async () => {
      render(
        <AuthProvider>
          <TestConsumer onRender={(state) => { authState = state; }} />
        </AuthProvider>
      );
    });

    adminAPI.getProfile.mockClear();
    adminAPI.getProfile.mockResolvedValue({ data: { code: 0, data: { id: 1, username: 'admin' } } });

    await act(async () => {
      await authState.refreshUser();
    });

    expect(adminAPI.getProfile).toHaveBeenCalled();
    expect(userAPI.getProfile).not.toHaveBeenCalled();
  });

  it('refreshUser uses userAPI for regular users', async () => {
    let authState;
    const regularUser = { id: 2, email: 'user@test.com', role: 'user' };
    localStorage.setItem('user_token', 'user-token');
    localStorage.setItem('user_data', JSON.stringify(regularUser));

    userAPI.getProfile.mockResolvedValue({ data: { code: 0, data: regularUser } });

    await act(async () => {
      render(
        <AuthProvider>
          <TestConsumer onRender={(state) => { authState = state; }} />
        </AuthProvider>
      );
    });

    userAPI.getProfile.mockClear();
    userAPI.getProfile.mockResolvedValue({ data: { code: 0, data: { ...regularUser, email: 'updated@test.com' } } });

    await act(async () => {
      await authState.refreshUser();
    });

    expect(userAPI.getProfile).toHaveBeenCalled();
    expect(adminAPI.getProfile).not.toHaveBeenCalled();
  });

  it('admin logout does not call userAPI.logout', async () => {
    let authState;
    const adminUser = { id: 1, username: 'admin', role: 'admin' };
    localStorage.setItem('user_token', 'admin-token');
    localStorage.setItem('user_data', JSON.stringify(adminUser));

    adminAPI.getProfile.mockResolvedValue({ data: { code: 0, data: adminUser } });

    await act(async () => {
      render(
        <AuthProvider>
          <TestConsumer onRender={(state) => { authState = state; }} />
        </AuthProvider>
      );
    });

    userAPI.logout.mockClear();
    await act(async () => {
      await authState.logout();
    });

    expect(userAPI.logout).not.toHaveBeenCalled();
  });
});
