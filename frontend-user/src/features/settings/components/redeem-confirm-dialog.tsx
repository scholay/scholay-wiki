// 礼品码兑换确认弹窗 —— 对齐设计稿「礼品码兑换确认弹窗 · 状态设计板」。
//  · 录入码后先 POST /redeem-code/preview 拿将授予的内容(对应活动 / 兑换内容)→ 弹「确认兑换会员」。
//  · 预览失败(无效/过期/用完/已兑换/已停用)→ 弹「兑换失败」态。
//  · 经费(credit)兑换暂不做独立确认态:后端若返 credit 码,这里也按通用「兑换内容」展示并兑换。
import { useEffect } from 'react';
import { Loader2, Ticket, XCircle, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog';
import { cn } from '@/shared/lib/utils';
import { toApiError } from '@/shared/lib/http';
import { notifyBillingChanged } from '@/shared/lib/quota-events';
import { useRedeemPreview, useRedeemCode, type CodePreview, type Tier } from '../api/membership';

const TIER_NAME: Record<Tier, string> = { free: '免费套餐', pro: 'Pro 套餐', max: 'Max 套餐' };

function grantContent(pv: CodePreview): string {
  if (pv.grant_kind === 'tier') {
    return `Scholay ${TIER_NAME[pv.grant_tier ?? 'pro']} · ${pv.grant_days ?? 30} 天`;
  }
  return `${pv.grant_credits ?? 0} ${pv.credit_kind === 'perm' ? '永久' : '临时'}科研经费`;
}

export interface RedeemConfirmDialogProps {
  code: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 兑换成功回调(用于清空输入)。 */
  onRedeemed?: () => void;
}

export function RedeemConfirmDialog({ code, open, onOpenChange, onRedeemed }: RedeemConfirmDialogProps) {
  const preview = useRedeemPreview();
  const redeem = useRedeemCode();

  // 打开时拉预览;关闭时清状态(下次打开重新校验)。
  useEffect(() => {
    if (open && code) preview.mutate(code);
    if (!open) {
      preview.reset();
      redeem.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, code]);

  const pv = preview.data;
  const failMsg = preview.isError ? toApiError(preview.error).message || '激活码无效或已被兑换' : '';

  const onConfirm = async () => {
    try {
      const res = await redeem.mutateAsync(code);
      notifyBillingChanged(); // 刷新账户资产卡 / 全局额度
      if (res.kind === 'tier') {
        toast.success(`兑换成功!${TIER_NAME[res.tier ?? 'pro']}有效期至 ${res.expires_at?.slice(0, 10)}`);
      } else {
        toast.success(`兑换成功!到账 ${res.credits} ${res.credit_kind === 'perm' ? '永久' : '临时'}经费`);
      }
      onRedeemed?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(toApiError(err).message || '兑换失败');
    }
  };

  const loading = preview.isPending;
  const ok = !!pv;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0">
        {/* a11y:Radix 要求 DialogTitle;真实标题在各状态体里,这里挂个 sr-only 兜底。 */}
        <DialogTitle className="sr-only">兑换码确认</DialogTitle>
        {/* 顶部色条:确认=蓝 / 失败=红 / 校验中=灰。.pen 状态板配色无对应 token, 保留 arbitrary。 */}
        <span className={cn('block h-1 w-full', loading ? 'bg-border' : ok ? 'bg-[#0066FF]' : 'bg-brand-red')} />
        <div className="p-6">
          {loading ? (
            <div className="flex h-40 flex-col items-center justify-center gap-3 text-faint">
              <Loader2 className="size-6 animate-spin" />
              <span className="text-xs">正在校验兑换码…</span>
            </div>
          ) : ok ? (
            <ConfirmBody pv={pv} busy={redeem.isPending} onCancel={() => onOpenChange(false)} onConfirm={onConfirm} />
          ) : (
            <FailBody code={code} msg={failMsg} onRetry={() => onOpenChange(false)} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className={cn('truncate text-right text-xs font-bold', accent ? 'text-brand-amber' : 'text-foreground')}>
        {value}
      </span>
    </div>
  );
}

function ConfirmBody({
  pv,
  busy,
  onCancel,
  onConfirm,
}: {
  pv: CodePreview;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isCredit = pv.grant_kind === 'credit';
  return (
    <>
      <span className="inline-flex items-center gap-1 text-2xs font-bold tracking-wide text-brand-red">
        <Ticket className="size-3" /> 礼品码兑换 · {isCredit ? '经费' : '会员'}
      </span>
      <h2 className="mt-2 text-lg font-bold text-foreground">
        {isCredit ? '确认兑换科研经费?' : '确认兑换会员权益?'}
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {isCredit
          ? '该礼品码将为当前账号充入对应科研经费,兑换后立即到账。'
          : '该礼品码将为当前账号开通对应会员权益,兑换后立即生效、到期后自动失效。'}
      </p>
      <div className="mt-4 flex flex-col gap-3 rounded-md border border-border bg-surface-1 p-4">
        <InfoRow label="对应活动" value={pv.note || '通用兑换码'} />
        <InfoRow label="兑换内容" value={grantContent(pv)} accent />
      </div>
      <p className="mt-3 flex items-start gap-1.5 text-2xs leading-relaxed text-faint">
        <span className="mt-1 size-1.5 shrink-0 rounded-pill bg-[#0066FF]" />
        兑换后立即生效,同一兑换码每个账号仅可兑换一次,兑换码不可重复使用。
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          取消
        </Button>
        <Button size="sm" onClick={onConfirm} disabled={busy}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          {isCredit ? '确认兑换经费' : '确认兑换会员'}
        </Button>
      </div>
    </>
  );
}

function FailBody({ code, msg, onRetry }: { code: string; msg: string; onRetry: () => void }) {
  return (
    <>
      <span className="inline-flex items-center gap-1 text-2xs font-bold tracking-wide text-brand-red">
        <XCircle className="size-3" /> 兑换失败
      </span>
      <div className="mt-2 flex items-start gap-2">
        <XCircle className="mt-0.5 size-5 shrink-0 text-brand-red" />
        <h2 className="text-lg font-bold text-foreground">{msg || '激活码无效或已被兑换'}</h2>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        请确认兑换码是否正确。若兑换码已被使用、已过期或已停用,则无法再次兑换。
      </p>
      <div className="mt-4 rounded-md border border-border bg-surface-1 px-3 py-2.5">
        <span className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-subtle">
          <Ticket className="size-3.5 shrink-0 text-faint" /> {code || '—'}
        </span>
      </div>
      <p className="mt-3 flex items-start gap-1.5 text-2xs leading-relaxed text-faint">
        <span className="mt-1 size-1.5 shrink-0 rounded-pill bg-brand-red" />
        如确认兑换码无误仍无法兑换,请联系客服协助处理。
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => window.location.assign('/contact')}>
          联系客服
        </Button>
        <Button size="sm" onClick={onRetry}>
          重新输入
        </Button>
      </div>
    </>
  );
}
