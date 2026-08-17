import { afterEach, describe, expect, it } from 'vitest';
import { useAuthDialog } from './auth-dialog.store';

afterEach(() => {
  useAuthDialog.getState().close();
});

describe('auth dialog pending oauth', () => {
  it('选中第三方后关闭或重新打开会清掉确认层', () => {
    useAuthDialog.getState().openDialog('register');
    useAuthDialog.getState().setPendingOAuth('github');
    expect(useAuthDialog.getState().pendingOAuth).toBe('github');

    useAuthDialog.getState().close();
    expect(useAuthDialog.getState().pendingOAuth).toBeNull();

    useAuthDialog.getState().setPendingOAuth('google');
    useAuthDialog.getState().openDialog('login');
    expect(useAuthDialog.getState().pendingOAuth).toBeNull();
  });
});
