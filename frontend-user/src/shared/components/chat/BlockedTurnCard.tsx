import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/shared/ui/button';

/**
 * 「命中额度未发送」轮的收尾卡片 —— 三 agent(claw / smart-search / prism)共用。
 *
 * 蓝本 = claw MessageTurn 的内联琥珀卡(2026-07 上提到 shared,样式逐类保持一致):
 * 保留用户气泡 + 本卡片,给足三条出路(重发 / 解额度 / 忽略),消息已按 session 持久化
 * (localStorage,由各 feature 自管),跳支付宝充会员整页返回 / 换设备回来都能一键重发。
 *
 * 本组件不感知 feature:重发 / 弹全局重置弹窗 / 忽略 全部经 props 注入
 * (弹窗一般传 useQuotaStore 的 openReset;shared 不 import stores,保持依赖方向)。
 */
// 用户此刻是被拦下的:他最想确认的是「我这条消息还在不在」和「刚才那下扣我额度了吗」。
// 原文一上来就列我们的三条解法(重置次数 / 用经费继续 / 升级会员),把用户的两个问题晾着。
// 「没有产生任何消耗」与实现一致:PreUserMessage 钩子在转发给 agent **之前**就拒了,不会进 AddUsage。
const DEFAULT_SUBTEXT =
  '这条消息已经帮你留着了,刚才那下也没有产生任何消耗。额度恢复后点「重新发送」就能接着跑。';

export interface BlockedTurnCardProps {
  /** 点「重新发送」:清持久化 + 移除 blocked 轮 + 走该 feature 的正常发送路径。 */
  onResend?: () => void;
  /** 点「开通会员 / 重置额度」:打开全局额度重置弹窗(通常 = useQuotaStore().openReset)。 */
  onOpenReset?: () => void;
  /** 点「忽略」:清持久化 + 移除 blocked 轮(用户决定不再发这条)。 */
  onDismiss?: () => void;
  /** 覆盖默认副文(默认 = 重置次数 / 用经费继续 / 升级会员 三条出路的完整文案)。 */
  message?: string;
}

export function BlockedTurnCard({ onResend, onOpenReset, onDismiss, message }: BlockedTurnCardProps) {
  return (
    <div className="flex flex-col gap-2 rounded-16 border border-brand-amber/30 bg-warning-soft px-3 py-2.5">
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-brand-amber" />
        <div className="min-w-0 flex-1">
          <p className="text-14 font-medium text-foreground">AI 额度用完了,这条还没发出去</p>
          <p className="text-12 text-muted-foreground">{message ?? DEFAULT_SUBTEXT}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => onResend?.()}>
          <RefreshCw className="h-3.5 w-3.5" />
          重新发送
        </Button>
        <Button size="sm" variant="outline" onClick={() => onOpenReset?.()}>
          去恢复额度
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onDismiss?.()}>
          不发了
        </Button>
      </div>
    </div>
  );
}
