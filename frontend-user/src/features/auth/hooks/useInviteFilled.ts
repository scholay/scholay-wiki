import { useInviteCampaign, useInviteStatus } from '@/shared/api/invite-campaign';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { useAuthStatus } from '@/stores/auth.store';
import { useInviteCandidate } from '@/stores/invite.store';

/**
 * 当前用户是否已经填写 / 关联过邀请码。
 * 登录态以服务端 bound 为准；未登录看本地已验证或链接锁定码。
 */
export function useInviteFilled() {
  const { data: campaign } = useInviteCampaign();
  const { authenticated } = useAuthStatus();
  const statusQ = useInviteStatus(authenticated);
  const invitationLocked = useAuthDialog((s) => s.invitationLocked);
  const candidateValid = useInviteCandidate((s) => s.candidate?.valid === true);

  const campaignEnabled = campaign?.enabled === true;
  const ready = campaignEnabled && (!authenticated || !statusQ.isLoading);
  const filled = authenticated
    ? statusQ.data?.bound === true
    : invitationLocked || candidateValid;

  return { campaignEnabled, ready, filled };
}
