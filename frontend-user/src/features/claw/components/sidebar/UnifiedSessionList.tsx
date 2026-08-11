import { useMemo, useState } from 'react';
import { Loader2, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { FEATURE_ICON, type TemplateFeature } from '../../lib/feature-meta';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { SidebarSection } from '@/shared/components/sidebar';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/shared/lib/utils';
import type { AgentSessionApi, AgentSessionItem } from '@/shared/api/agent-sessions';
import { computeSessionTitle } from '@/shared/lib/agent-session-title';
import { AgentRenameDialog, AgentDeleteDialog } from '@/shared/components/agent-session/AgentSessionDialogs';
import { clawSessions } from '../../api/session';
import { boltslidesSessions } from '../../api/boltslides-session';
import { sciDrawSessions } from '../../api/sci-draw-session';
import { statLabSessions } from '../../api/stat-lab-session';

/**
 * 统一会话历史 —— 把「智能助手(claw)」与「制作PPT(boltslides)」两个 feature 的会话**合并成一份列表**
 * 按 last_accessed_at 倒序,PPT 会话行前加一个小图标区分。点某条 → 激活并(若跨 feature)切换整页驱动的
 * feature。activate/rename/delete 按该行所属 feature 路由到对应 api。
 *
 * 用户诉求:chat 和 ppt 历史放一起、不分开。
 */
// 🔴 2026-08-06:这里**曾经漏了 `stat_lab`**,后果是数据分析会话在侧栏里完全不存在 ——
//    用户做完分析、关掉页面(或点「新对话」)之后就再也找不回来(实测账号已积累 245 条,
//    最新的比所有 claw 会话都新,却一条都看不见)。数据其实没丢:后端接口正常返回、
//    深链也挂得回去,但用户拿不到那个 URL。
//    颜色与文案改成**表驱动**(图标本来就走 FEATURE_ICON 单一真源):四个 feature 串三元
//    已经很难读,加第五个必然再漏一处。现在加 feature = 在下面这张表里加一行。
type Feature = TemplateFeature;

const FEATURE_BADGE: Record<Feature, { color: string; label: string }> = {
  // 普通对话刻意用 text-faint 弱化 —— 有图标保持一致,但不与创作模板抢注意力。
  claw: { color: 'text-faint', label: '对话' },
  boltslides: { color: 'text-brand-amber', label: '制作PPT' },
  sci_draw: { color: 'text-brand-green', label: '科研绘图' },
  stat_lab: { color: 'text-brand-red', label: '数据分析' },
};
type UnifiedItem = AgentSessionItem & { feature: Feature };

export function UnifiedSessionList({
  activeSessionId,
  onSelect,
  onNewConversation,
}: {
  activeSessionId: string | null;
  /** 点某条历史 → 父组件切到该 feature 并激活该会话。 */
  onSelect: (sessionId: string, feature: Feature) => void;
  /** 删光全部会话时回退到「新对话空白态」。 */
  onNewConversation: () => void;
}) {
  const token = useAuthStore((s) => s.token);
  const clawQ = clawSessions.useSessions();
  const pptQ = boltslidesSessions.useSessions();
  const drawQ = sciDrawSessions.useSessions();
  const statQ = statLabSessions.useSessions();
  const activateClaw = clawSessions.useActivateSession();
  const activatePpt = boltslidesSessions.useActivateSession();
  const activateDraw = sciDrawSessions.useActivateSession();
  const activateStat = statLabSessions.useActivateSession();
  const [renameTarget, setRenameTarget] = useState<UnifiedItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UnifiedItem | null>(null);

  const items = useMemo<UnifiedItem[]>(() => {
    const c = (clawQ.data ?? []).map((s) => ({ ...s, feature: 'claw' as const }));
    const p = (pptQ.data ?? []).map((s) => ({ ...s, feature: 'boltslides' as const }));
    const d = (drawQ.data ?? []).map((s) => ({ ...s, feature: 'sci_draw' as const }));
    const t = (statQ.data ?? []).map((s) => ({ ...s, feature: 'stat_lab' as const }));
    // last_accessed_at 是 ISO 字符串,字典序即时间序 → DESC。
    return [...c, ...p, ...d, ...t].sort((a, b) =>
      (b.lastAccessedAt || '').localeCompare(a.lastAccessedAt || ''),
    );
  }, [clawQ.data, pptQ.data, drawQ.data, statQ.data]);

  const API_FOR: Record<Feature, AgentSessionApi> = {
    claw: clawSessions,
    boltslides: boltslidesSessions,
    sci_draw: sciDrawSessions,
    stat_lab: statLabSessions,
  };
  const apiFor = (f: Feature): AgentSessionApi => API_FOR[f];
  const isLoading = clawQ.isLoading || pptQ.isLoading || drawQ.isLoading || statQ.isLoading;

  const handleActivate = async (item: UnifiedItem) => {
    if (item.sessionId === activeSessionId) return;
    try {
      const act = {
        claw: activateClaw,
        boltslides: activatePpt,
        sci_draw: activateDraw,
        stat_lab: activateStat,
      }[item.feature];
      await act.mutateAsync(item.sessionId);
      onSelect(item.sessionId, item.feature);
    } catch (err) {
      toast.error((err as Error).message || '切换会话失败');
    }
  };

  return (
    <SidebarSection id="unified-sessions" label={<span className="font-serif">会话历史</span>} prominent>
      {!token ? (
        <div className="px-4 py-3 text-12 text-faint">登录后可见历史会话</div>
      ) : isLoading ? (
        <div className="px-4 py-3 text-12 text-faint">加载中…</div>
      ) : items.length === 0 ? (
        <div className="px-4 py-3 text-12 text-faint">还没有会话, 发送第一句话即可开始</div>
      ) : (
        <div className="flex flex-col">
          {items.map((s) => (
            <SessionRow
              key={`${s.feature}:${s.sessionId}`}
              session={s}
              active={s.sessionId === activeSessionId}
              onActivate={() => handleActivate(s)}
              onRename={() => setRenameTarget(s)}
              onDelete={() => setDeleteTarget(s)}
            />
          ))}
        </div>
      )}

      {/* 弹窗常驻挂载(target=null → Radix open=false)。绝不在 open 时卸载 → 防 body pointer-lock
          泄漏致全站点击失灵(见 frontend CLAUDE.md 十)。target 携带 feature → 路由到对应 api。 */}
      <AgentRenameDialog
        api={apiFor(renameTarget?.feature ?? 'claw')}
        target={renameTarget}
        onClose={() => setRenameTarget(null)}
      />
      <AgentDeleteDialog
        api={apiFor(deleteTarget?.feature ?? 'claw')}
        target={deleteTarget}
        activeSessionId={activeSessionId}
        onClose={() => setDeleteTarget(null)}
        onActiveDeleted={() => {
          const next = items.find((x) => x.sessionId !== deleteTarget?.sessionId);
          if (!next) {
            onNewConversation(); // 就地清空(不 remount),删除弹窗随后 onClose 正常关闭
            return;
          }
          // 删「当前活跃」会话且有下一条:onSelect → ClawPage bump nonce → workspace key 变 → 整棵子树
          // (含此刻仍 open 的 Radix 删除弹窗)被 remount。若与本次 onClose 的 setState 同批提交,弹窗会
          // 从 open=true 直接被卸载、跳过 open→false 正常关闭 → body pointer-events 锁泄漏、全站点击失灵
          // (frontend CLAUDE.md 十/十一 铁律 + [[body-pointer-lock-click-dead]] 复发路径)。
          // 故**推迟一帧**触发 remount:让删除弹窗先在本次提交里 open=false 正常关闭(Radix 还原 body 锁),
          // 下一帧再切 feature/会话并 remount。
          requestAnimationFrame(() => onSelect(next.sessionId, next.feature));
        }}
      />
    </SidebarSection>
  );
}

function SessionRow({
  session,
  active,
  onActivate,
  onRename,
  onDelete,
}: {
  session: UnifiedItem;
  active: boolean;
  onActivate: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const { displayTitle, loading } = computeSessionTitle(
    session.title,
    session.createdAt,
    session.messageCount,
    active,
  );
  // feature 图标走单一真源 FEATURE_ICON(与模板卡同步,换图标只改一处)。颜色按 feature 区分,
  // 普通对话(claw)刻意用 text-faint 弱化视觉强度 —— 有图标保持一致,但不与创作模板抢注意力。
  const BadgeIcon = FEATURE_ICON[session.feature];
  const badge = (
    <BadgeIcon
      className={cn('size-3 shrink-0', FEATURE_BADGE[session.feature].color)}
      aria-label={FEATURE_BADGE[session.feature].label}
    />
  );

  return (
    <div
      className={cn(
        'group flex h-8 items-center gap-2 px-4 cursor-pointer transition-colors max-sm:h-11',
        active ? 'bg-surface-2' : 'hover:bg-surface-1',
      )}
      onClick={onActivate}
    >
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            'truncate text-14 flex items-center gap-1.5',
            active ? 'text-foreground font-medium' : 'text-subtle',
            loading && 'italic text-faint',
          )}
          title={displayTitle}
        >
          {loading ? (
            <Loader2 className="size-3 shrink-0 animate-spin" />
          ) : (
            badge
          )}
          <span className="truncate">{displayTitle}</span>
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex size-6 items-center justify-center rounded-4 text-faint opacity-0 group-hover:opacity-100 hover:bg-surface-2 hover:text-foreground data-[state=open]:opacity-100"
            aria-label="更多操作"
          >
            <MoreVertical className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-32">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onRename();
            }}
          >
            <Pencil className="size-3.5" />
            重命名
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="text-brand-red focus:text-brand-red"
          >
            <Trash2 className="size-3.5" />
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
