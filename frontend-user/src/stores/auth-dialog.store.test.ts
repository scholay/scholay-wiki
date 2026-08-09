import { afterEach, describe, expect, it } from 'vitest';
import { useAuthDialog } from './auth-dialog.store';

afterEach(() => {
  useAuthDialog.getState().close();
});

describe('auth dialog invite-flow suppression', () => {
  it('OAuth merge 目标账号标记在关闭时立即复位', () => {
    useAuthDialog.getState().openDialog('login', {
      accountType: 'email',
      suppressInviteFlow: true,
    });
    expect(useAuthDialog.getState().suppressInviteFlow).toBe(true);

    useAuthDialog.getState().close();
    expect(useAuthDialog.getState().suppressInviteFlow).toBe(false);

    useAuthDialog.getState().openDialog('login');
    expect(useAuthDialog.getState().suppressInviteFlow).toBe(false);
  });
});
