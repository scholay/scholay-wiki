import {
  AgentRenameDialog,
  AgentDeleteDialog,
} from '@/shared/components/agent-session/AgentSessionDialogs';
import { clawSessions, type ClawSessionItem } from '../../api/session';

/**
 * 会话「重命名 / 删除」确认弹窗 —— 桌面侧边栏(ClawSessionList,经 AgentSessionList)与移动端历史抽屉
 * (MobileClawDrawer)共用。逻辑已收口到 shared AgentSessionDialogs;此处只把 claw 端点(clawSessions)
 * 绑上,保留 claw 命名给移动抽屉的现有 import,零改动。
 */

export function ClawRenameDialog(props: {
  target: ClawSessionItem | null;
  onClose: () => void;
}) {
  return <AgentRenameDialog api={clawSessions} {...props} />;
}

export function ClawDeleteDialog(props: {
  target: ClawSessionItem | null;
  activeSessionId: string | null;
  onClose: () => void;
  /** 删除的是当前活跃会话时回调(父组件切到下一条 / 新对话)。 */
  onActiveDeleted: () => void;
}) {
  return <AgentDeleteDialog api={clawSessions} {...props} />;
}
