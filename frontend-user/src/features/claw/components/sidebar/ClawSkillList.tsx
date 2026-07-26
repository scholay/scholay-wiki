import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Sparkles, AlertTriangle, X } from 'lucide-react';
import { Switch } from '@/shared/ui';
import {
  DEFAULT_MAX_ENABLED,
  useInstalledSkills,
  useSetSkillEnabled,
  useUninstallSkill,
} from '@/shared/api/skills';

/**
 * ClawSkillList —— 智能助手技能启用列表(可复用 body)。
 * 加载/空态/列表+启用开关+上限提示+「仅对新对话生效」footer。
 *
 * 现由输入框底栏 ComposerSkillsButton 的 Popover 内嵌使用(技能面板已从侧边栏下线,统一收口到输入框入口)。
 * 上限从后端下发(DEFAULT_MAX_ENABLED 兜底),不再前端硬编码 5(B4)。
 *
 * 语义(对齐后端「建会话时冻结」):切换启用只对**新对话**生效,不热切当前会话;UI 明示并给「新对话应用」入口。
 * 数据 hook 落 shared/api/skills(claw 禁 import features/skills)。
 */
export function ClawSkillList({
  onNewConversation,
}: {
  onNewConversation: () => void;
}) {
  const { data, isLoading } = useInstalledSkills();
  const skills = data?.list;
  const maxEnabled = data?.maxEnabled ?? DEFAULT_MAX_ENABLED;
  const setEnabled = useSetSkillEnabled();
  const uninstall = useUninstallSkill();
  const enabledCount = skills?.filter((s) => s.enabled).length ?? 0;
  const atCap = enabledCount >= maxEnabled;

  if (isLoading) {
    return <p className="py-1 text-2xs text-faint">加载中…</p>;
  }
  if ((skills?.length ?? 0) === 0) {
    return (
      <Link
        to="/tools/skills"
        className="flex items-center gap-1.5 rounded-md border border-dashed border-border px-2 py-2 text-2xs text-muted-foreground hover:border-border-strong hover:text-foreground"
      >
        <Sparkles className="h-3.5 w-3.5 text-brand-green" />
        去市场安装技能
      </Link>
    );
  }
  return (
    <>
      <ul className="space-y-0.5">
        {skills!.map((s) => (
          <li
            key={s.skillId}
            className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-surface-2"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <span className="truncate text-xs text-subtle">{s.name}</span>
                {!s.available && (
                  <AlertTriangle
                    className="h-3 w-3 shrink-0 text-brand-amber"
                    aria-label="该技能已下架,新对话不会加载"
                  />
                )}
              </div>
            </div>
            {!s.available ? (
              // 下架/删除的失效项:不可再启用,给「移除」入口清理列表(审计 #21)。
              <button
                title="移除(该技能已下架)"
                className="rounded-4 p-0.5 text-faint hover:text-brand-red"
                onClick={() =>
                  uninstall.mutate(s.skillId, {
                    onError: (e) => toast.error((e as Error).message || '移除失败'),
                  })
                }
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : (
              <Switch
                checked={s.enabled}
                // 到上限后,未启用项不可再开(后端也会拒);启用项仍可关。
                disabled={!s.enabled && atCap}
                onCheckedChange={(v) =>
                  setEnabled.mutate(
                    { skillId: s.skillId, enabled: v },
                    {
                      onError: (e) =>
                        toast.error((e as Error).message || '切换失败'),
                    }
                  )
                }
              />
            )}
          </li>
        ))}
      </ul>
      {atCap && (
        <p className="mt-1 text-2xs text-brand-amber">
          已达 {maxEnabled} 个上限 —— 需先关闭一些才能启用其它技能。
        </p>
      )}
      <p className="mt-1.5 text-2xs leading-paragraph text-faint">
        启用变更仅对新对话生效。
        <button
          onClick={onNewConversation}
          className="ml-1 text-brand-green hover:underline"
        >
          在新对话中应用
        </button>
      </p>
    </>
  );
}
