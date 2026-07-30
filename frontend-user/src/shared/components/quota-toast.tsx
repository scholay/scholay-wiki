// 额度/经费 toastr —— 对齐设计稿 scholay-money.pen「toastr 状态通知」:左色条 + 圆点 + 标题 + 正文 + 系统通知 pill + 关闭。
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';

type Kind = 'half' | 'almost' | 'reset' | 'recharge';

// 0090 口径:重置只扣「重置次数」、经费买不到重置;经费的用途是「用经费继续」按量付费(须在账户资产开启)。
const PRESETS: Record<Kind, { color: keyof typeof COLOR; title: string; body: string }> = {
  half: { color: 'amber', title: '本周期额度已消耗过半', body: '建议优先处理关键科研任务;额度按 7 天周期到期自动恢复满额。' },
  almost: { color: 'red', title: '本周期额度即将耗尽', body: '剩余额度较少。耗尽后可使用重置次数立即重置,或等待周期到期自动恢复。' },
  reset: { color: 'green', title: '额度已重置', body: '本周期科研额度已重置为 100%,可继续使用。' },
  recharge: { color: 'blue', title: '经费购入成功', body: '经费已到账。在账户资产开启「用经费继续」,额度耗尽后可按量续用不中断。' },
};

const COLOR = {
  amber: { bar: 'bg-brand-amber', dot: 'bg-brand-amber', text: 'text-brand-amber', pill: 'bg-warning-soft' },
  red: { bar: 'bg-brand-red', dot: 'bg-brand-red', text: 'text-brand-red', pill: 'bg-danger-soft' },
  green: { bar: 'bg-brand-green', dot: 'bg-brand-green', text: 'text-brand-green', pill: 'bg-brand-green/10' },
  // 经费购入成功用信息蓝 —— 已收口到 --status-info(Figma 未定义状态色,为推导值)。
  blue: { bar: 'bg-status-info', dot: 'bg-status-info', text: 'text-status-info', pill: 'bg-status-info-soft' },
} as const;

/** 弹一条额度/经费状态 toastr。 */
export function showQuotaToast(kind: Kind) {
  const p = PRESETS[kind];
  const c = COLOR[p.color];
  toast.custom((id) => (
    <div className="flex w-80 overflow-hidden rounded-12 border border-border bg-surface-card shadow-overlay">
      <span className={cn('w-1 shrink-0', c.bar)} />
      <div className="flex flex-1 gap-2 p-3">
        <span className={cn('mt-1.5 size-2 shrink-0 rounded-pill', c.dot)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-14 font-medium text-foreground">{p.title}</p>
            <span className={cn('shrink-0 rounded-pill px-1.5 py-0.5 text-12', c.pill, c.text)}>系统通知</span>
          </div>
          <p className="mt-1 text-12 leading-paragraph text-muted-foreground">{p.body}</p>
        </div>
        <button onClick={() => toast.dismiss(id)} className="shrink-0 text-faint transition-colors hover:text-foreground">
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  ));
}
