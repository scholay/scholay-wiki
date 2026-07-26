import { AlertCircle, Loader2 } from 'lucide-react';

/**
 * WS 连接状态徽章 —— 只用来提示"连接出状况", 不展示常态。
 *   - open: 连上了, 没必要打扰用户
 *   - idle: 还没有活跃 session (新对话空白态) → 本来就没东西可连, 等用户发第一句话才会建连。
 *           这里**绝不能显示"离线"**, 否则用户会以为坏了。
 *   - closed: 主动关闭 (切会话瞬间), 新连接会马上起来, 不值得提示。
 *   - displaced: 被其它窗口顶替, 已有专门的 banner, 不重复提示。
 * 只在 connecting / reconnecting / error 三种"确实在连 / 连不上"时出徽章。
 * 桌面 ClawPage 与移动 MobileClawPage 共用。
 */
export function ConnectionBadge({
  state,
  reconnectAttempt,
}: {
  state: string;
  reconnectAttempt: number;
}) {
  const variant: { label: string; cls: string; icon?: React.ReactNode } | null =
    state === 'connecting' || state === 'reconnecting'
      ? {
          label: reconnectAttempt > 0 ? `正在重连 (${reconnectAttempt})` : '正在连接',
          cls: 'bg-warning-soft text-brand-amber',
          icon: <Loader2 className="h-3 w-3 animate-spin" />,
        }
      : state === 'error'
        ? {
            label: '连接失败',
            cls: 'bg-danger-soft text-brand-red',
            icon: <AlertCircle className="h-3 w-3" />,
          }
        : null;

  if (!variant) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-12 font-medium ${variant.cls}`}
    >
      {variant.icon}
      {variant.label}
    </span>
  );
}
