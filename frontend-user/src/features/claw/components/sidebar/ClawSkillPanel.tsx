import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Sparkles, ArrowRight, AlertTriangle, X } from 'lucide-react';
import { SidebarSection } from '@/shared/components/sidebar';
import { Switch } from '@/shared/ui';
import {
  useInstalledSkills,
  useSetSkillEnabled,
  useUninstallSkill,
} from '@/shared/api/skills';

// 单会话最多启用 5 个(与后端 MaxEnabledPerSession 一致);超出后端拒绝且静默不加载,故面板显式限制。
const MAX_ENABLED = 5;

/**
 * 智能助手 · Skill 启用面板(claw 侧栏第三段)。
 *
 * 语义(对齐后端「建会话时冻结」):切换启用只对**新对话**生效,不热切当前会话。
 * UI 明示这一点,并提供「新对话应用」入口。数据 hook 落 shared/api/skills(claw 禁 import features/skills)。
 */
export function ClawSkillPanel({
  onNewConversation,
}: {
  onNewConversation: () => void;
}) {
  const { data: skills, isLoading } = useInstalledSkills();
  const setEnabled = useSetSkillEnabled();
  const uninstall = useUninstallSkill();
  const enabledCount = skills?.filter((s) => s.enabled).length ?? 0;
  const atCap = enabledCount >= MAX_ENABLED;

  return (
    <SidebarSection
      id="claw-skills"
      label={`技能(${enabledCount}/${MAX_ENABLED})`}
      action={
        <Link
          to="/skills"
          className="flex items-center gap-0.5 text-2xs text-brand-green hover:underline"
        >
          市场
          <ArrowRight className="h-3 w-3" />
        </Link>
      }
    >
      <div className="px-4 pb-1.5">
        {isLoading ? (
          <p className="py-1 text-2xs text-faint">加载中…</p>
        ) : (skills?.length ?? 0) === 0 ? (
          <Link
            to="/skills"
            className="flex items-center gap-1.5 rounded-md border border-dashed border-border px-2 py-2 text-2xs text-muted-foreground hover:border-border-strong hover:text-foreground"
          >
            <Sparkles className="h-3.5 w-3.5 text-brand-green" />
            去市场安装技能
          </Link>
        ) : (
          <>
            <ul className="space-y-0.5">
              {skills!.map((s) => (
                <li
                  key={s.skillId}
                  className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-surface-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="truncate text-xs text-subtle">
                        {s.name}
                      </span>
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
                      className="rounded p-0.5 text-faint hover:text-brand-red"
                      onClick={() =>
                        uninstall.mutate(s.skillId, {
                          onError: (e) =>
                            toast.error((e as Error).message || '移除失败'),
                        })
                      }
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <Switch
                      checked={s.enabled}
                      // 到 5 个上限后,未启用项不可再开(后端也会拒);启用项仍可关。
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
                已达 {MAX_ENABLED} 个上限 —— 需先关闭一些才能启用其它技能。
              </p>
            )}
            <p className="mt-1.5 text-2xs leading-relaxed text-faint">
              启用变更仅对新对话生效。
              <button
                onClick={onNewConversation}
                className="ml-1 text-brand-green hover:underline"
              >
                在新对话中应用
              </button>
            </p>
          </>
        )}
      </div>
    </SidebarSection>
  );
}
