// 额度/经费 toastr —— 对齐设计稿 scholay-money.pen「toastr 状态通知」:左色条 + 圆点 + 标题 + 正文 + 系统通知 pill + 关闭。
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import { quotaNavigate } from '@/shared/lib/quota-events';
import { isPhoneDevice } from '@/shared/lib/device';

type Kind = 'half' | 'almost' | 'reset' | 'recharge' | 'exhausted';

// 🔴 额度文案三条铁律(2026-08-13 产品拍板,全站额度提示共用,改文案前先读):
//   ① **不解释机制**。「本周期」「每 N 天」「重新计算周期」「重置」这类周期/重置口径一律不进用户文案 ——
//      规则本身在变,写进提示就会常年落后于实现(旧文案「用完后可等待自动恢复,或用手动恢复/经费继续」
//      就是这么过期的)。只说**状态**和**出路**。
//   ② **恢复时刻照常给**。绝对时刻(X月X日 HH:MM)是事实不是机制,必须露出 —— 给了时间,「等一等」
//      才是一条真实选项,提示才不只剩逼单一条路。动态正文由 QuotaNotifierGate 注入,
//      这里的 body 是拿不到 overview 时的兜底。
//   ③ **没有的出路不要提**。「立即恢复」只在账上真有次数时出现(与 QuotaComposerStrip 上区同一判定),
//      由调用方按 overview.reset_passes 注入 action;预设里绝不写死。
//      —— 旧后端文案对所有人都写「用 1 次重置次数马上恢复」,而次数为 0 是绝大多数用户的常态。
// 语域(2026-08-13):**书面、克制、不口语**。产品内提示尽量不用人称代词,不用语气词
//   (「吧 / 呢 / 啦 / 哦」)、不用反问句(「不想等?」)、不用俗语(「不花钱」「接着跑」)。
//   邮件与站内信统一第二人称「您」。
// 用词统一:用户侧只说「恢复」,不说「重置」。
//
// action:动作按钮(sonner 自绘结构内的次级入口)。to 是 PC 目的地;手机 UA 统一去 /m/me
// (移动端无 /settings/membership 对等页,裸跳会被设备 loader 送去 /m/feed 丢上下文)。
const PRESETS: Record<
  Kind,
  { color: keyof typeof COLOR; title: string; body: string; action?: { label: string; to: string } }
> = {
  half: {
    color: 'amber',
    title: '额度已使用一半',
    body: '剩余额度可继续使用',
    action: { label: '查看用量', to: '/settings/membership' },
  },
  almost: {
    // 琥珀而非红:还没到顶,是提醒不是故障(大厂调研:红色留给真失败)。
    color: 'amber',
    title: '额度即将用完',
    body: '额度将自动恢复',
    action: { label: '查看用量', to: '/settings/membership' },
  },
  reset: { color: 'green', title: '额度已恢复', body: '可继续使用' },
  recharge: {
    color: 'blue',
    title: '经费已到账',
    body: '开启「用经费继续」后,额度用完将自动使用经费',
    action: { label: '去开启', to: '/settings/membership?tab=recharge' },
  },
  exhausted: {
    color: 'amber',
    title: '额度已用完',
    body: '额度恢复后可继续使用',
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
 *  立即恢复 / 升级会员 / 用经费继续 / 充值经费 —— 与对话位额度条同一优先级序)。 */
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
