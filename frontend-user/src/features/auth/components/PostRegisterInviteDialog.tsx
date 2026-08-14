import { ExternalLink, Gift, TicketCheck } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/ui";
import { type InviteCampaign } from "@/shared/api/invite-campaign";

export function PostRegisterInviteDialog({
  open,
  campaign,
  onOpenChange,
  onFillCode,
}: {
  open: boolean;
  campaign: InviteCampaign;
  onOpenChange: (open: boolean) => void;
  onFillCode: () => void;
}) {
  const reward = campaign.invitee_registration_credits;
  const hasReward = reward > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 overflow-x-hidden p-5 sm:p-6">
        <div className="flex min-w-0 items-start gap-3 pr-8">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-12 bg-brand-red/10 text-brand-red">
            <Gift className="size-5" />
          </div>
          <div className="min-w-0 pt-0.5">
            <DialogTitle className="text-20 font-medium text-foreground">
              {hasReward ? "填写邀请码，领取邀请礼" : "填写好友邀请码"}
            </DialogTitle>
            <DialogDescription className="mt-1 text-12 leading-paragraph text-muted-foreground">
              注册后 {campaign.bind_window_days} 天内仍可补填并完成关联。
            </DialogDescription>
          </div>
        </div>

        {hasReward && (
          <div className="mt-4 flex min-w-0 items-center justify-between gap-3 rounded-12 border border-brand-green/25 bg-brand-green/5 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2 text-brand-green">
              <TicketCheck className="size-4 shrink-0" />
              <span className="text-12 font-medium">你可领取</span>
            </div>
            <strong className="shrink-0 text-20 font-medium tabular-nums text-foreground">
              {reward}
              <span className="ml-1 text-12 font-normal text-muted-foreground">
                经费
              </span>
            </strong>
          </div>
        )}

        <div className="mt-4 flex min-w-0 flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {campaign.code_help_url && (
            <Button
              asChild
              type="button"
              variant="ghost"
              className="h-10 sm:h-9"
            >
              <a
                href={campaign.code_help_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                获取邀请码
                <ExternalLink className="size-3.5" />
              </a>
            </Button>
          )}
          <Button
            type="button"
            onClick={onFillCode}
            className="h-10 gap-2 sm:h-9"
          >
            <TicketCheck className="size-4" />
            立即填写
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
