import { useEffect } from "react";
import {
  ExternalLink,
  Gift,
  Loader2,
  TicketCheck,
  UserPlus,
} from "lucide-react";
import { useInviteCampaign } from "@/shared/api/invite-campaign";
import { useUserInvite } from "@/shared/api/user-invite";
import { InviteShareMethods } from "@/shared/components/invite/InviteShareMethods";
import { InviteRewardPoster } from "@/shared/components/invite/InviteRewardPoster";
import { isPhoneDevice } from "@/shared/lib/device";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { useAuthDialog } from "@/stores/auth-dialog.store";
import { useIsAuthenticated } from "@/stores/auth.store";
import { useInviteEntry } from "@/stores/invite-entry.store";
import { router } from "./router";

/**
 * 全站“邀请有礼”的单一弹窗：匿名态先说清如何获取/稍后绑定，
 * 登录态直接提供链接、邀请码和二维码三种分享方式。
 */
export function InviteEntryDialog() {
  const open = useInviteEntry((state) => state.open);
  const closeInvite = useInviteEntry((state) => state.closeInvite);
  const authenticated = useIsAuthenticated();
  const openAuthDialog = useAuthDialog((state) => state.openDialog);
  const campaignQ = useInviteCampaign();
  const campaign = campaignQ.data;
  const campaignOn = campaign?.enabled === true;
  const inviteQ = useUserInvite(open && authenticated && campaignOn);

  useEffect(() => {
    if (open && campaign && !campaign.enabled) closeInvite();
  }, [campaign, closeInvite, open]);

  const startRegistration = () => {
    // 先关邀请弹窗，再打开全局注册弹窗，避免两层 Radix 锁交叠。
    closeInvite();
    openAuthDialog("register");
  };

  const openInviteSettings = () => {
    closeInvite();
    void router.navigate(isPhoneDevice() ? "/m/me/invite" : "/settings/invite");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) closeInvite();
      }}
    >
      <DialogContent className="min-w-0 max-w-2xl grid-cols-[minmax(0,1fr)] gap-3 overflow-x-hidden p-4 sm:p-6">
        {campaignQ.isLoading && !campaign ? (
          <div
            className="flex min-h-40 items-center justify-center"
            aria-label="正在加载邀请活动"
          >
            <Loader2 className="size-5 animate-spin text-faint" />
          </div>
        ) : !campaign ? (
          <InviteCampaignError onRetry={() => void campaignQ.refetch()} />
        ) : authenticated ? (
          <AuthenticatedInviteContent
            rewardOn={
              campaign.inviter_registration_credits > 0 ||
              campaign.first_purchase_rebate_bps > 0
            }
            inviteQuery={inviteQ}
            onOpenSettings={openInviteSettings}
          />
        ) : (
          <AnonymousInviteContent
            bindWindowDays={campaign.bind_window_days}
            inviterRegistrationCredits={campaign.inviter_registration_credits}
            inviteeRegistrationCredits={campaign.invitee_registration_credits}
            helpUrl={campaign.code_help_url}
            onRegister={startRegistration}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AnonymousInviteContent({
  bindWindowDays,
  inviterRegistrationCredits,
  inviteeRegistrationCredits,
  helpUrl,
  onRegister,
}: {
  bindWindowDays: number;
  inviterRegistrationCredits: number;
  inviteeRegistrationCredits: number;
  helpUrl: string;
  onRegister: () => void;
}) {
  const bothReceiveRegistrationGift =
    inviterRegistrationCredits > 0 && inviteeRegistrationCredits > 0;

  return (
    <>
      <DialogHeader className="min-w-0">
        <DialogTitle className="text-20 leading-sans">
          {bothReceiveRegistrationGift
            ? "通过邀请注册，双方都有礼"
            : "通过邀请注册，完成好友关联"}
        </DialogTitle>
        <DialogDescription className="leading-paragraph">
          获取好友的邀请码完成关联；暂时没有邀请码，也可以先注册。
        </DialogDescription>
      </DialogHeader>

      <InviteRewardPoster />

      <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="flex min-w-0 items-start gap-2 rounded-12 border border-brand-green/30 bg-brand-green/5 p-3 text-12 text-subtle">
          <Gift className="mt-px size-4 shrink-0 text-brand-green" />
          <span>
            {bothReceiveRegistrationGift
              ? `邀请人获得 ${inviterRegistrationCredits} 经费，受邀好友获得 ${inviteeRegistrationCredits} 经费。`
              : "完成邀请关联后，即可按活动规则参与邀请活动。"}
          </span>
        </div>
        <div className="flex min-w-0 items-start gap-2 rounded-12 border border-brand-green/30 bg-brand-green/5 p-3 text-12 text-subtle">
          <TicketCheck className="mt-px size-4 shrink-0 text-brand-green" />
          <span>
            没有邀请码也可以先注册，注册后 {bindWindowDays} 天内仍可补填邀请码。
          </span>
        </div>
      </div>

      {helpUrl && (
        <a
          href={helpUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-1 text-12 font-medium text-foreground hover:underline"
        >
          查看活动详情与获取邀请码方式
          <ExternalLink className="size-3.5" />
        </a>
      )}

      <DialogFooter className="min-w-0">
        <Button type="button" className="h-9 gap-2" onClick={onRegister}>
          <UserPlus className="size-4" />
          直接注册
        </Button>
      </DialogFooter>
    </>
  );
}

type InviteQuery = ReturnType<typeof useUserInvite>;

function AuthenticatedInviteContent({
  rewardOn,
  inviteQuery,
  onOpenSettings,
}: {
  rewardOn: boolean;
  inviteQuery: InviteQuery;
  onOpenSettings: () => void;
}) {
  return (
    <>
      <DialogHeader className="min-w-0">
        <DialogTitle className="text-20 leading-sans">
          {rewardOn ? "邀请好友，获得奖励" : "邀请好友使用 Scholay"}
        </DialogTitle>
        <DialogDescription className="leading-paragraph">
          分享专属链接、邀请码或二维码，好友注册后自动关联。
        </DialogDescription>
      </DialogHeader>

      <InviteRewardPoster />

      {inviteQuery.isLoading ? (
        <div
          className="flex min-h-44 items-center justify-center rounded-12 border border-border-hairline"
          aria-label="正在加载邀请信息"
        >
          <Loader2 className="size-5 animate-spin text-faint" />
        </div>
      ) : !inviteQuery.data?.code || !inviteQuery.data.url ? (
        <div className="rounded-12 border border-border-hairline bg-surface-1 p-4">
          <p className="text-14 font-medium text-foreground">
            邀请信息加载失败
          </p>
          <p className="mt-1 text-12 text-faint">
            请稍后重试，活动规则与邀请数据不会受影响。
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={() => void inviteQuery.refetch()}
          >
            重试
          </Button>
        </div>
      ) : (
        <InviteShareMethods
          code={inviteQuery.data.code}
          url={inviteQuery.data.url}
        />
      )}

      <DialogFooter className="min-w-0">
        <Button
          type="button"
          variant="ghost"
          className="h-8 text-12"
          onClick={onOpenSettings}
        >
          查看邀请记录
        </Button>
      </DialogFooter>
    </>
  );
}

function InviteCampaignError({ onRetry }: { onRetry: () => void }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>邀请活动加载失败</DialogTitle>
        <DialogDescription>
          暂时无法获取活动规则，请稍后重试。
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onRetry}>
          重试
        </Button>
      </DialogFooter>
    </>
  );
}
