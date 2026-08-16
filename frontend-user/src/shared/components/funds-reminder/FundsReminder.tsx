// 「经费不足提醒充值」—— 同一份内容模型,两种投放形态:
//   · FundsReminderChatNotice:对话消息流末尾的特殊消息体(claw / smart-search / prism 挂载);
//   · FundsReminderDialog:非对话页面的全局弹窗(providers 层挂载)。
//
// 内容按三个条件派生(useFundsReminderModel):
//   ① 会员档位 free / pro / max —— 决定升级路(free→升级会员,pro→升级 Max,max 不出升级键);
//   ② 是否有经费 —— 有 → 「用经费继续」,无 → 「充值经费」(free 档不出按量付费路,先引导升级);
//   ③ 是否有刷新券(恢复次数)—— 有 → 单独一行「立即恢复」,零成本路永远排最前。
// 按钮全部接真实恢复链路(quota.store 的确认/升级弹窗 + 会员页深链),与
// QuotaComposerStrip / 耗尽 toast 的优先级序一致;文案遵守 quota-toast.tsx 头部三条铁律。
import { useEffect } from 'react';
import {
  Coins,
  RefreshCw,
  TrendingUp,
  Wallet,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { useBillingSnapshot } from '@/shared/api/membership';
import { formatResetAt } from '@/shared/lib/quota-display';
import { quotaNavigate } from '@/shared/lib/quota-events';
import { isPhoneDevice } from '@/shared/lib/device';
import { useQuotaStore } from '@/stores/quota.store';
import { useFundsReminderStore } from '@/stores/funds-reminder.store';

interface ReminderAction {
  key: string;
  label: string;
  icon: LucideIcon;
  variant: 'default' | 'outline';
  run: () => void;
}

interface ReminderModel {
  title: string;
  /** 正文行(状态 + 出路说明;恢复时刻单独一行)。 */
  lines: string[];
  /** 可用恢复次数(>0 时渲染「立即恢复」独立行)。 */
  passes: number;
  onReset: () => void;
  actions: ReminderAction[];
}

/**
 * 按当前计费快照(mock 面板可切)派生提醒内容。
 * @param onAction 任一动作按钮按下后的收尾(弹窗关自己;消息体保留)。
 */
function useFundsReminderModel(onAction?: () => void): ReminderModel {
  const { data } = useBillingSnapshot();
  const openSubscribe = useQuotaStore((s) => s.openSubscribe);
  const openConfirmReset = useQuotaStore((s) => s.openConfirmReset);
  const openConfirmPayg = useQuotaStore((s) => s.openConfirmPayg);

  const tier = data?.tier ?? 'free';
  const creditTotal = data?.creditTotal ?? 0;
  const autopayOn = data?.creditAutopay ?? false;
  const passes = data?.resetPasses ?? 0;
  const hasCredit = creditTotal > 0;
  const canOpenPayg = hasCredit && !autopayOn;
  const resetAtText = formatResetAt(data?.token.window_reset_at);

  const wrap = (run: () => void) => () => {
    onAction?.();
    run();
  };
  const goUpgrade = wrap(() => {
    if (isPhoneDevice()) quotaNavigate('/m/me?upgrade=1');
    else openSubscribe();
  });
  const goRecharge = wrap(() =>
    quotaNavigate(isPhoneDevice() ? '/m/me' : '/settings/membership?tab=recharge'),
  );

  const lines: string[] = [];
  if (tier === 'free') {
    lines.push(
      hasCredit
        ? `账户内有经费 ¥${creditTotal},升级会员后可开启「用经费继续」。`
        : '升级会员可获得更高额度与赠送经费。',
    );
  } else {
    lines.push(
      hasCredit
        ? `账户内仍有经费 ¥${creditTotal},可开启「用经费继续」。`
        : '账户经费为 0,充值后可继续使用。',
    );
  }
  if (resetAtText) lines.push(`${resetAtText} 恢复满额。`);

  const actions: ReminderAction[] = [];
  if (tier !== 'max') {
    actions.push({
      key: 'upgrade',
      label: tier === 'free' ? '升级会员' : '升级 Max',
      icon: TrendingUp,
      variant: 'default',
      run: goUpgrade,
    });
  }
  if (tier !== 'free') {
    actions.push(
      canOpenPayg
        ? {
            key: 'payg',
            label: '用经费继续',
            icon: Zap,
            variant: tier === 'max' ? 'default' : 'outline',
            run: wrap(openConfirmPayg),
          }
        : {
            key: 'recharge',
            label: '充值经费',
            icon: Coins,
            variant: tier === 'max' ? 'default' : 'outline',
            run: goRecharge,
          },
    );
  }

  return {
    title: hasCredit ? '额度已用完' : '经费不足',
    lines,
    passes,
    onReset: wrap(openConfirmReset),
    actions,
  };
}

/**
 * 对话消息流内的特殊消息体。三个对话工作区(claw / smart-search / prism)在消息列表
 * 末尾常挂本组件:挂载即注册宿主(供触发端分流),激活前渲染 null。
 */
export function FundsReminderChatNotice() {
  const activeAt = useFundsReminderStore((s) => s.chatNoticeAt);
  const dismiss = useFundsReminderStore((s) => s.dismissChatNotice);
  const registerHost = useFundsReminderStore((s) => s.registerHost);
  const unregisterHost = useFundsReminderStore((s) => s.unregisterHost);
  const model = useFundsReminderModel();

  useEffect(() => {
    registerHost();
    return unregisterHost;
  }, [registerHost, unregisterHost]);

  if (activeAt === 0) return null;

  return (
    <div
      role="status"
      className="flex flex-col overflow-hidden rounded-16 border border-brand-amber/30 bg-warning-soft"
    >
      {model.passes > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-brand-amber/20 px-3 py-2">
          <RefreshCw className="size-3.5 shrink-0 text-brand-amber" />
          <p className="min-w-0 flex-1 text-12 text-foreground">
            可立即恢复 <b className="font-medium">{model.passes}</b> 次,不消耗经费
          </p>
          <Button size="sm" className="h-7" onClick={model.onReset}>
            立即恢复
          </Button>
        </div>
      )}
      <div className="flex flex-col gap-2 px-3 py-2.5">
        <div className="flex items-start gap-2">
          <Wallet className="mt-0.5 size-4 shrink-0 text-brand-amber" />
          <div className="min-w-0 flex-1">
            <p className="text-14 font-medium text-foreground">{model.title}</p>
            {model.lines.map((line) => (
              <p key={line} className="text-12 text-muted-foreground">
                {line}
              </p>
            ))}
          </div>
          <button
            type="button"
            aria-label="关闭提醒"
            onClick={dismiss}
            className="shrink-0 rounded-4 p-1 text-faint transition-colors hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {model.actions.map((action) => (
            <Button
              key={action.key}
              size="sm"
              variant={action.variant}
              className="h-7"
              onClick={action.run}
            >
              <action.icon className="size-3.5" />
              {action.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 非对话页面的提醒弹窗(providers 层常驻挂载,open 受控 —— Radix 收尾铁律)。 */
export function FundsReminderDialog() {
  const open = useFundsReminderStore((s) => s.dialogOpen);
  const closeDialog = useFundsReminderStore((s) => s.closeDialog);
  const model = useFundsReminderModel(closeDialog);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeDialog()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="size-4 text-brand-amber" />
            {model.title}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-1">
              {model.lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </DialogDescription>
        </DialogHeader>
        {model.passes > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-12 border border-brand-amber/30 bg-warning-soft px-3 py-2">
            <RefreshCw className="size-3.5 shrink-0 text-brand-amber" />
            <p className="min-w-0 flex-1 text-12 text-foreground">
              可立即恢复 <b className="font-medium">{model.passes}</b> 次,不消耗经费
            </p>
            <Button size="sm" className="h-7" onClick={model.onReset}>
              立即恢复
            </Button>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={closeDialog}>
            稍后再说
          </Button>
          {model.actions.map((action) => (
            <Button key={action.key} size="sm" variant={action.variant} onClick={action.run}>
              <action.icon className="size-3.5" />
              {action.label}
            </Button>
          ))}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
