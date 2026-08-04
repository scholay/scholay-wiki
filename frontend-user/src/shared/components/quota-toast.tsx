// 额度/经费 toastr —— 对齐设计稿 scholay-money.pen「toastr 状态通知」:左色条 + 圆点 + 标题 + 正文 + 系统通知 pill + 关闭。
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import { quotaNavigate } from '@/shared/lib/quota-events';
import { isPhoneDevice } from '@/shared/lib/device';

type Kind = 'half' | 'almost' | 'reset' | 'recharge' | 'exhausted';

// 0090 口径:重置只扣「重置次数」、经费买不到重置;经费的用途是「用经费继续」按量付费(须在账户资产开启)。
// action:动作按钮(sonner 自绘结构内的次级入口)。to 是 PC 目的地;手机 UA 统一去 /m/me
// (移动端无 /settings/membership 对等页,裸跳会被设备 loader 送去 /m/feed 丢上下文)。
const PRESETS: Record<
  Kind,
  { color: keyof typeof COLOR; title: string; body: string; action?: { label: string; to: string } }
> = {
  half: {
    color: 'amber',
    title: 'AI 额度用掉一半了',
    body: '还够用一阵,重要的活可以先做。额度每 7 天自动回满;想不受影响地继续,可以开「用经费继续」。',
    action: { label: '查看用量', to: '/settings/membership' },
  },
  almost: {
    color: 'red',
    title: 'AI 额度快用完了',
    body: '用完之后:等它自动回满、用 1 次重置次数当场回满,或者开「用经费继续」按实际用量接着跑。',
    action: { label: '查看用量', to: '/settings/membership' },
  },
  reset: { color: 'green', title: '额度已回满', body: '可以接着用了。' },
  recharge: {
    color: 'blue',
    title: '经费已到账',
    body: '在「账户资产」打开「用经费继续」,额度用完时就能自动接着跑,只扣超出的那部分。',
    action: { label: '去开启', to: '/settings/membership?tab=recharge' },
  },
  // 弹窗关闭后的 60s 冷却期内再次命中 6010 → 只出这条轻 toast,不重弹弹窗(QuotaNotifier 消费)。
  exhausted: {
    color: 'red',
    title: 'AI 额度用完了',
    body: '用 1 次重置次数当场回满、升级会员,或者开「用经费继续」按实际用量接着跑。',
    action: { label: '查看用量', to: '/settings/membership' },
  },
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
  const action = p.action; // const 提出来:闭包内保住 narrowing,不用非空断言
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
          {action && (
            <button
              onClick={() => {
                toast.dismiss(id);
                // 手机 UA:统一去 /m/me(移动「我的」承接会员/经费入口);PC 走各自深链。
                quotaNavigate(isPhoneDevice() ? '/m/me' : action.to);
              }}
              className="mt-2 inline-flex items-center rounded-8 border border-border px-2 py-1 text-12 font-medium text-foreground transition-colors hover:bg-surface-2"
            >
              {action.label}
            </button>
          )}
        </div>
        <button onClick={() => toast.dismiss(id)} className="shrink-0 text-faint transition-colors hover:text-foreground">
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  ));
}
