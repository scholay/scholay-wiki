// 额度恢复动作的共享件 —— composer 额度条(QuotaComposerStrip)与「查看用量」弹窗
// (UsageDialog)共用同一份 mutation 与二次确认弹窗,行为/文案单一真源。
//
// 两条恢复路:
//   · 立即恢复:POST /user/billing/reset(扣 1 次次数,额度当场回满)—— 必须二次确认。
//     ⚠️ 端点与后端字段仍叫 reset/reset_passes(冻结契约),但**用户侧一律说「恢复」不说「重置」**
//     (2026-08-13 文案收口,三条铁律见 quota-toast.tsx 头部)。别照着接口名写文案。
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
      toast.error(toApiError(err).message || '恢复失败,恢复次数未扣除,请稍后重试'),
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
      toast.error(toApiError(err).message || '开启失败,设置未变更,请稍后重试'),
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
          {/* 不写「重新计算周期」:那是内部机制,用户只需要知道额度会回满、还剩几次。 */}
          <DialogTitle>立即恢复额度?</DialogTitle>
          <DialogDescription>
            额度将立即恢复至满额
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
            确认恢复
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
            额度用完后将自动使用经费,仅扣除超出额度的部分,可随时关闭。{note}
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
