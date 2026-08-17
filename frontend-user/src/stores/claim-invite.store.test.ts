import { afterEach, describe, expect, it } from 'vitest';
import { useClaimInvite } from './claim-invite.store';

afterEach(() => {
  useClaimInvite.getState().closeClaim();
});

describe('claim invite store', () => {
  it('默认打开填写场景，也可指定推广 / 获取', () => {
    useClaimInvite.getState().openClaim();
    expect(useClaimInvite.getState()).toMatchObject({
      open: true,
      scene: 'fill',
    });

    useClaimInvite.getState().openClaim('promote');
    expect(useClaimInvite.getState().scene).toBe('promote');

    useClaimInvite.getState().setScene('get');
    expect(useClaimInvite.getState().scene).toBe('get');

    useClaimInvite.getState().closeClaim();
    expect(useClaimInvite.getState().open).toBe(false);
  });
});
