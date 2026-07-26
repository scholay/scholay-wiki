import { AlertTriangle } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';

interface AgentDisplacedBannerProps {
  /** displaced 帧的提示文(后端 message;为空用兜底文案)。 */
  reason: string | null;
  /** 「切回这里」→ 抢回活跃权(本端重连把其他窗口顶下去)。 */
  onTakeOver: () => void;
  /** 容器额外类:各 feature 的水平内边距对齐其页面(如 px-4 / px-6)。 */
  className?: string;
}

/**
 * agent WS 多窗口接管提示条 —— 后端 displacement 路径下发 displaced 帧后,顶部出现一行,
 * 用户点「切回这里」调 takeOver 抢回活跃权(state 变 connecting→open 自动消失)。
 *
 * 智能搜索 / 智能助手共用(原本各手搓一份近乎逐字相同)。prism 用的是自己的紧凑组合状态条
 * (displaced/connecting/error 一条,prism-badge 风格),刻意不收口到这里。
 */
export function AgentDisplacedBanner({ reason, onTakeOver, className }: AgentDisplacedBannerProps) {
  return (
    <div
      className={cn(
        'shrink-0 bg-warning-soft border-b border-brand-amber/30 px-4 py-2.5 flex items-center justify-between gap-3',
        className,
      )}
    >
      <div className="flex items-center gap-2 text-12 text-brand-amber">
        <AlertTriangle className="size-3.5 shrink-0" />
        <span>{reason ?? '此会话已在其他窗口打开'}</span>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onTakeOver}
        className="h-7 px-3 text-12 shrink-0"
      >
        切回这里
      </Button>
    </div>
  );
}
