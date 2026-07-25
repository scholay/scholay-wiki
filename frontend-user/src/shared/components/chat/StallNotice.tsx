import { Hourglass } from 'lucide-react';
import { Button } from '@/shared/ui/button';

/**
 * 轮内无进展软提示(W5 P0-C2)—— busy 且 90s 没有任何新内容帧时,在会话工作区横幅区挂出。
 *
 * 语义:**软提示,不自动杀轮**(杀轮是 backend 轮级硬超时的职责)。长任务(如 5 分钟的 Bash)
 * 执行期本就无新帧,所以文案不判定"卡死",只给用户逃生口:
 *   - 「停止本轮」→ 调用方接 handleStop(已加固为永远有效的逃生口);
 *   - 「继续等待」→ 调用方复位 stalled 并重挂一轮计时。
 * 视觉沿用全站 amber 提示约定(warning-soft 底,不用红色,不惊慌)。
 */
export function StallNotice({
  onStop,
  onDismiss,
}: {
  onStop: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-brand-amber/30 bg-warning-soft px-3 py-2.5 text-xs">
      <Hourglass className="mt-0.5 size-3.5 shrink-0 text-brand-amber" strokeWidth={2.2} />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">这一轮已较长时间没有新进展</p>
        <p className="text-muted-foreground">
          复杂任务可能仍在执行;如不想继续等待,可停止本轮后重新发送。
        </p>
        <div className="mt-1.5 flex gap-2">
          <Button size="sm" variant="outline" className="h-7" onClick={onStop}>
            停止本轮
          </Button>
          <Button size="sm" variant="ghost" className="h-7" onClick={onDismiss}>
            继续等待
          </Button>
        </div>
      </div>
    </div>
  );
}
