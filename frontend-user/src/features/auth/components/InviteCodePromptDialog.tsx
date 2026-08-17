import { useEffect, useState } from 'react';
import { CheckCircle2, CircleX, Gift, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  inviteReasonText,
  previewInviteCode,
  useBindInvite,
} from '@/shared/api/invite-campaign';
import { isPhoneDevice } from '@/shared/lib/device';
import { toApiError } from '@/shared/lib/http';
import { useDebounce } from '@/shared/hooks/useDebounce';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  Input,
} from '@/shared/ui';
import { cn } from '@/shared/lib/utils';
import { useInvitePromptStore } from '@/stores/invite-prompt.store';

/**
 * 新用户首次登录提醒补填邀请码 —— 仅一次。
 * 弹窗内可选填写；有效码才可点同排「确认关联」。
 *
 * 本组件挂在 RouterProvider 之外(与 AuthDialog 同级),不能用 useNavigate,
 * 链接触发走普通 <a href>。
 */
export function InviteCodePromptDialog() {
  const open = useInvitePromptStore((s) => s.open);
  const dismiss = useInvitePromptStore((s) => s.dismiss);
  const bind = useBindInvite();
  const [code, setCode] = useState('');
  const [previewed, setPreviewed] = useState<{
    code: string;
    valid: boolean;
  } | null>(null);
  const [checking, setChecking] = useState(false);
  const normalized = code.trim().toUpperCase();
  const debounced = useDebounce(normalized, 280);
  const invitePath = isPhoneDevice() ? '/m/me/invite' : '/settings/invite';
  const pending = Boolean(normalized) && (checking || normalized !== debounced);
  const settled =
    previewed !== null && previewed.code === normalized && !pending;
  const canSubmit = settled && previewed.valid && !bind.isPending;

  useEffect(() => {
    if (!open) {
      setCode('');
      setPreviewed(null);
      setChecking(false);
    }
  }, [open]);

  useEffect(() => {
    if (!debounced) {
      setPreviewed(null);
      setChecking(false);
      return;
    }
    let live = true;
    const started = Date.now();
    setChecking(true);
    setPreviewed(null);

    const settle = async (valid: boolean) => {
      const wait = 1000 - (Date.now() - started);
      if (wait > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, wait));
      }
      if (!live) return;
      setPreviewed({ code: debounced, valid });
      setChecking(false);
    };

    void previewInviteCode(debounced)
      .then((result) => settle(result.valid === true))
      .catch(() => settle(false));

    return () => {
      live = false;
    };
  }, [debounced]);

  const handleSkip = () => {
    setCode('');
    setPreviewed(null);
    setChecking(false);
    dismiss();
  };

  const handleBind = async () => {
    if (!canSubmit) return;
    try {
      const result = await bind.mutateAsync(normalized);
      if (result.status.bound) {
        const gift = result.rewards?.invitee_registration_credits ?? 0;
        toast.success(
          gift > 0 ? `关联成功，已获得 ${gift} 经费` : '邀请关联成功',
        );
        handleSkip();
        return;
      }
      toast.info(inviteReasonText(result.status.reason));
    } catch (error) {
      const apiError = toApiError(error);
      toast.error(apiError.message || '关联失败，请检查邀请码');
    }
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
            <Gift className="size-5 text-brand-green" strokeWidth={2} />
          </div>
          <DialogTitle className="text-lg font-semibold">
            获取专属会员折扣!
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            欢迎加入Scholay，填写您的邀请人，解锁新人福利!
          </DialogDescription>
        </div>

        <form
          className="flex flex-col gap-3 px-6 py-5"
          onSubmit={(e) => {
            e.preventDefault();
            void handleBind();
          }}
        >
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={16}
                placeholder="邀请码（选填）"
                aria-label="邀请码（选填）"
                autoComplete="off"
                className="h-10 pr-20 font-mono text-12 tracking-code"
              />
              {normalized ? (
                <span
                  className={cn(
                    'pointer-events-none absolute inset-y-0 right-3 flex items-center gap-1 text-12',
                    pending && 'text-faint',
                    settled && previewed.valid && 'text-brand-green',
                    settled && !previewed.valid && 'text-brand-red',
                  )}
                  aria-live="polite"
                >
                  {pending ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                      核验中
                    </>
                  ) : settled && previewed.valid ? (
                    <>
                      <CheckCircle2 className="size-3.5" aria-hidden />
                      有效
                    </>
                  ) : (
                    <>
                      <CircleX className="size-3.5" aria-hidden />
                      无效
                    </>
                  )}
                </span>
              ) : null}
            </div>
            <Button
              type="submit"
              disabled={!canSubmit}
              aria-busy={bind.isPending}
              className={cn(
                'h-10 min-w-[88px] shrink-0 px-4',
                bind.isPending && 'disabled:opacity-100',
              )}
            >
              {bind.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                '确认关联'
              )}
            </Button>
          </div>
          <p className="text-12 leading-relaxed text-muted-foreground">
            此消息仅提示一次，后续您可通过
            <a
              href={invitePath}
              onClick={handleSkip}
              className="font-semibold text-brand-blue underline underline-offset-2"
            >
              个人中心-邀请推广
            </a>
            页面完善邀请信息或邀请好友。
          </p>
        </form>

        <DialogFooter className="px-6 pb-5 pt-0 sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            className="text-muted-foreground"
            onClick={handleSkip}
          >
            暂不填写
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
