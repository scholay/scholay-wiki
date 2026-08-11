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
    title: '本周期用量已过半',
    body: '用量按周期自动恢复,可先安排重要任务。',
    action: { label: '查看用量', to: '/settings/membership' },
  },
  almost: {
    // 琥珀而非红:还没到顶,是提醒不是故障(大厂调研:红色留给真失败)。
    color: 'amber',
    title: '即将达到本周期用量上限',
    body: '用完后可等待自动恢复,或用手动恢复/经费继续。',
    action: { label: '查看用量', to: '/settings/membership' },
  },
  reset: { color: 'green', title: '用量已恢复', body: '可以继续使用了。' },
  recharge: {
    color: 'blue',
    title: '经费已到账',
    body: '开启「用经费继续」后,额度用完会自动续跑,只扣超出部分。',
    action: { label: '去开启', to: '/settings/membership?tab=recharge' },
  },
  // 弹窗关闭后的 60s 冷却期内再次命中 6010 → 只出这条轻 toast,不重弹弹窗(QuotaNotifier 消费)。
  exhausted: {
    color: 'amber',
    title: '本周期用量已达上限',
    // 正文只讲恢复时刻(与 composer 额度条同口径);带绝对时间的动态正文由
    // QuotaNotifierGate 注入,这里是拿不到 overview 时的兜底。
    body: '额度恢复后可继续使用。',
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

/** 弹一条额度/经费状态 toastr。opts.action 覆盖预设动作(按用户状态注入:
 *  升级会员 / 重置额度 / 充值经费 / 用经费继续 —— 与对话位额度条同一优先级序)。 */
export function showQuotaToast(
  kind: Kind,
  opts?: { action?: { label: string; onClick: () => void }; body?: string },
) {
  const p = { ...PRESETS[kind], body: opts?.body || PRESETS[kind].body };
  const c = COLOR[p.color];
  const custom = opts?.action;
  const action = p.action; // const 提出来:闭包内保住 narrowing,不用非空断言
  toast.custom((id) => (
    // 点整条即关 —— 与其它 toast 一致(见 ToastHost)。custom toast 拿不到 sonner 自绘的关闭键
    // (它对 jsx 一律不渲染),所以这条自己挂 onClick;里面的动作键/关闭键本来就会 dismiss,
    // 冒泡上来再 dismiss 一次是幂等的,不用拦。
    <div
      onClick={() => toast.dismiss(id)}
      className="flex w-80 overflow-hidden rounded-12 border border-border bg-surface-card shadow-overlay"
    >
      <span className={cn('w-1 shrink-0', c.bar)} />
      <div className="flex flex-1 gap-2 p-3">
        <span className={cn('mt-1.5 size-2 shrink-0 rounded-pill', c.dot)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-14 font-medium text-foreground">{p.title}</p>
            <span className={cn('shrink-0 rounded-pill px-1.5 py-0.5 text-12', c.pill, c.text)}>系统通知</span>
          </div>
          <p className="mt-1 text-12 leading-paragraph text-muted-foreground">{p.body}</p>
          <div className="mt-2 flex items-center gap-2">
            {custom && (
              <button
                onClick={() => {
                  toast.dismiss(id);
                  custom.onClick();
                }}
                className="inline-flex items-center rounded-8 bg-foreground px-2 py-1 text-12 font-medium text-on-dark transition-colors hover:bg-foreground/90"
              >
                {custom.label}
              </button>
            )}
            {action && (
              <button
                onClick={() => {
                  toast.dismiss(id);
                  // 手机 UA:统一去 /m/me(移动「我的」承接会员/经费入口);PC 走各自深链。
                  quotaNavigate(isPhoneDevice() ? '/m/me' : action.to);
                }}
                className="inline-flex items-center rounded-8 border border-border px-2 py-1 text-12 font-medium text-foreground transition-colors hover:bg-surface-2"
              >
                {action.label}
              </button>
            )}
          </div>
        </div>
        <button onClick={() => toast.dismiss(id)} className="shrink-0 text-faint transition-colors hover:text-foreground">
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  ));
}
