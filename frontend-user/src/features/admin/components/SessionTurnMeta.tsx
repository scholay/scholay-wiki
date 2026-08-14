import { Clock3, Cpu, RefreshCw, Timer, Waypoints } from 'lucide-react';
import { Badge, type BadgeProps } from '@/shared/ui/badge';
import { cn } from '@/shared/lib/utils';
import type { AdminTranscriptTurn } from '../api/session-monitor';
import { formatBackendTime } from './TimeCell';

const STATUS_LABEL: Record<string, string> = {
  complete: '已完成',
  running: '生成中',
  failed: '失败',
  aborted: '已停止',
  blocked: '未发送',
};

const STATUS_VARIANT: Record<string, NonNullable<BadgeProps['variant']>> = {
  complete: 'success',
  running: 'warning',
  failed: 'destructive',
  aborted: 'muted',
  blocked: 'warning',
};

export function SessionStatusBadge({ status }: { status?: string | null }) {
  const normalized = status?.trim() || '';
  if (!normalized) return null;
  return (
    <Badge variant={STATUS_VARIANT[normalized] ?? 'outline'}>
      {STATUS_LABEL[normalized] ?? normalized}
    </Badge>
  );
}

/**
 * 管理端的轮级审计元信息。它是用户端会话视图之外唯一的附加层：
 * 不改动消息的气泡/工具/结果卡视觉，只补齐事故对时需要的模型、绝对时间与状态。
 */
export function SessionTurnMeta({ turn }: { turn: AdminTranscriptTurn }) {
  return (
    <footer className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border-soft pt-2 text-12 text-faint">
      <span className="inline-flex items-center gap-1 tabular-nums">
        <Waypoints className="size-3" />第 {turn.cursorSeq || turn.seq} 轮
      </span>
      <span
        className={cn(
          'inline-flex min-w-0 items-center gap-1',
          !turn.model && 'text-faint',
        )}
        title={
          turn.model
            ? turn.attempt > 0
              ? `最终尝试模型：${turn.model}`
              : `实际模型：${turn.model}`
            : '该历史轮次没有记录实际模型'
        }
      >
        <Cpu className="size-3 shrink-0" />
        <span className="max-w-52 truncate">{turn.model || '模型未记录'}</span>
      </span>
      <span
        className="inline-flex items-center gap-1 tabular-nums"
        title={`开始 ${formatBackendTime(turn.startedAt)}`}
      >
        <Clock3 className="size-3" />
        {formatBackendTime(turn.startedAt)}
      </span>
      {turn.durationMs != null && turn.durationMs >= 0 && (
        <span className="inline-flex items-center gap-1 tabular-nums">
          <Timer className="size-3" />
          {formatDuration(turn.durationMs)}
        </span>
      )}
      {turn.attempt > 0 && (
        <span
          className="inline-flex items-center gap-1 text-brand-amber"
          title={`该轮发生过 ${turn.attempt} 次 provider 重试`}
        >
          <RefreshCw className="size-3" />
          重试 {turn.attempt} 次
        </span>
      )}
      <span className="ml-auto">
        <SessionStatusBadge status={turn.status} />
      </span>
    </footer>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1_000) return `${Math.round(ms)} ms`;
  const seconds = Math.round(ms / 1_000);
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes} 分 ${rest} 秒` : `${minutes} 分`;
}
