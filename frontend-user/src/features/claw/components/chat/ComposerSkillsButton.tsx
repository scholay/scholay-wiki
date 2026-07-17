import { ArrowRight, Puzzle } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/shared/ui/popover';
import { DEFAULT_MAX_ENABLED, useInstalledSkills } from '@/shared/api/skills';
import { ClawSkillList } from '../sidebar/ClawSkillList';

/**
 * 输入框底栏「技能」入口(B2)。
 *
 * 事前声明本会话将启用哪些技能 —— 治「自动触发」的黑盒感(Cursor context-pill 范式:让用户在输入前
 * 就看到这轮带了什么能力)。角标显示已启用数;点开 Popover 内嵌完整启用列表(ClawSkillList)。
 * 桌面与移动端(移动端无侧栏面板,一并补上 B3 缺口)通用。未安装任何技能时仍显示入口(引导去市场)。
 */
export function ComposerSkillsButton({
  onNewConversation,
  disabled,
}: {
  onNewConversation: () => void;
  disabled?: boolean;
}) {
  const { data } = useInstalledSkills();
  const maxEnabled = data?.maxEnabled ?? DEFAULT_MAX_ENABLED;
  const enabledCount = data?.list?.filter((s) => s.enabled).length ?? 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label="技能 —— 本会话将启用的能力"
          title="技能 —— 本会话将启用的能力"
          className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-40"
        >
          <Puzzle className="h-4 w-4" strokeWidth={2.2} />
          {enabledCount > 0 && (
            <span className="text-2xs font-semibold text-brand-green">
              {enabledCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-72 p-0">
        <div className="flex items-center justify-between border-b border-border-soft px-3 py-2">
          <span className="text-xs font-semibold text-foreground">
            技能 · {enabledCount}/{maxEnabled}
          </span>
          <Link
            to="/tools/skills"
            className="flex items-center gap-0.5 text-2xs text-brand-green hover:underline"
          >
            市场
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="px-3 py-2">
          <ClawSkillList onNewConversation={onNewConversation} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
