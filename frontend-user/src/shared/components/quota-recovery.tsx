// 额度恢复动作的共享件 —— composer 额度条(QuotaComposerStrip)与「查看用量」弹窗
// (UsageDialog)共用同一份 mutation 与二次确认弹窗,行为/文案单一真源。
//
// 两条恢复路:
//   · 重置:POST /user/billing/reset(扣 1 次重置次数,立即满额)—— 必须二次确认。
//   · 用经费继续:PUT /user/billing/autopay {enabled:true} —— 弹窗确认后就地开启。
// 成功后统一 notifyQuotaRecovered()(有被拦消息时由额度条自动重发)+ 刷新 overview。
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { http, toApiError } from '@/shared/lib/http';
import { notifyQuotaRecovered } from '@/shared/lib/quota-events';
import { QUOTA_OVERVIEW_QUERY_KEY } from '@/shared/lib/quota-overview';

/** 重置额度 mutation(成功广播恢复 + 刷新 overview;onDone 由调用方收尾,如关确认弹窗)。 */
export function useResetQuotaMutation(onDone?: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await http.post('/user/billing/reset')).data,
    onSuccess: () => {
      onDone?.();
      notifyQuotaRecovered();
      void qc.invalidateQueries({ queryKey: QUOTA_OVERVIEW_QUERY_KEY });
    },
    onError: (err) =>
      toast.error(toApiError(err).message || '重置失败,次数未扣除,请稍后再试'),
  });
}

/** 开启「用经费继续」mutation(同上)。 */
export function usePaygMutation(onDone?: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await http.put('/user/billing/autopay', { enabled: true })).data,
    onSuccess: () => {
      onDone?.();
      notifyQuotaRecovered();
      void qc.invalidateQueries({ queryKey: QUOTA_OVERVIEW_QUERY_KEY });
    },
    onError: (err) =>
      toast.error(toApiError(err).message || '开启失败,设置未变更,请稍后再试'),
  });
}

/** 重置二次确认弹窗。note:上下文补充句(如对话位的「确认后消息会自动重新发送」)。 */
export function ResetConfirmDialog({
  open,
  onOpenChange,
  passes,
  pending,
  onConfirm,
  note,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  passes: number;
  pending: boolean;
  onConfirm: () => void;
  note?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>使用 1 次重置?</DialogTitle>
          <DialogDescription>
            立即恢复满额并重新计算周期
            {passes > 0 && (
              <>
                ,本次使用后剩余 <b className="text-foreground">{passes - 1}</b> 次
              </>
            )}
            。{note}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" size="sm">
              取消
            </Button>
          </DialogClose>
          <Button size="sm" onClick={onConfirm} disabled={pending}>
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            确认重置
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 「用经费继续」开启确认弹窗。 */
export function PaygConfirmDialog({
  open,
  onOpenChange,
  pending,
  onConfirm,
  note,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onConfirm: () => void;
  note?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>开启「用经费继续」?</DialogTitle>
          <DialogDescription>
            额度用完后自动使用经费,只扣超出额度的部分,可随时在「账户资产」关闭。{note}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" size="sm">
              取消
            </Button>
          </DialogClose>
          <Button size="sm" onClick={onConfirm} disabled={pending}>
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Zap className="size-3.5" />
            )}
            开启
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
