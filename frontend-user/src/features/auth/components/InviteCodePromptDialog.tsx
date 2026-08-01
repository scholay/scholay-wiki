import { Ticket } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/shared/ui';
import { useInvitePromptStore } from '@/stores/invite-prompt.store';

/**
 * 新用户首次登录提醒补填邀请码 —— 仅一次。
 * 不在弹窗内填写，引导到账户资产「推广/邀请」tab。
 *
 * 本组件挂在 RouterProvider 之外(与 AuthDialog 同级),不能用 useNavigate,
 * 改走 location.assign 完成跳转。
 */
export function InviteCodePromptDialog() {
  const open = useInvitePromptStore((s) => s.open);
  const dismiss = useInvitePromptStore((s) => s.dismiss);

  const handleSkip = () => {
    dismiss();
  };

  const handleGoFill = () => {
    dismiss();
    window.location.assign('/settings/membership?tab=invite');
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleSkip();
      }}
    >
      <DialogContent className="max-w-md gap-0 p-0" dismissable>
        <div className="flex flex-col items-center gap-2 border-b border-border-soft px-6 pb-5 pt-7 text-center">
          <div className="flex size-11 items-center justify-center rounded-pill bg-brand-green/10">
            <Ticket className="size-5 text-brand-green" strokeWidth={2} />
          </div>
          <DialogTitle className="text-lg font-semibold">
            欢迎成为 Scholay 新用户
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            扫码或第三方注册时若未填写邀请码，可前往「账户资产 → 推广/邀请」补绑上级。本提示仅出现一次。
          </DialogDescription>
        </div>

        <DialogFooter className="gap-2 px-6 py-5 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            className="text-muted-foreground"
            onClick={handleSkip}
          >
            暂不填写
          </Button>
          <Button type="button" variant="primary" onClick={handleGoFill}>
            去推广/邀请
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
